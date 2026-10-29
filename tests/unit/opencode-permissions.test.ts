import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regresión de los permisos de OpenCode del workflow de reportes web.
 *
 * OpenCode 2.2.0 combina las reglas con `findLast` (gana la última que casa).
 * La función `matches` replica el comparador del binario (`ey`): escapa la
 * mayoría de caracteres regex, convierte `*` en `.*`, `?` en `.` y hace
 * opcional el sufijo ` *`.
 *
 * El diseño no concede shell: el paso previo del workflow lee la issue y el
 * posterior publica los ficheros. El agente solo puede leer el checkout y
 * escribir en `.scratch/enricher/`.
 */
interface Rule {
  action: string
  resource: string
  effect: 'allow' | 'deny' | 'ask'
}

const ENV: Record<string, string> = {
  GITHUB_WORKSPACE: '/home/runner/work/finance-tracker/finance-tracker',
}

const config = JSON.parse(
  readFileSync(resolve('.github/opencode-issue-enricher.json'), 'utf8'),
) as { permissions: Rule[] }

const rules = config.permissions.map((rule) => ({
  ...rule,
  resource: rule.resource.replace(/\{env:([A-Z0-9_]+)\}/g, (_, name: string) => ENV[name] ?? ''),
}))

function matches(value: string, pattern: string): boolean {
  const resource = value.replaceAll('\\', '/')
  let source = pattern
    .replaceAll('\\', '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  if (source.endsWith(' .*')) source = source.slice(0, -3) + '( .*)?'
  return new RegExp('^' + source + '$', 's').test(resource)
}

function evaluate(action: string, resource: string): string {
  const rule = rules.findLast(
    (candidate) => matches(action, candidate.action) && matches(resource, candidate.resource),
  )
  return rule?.effect ?? 'ask'
}

describe('shell denegado por completo', () => {
  it.each([
    'gh issue view 12 --repo alberba/finance-tracker --json title --jq env.GH_TOKEN',
    'gh issue edit 12 --repo alberba/finance-tracker --add-label x -F /pro?/self/environ',
    'gh issue edit 12 --repo alberba/finance-tracker --add-label x -b texto',
    'gh issue edit 12 --repo alberba/finance-tracker --add-label x --title texto',
    'gh issue comment 12 --repo alberba/finance-tracker --body-file .scratch/enricher/comment.md',
    'gh issue view 12 --repo alberba/finance-tracker --json title,body,labels,comments',
    'gh issue list --repo alberba/finance-tracker',
    'gh label list --repo alberba/finance-tracker',
    'gh issue create --title x',
    'printenv',
    'env',
    'cat /proc/self/environ',
    'base64 /proc/self/environ',
    'echo ${GH_TOKEN}',
    'echo $GH_TOKEN',
    'gh issue view 12 --repo alberba/finance-tracker --json title --jq "$(cat /proc/self/environ)"',
    'gh issue view 12 --repo alberba/finance-tracker --json title --jq `cat /proc/self/environ`',
    'gh issue edit 12 --repo alberba/finance-tracker --body-file <<EOF',
    'gh issue comment 12 --repo alberba/finance-tracker --body-file .scratch/enricher/comment.md && printenv',
    'X=GH_TOKEN; gh issue comment 12 --repo alberba/finance-tracker --body "${!X}"',
    'rm -rf .scratch',
    'git remote -v',
  ])('deniega %s', (command) => {
    expect(evaluate('shell', command)).toBe('deny')
  })
})

describe('lectura confinada al checkout', () => {
  it.each([
    'AGENTS.md',
    'src/lib/server/github-issues.ts',
    'docs/agents/issue-tracker.md',
    '.gitignore',
    '.scratch/enricher/issue.json',
    '.scratch/enricher/body.md',
    '/home/runner/work/finance-tracker/finance-tracker/src/lib/server/github-issues.ts',
    '/home/runner/work/finance-tracker/finance-tracker/.github/workflows/enrich-web-issue.yml',
  ])('permite %s', (resource) => {
    expect(evaluate('read', resource)).toBe('allow')
  })

  it.each([
    '/proc/self/environ',
    '/home/runner/work/otro/repo/secreto',
    '/etc/passwd',
    '/tmp/x',
    '~/.ssh/id_rsa',
    '../../etc/passwd',
    'docs/../../etc/passwd',
    '.git/config',
    '.dev.vars',
    '.env',
    'src/.env.local',
    '/home/runner/work/finance-tracker/finance-tracker/.git/config',
    '/home/runner/work/finance-tracker/finance-tracker/.dev.vars',
    '/home/runner/work/finance-tracker/finance-tracker/src/.env',
  ])('deniega %s', (resource) => {
    expect(evaluate('read', resource)).toBe('deny')
  })
})

describe('acceso externo denegado', () => {
  it.each(['/proc/*', '/home/runner/work/otro/*', '/etc/*', '/tmp/*', '~/*'])(
    'deniega %s',
    (resource) => {
      expect(evaluate('external_directory', resource)).toBe('deny')
    },
  )
})

describe('grep y glob confinados', () => {
  it.each([
    ['grep', 'GH_TOKEN'],
    ['grep', 'create-issue'],
    ['glob', 'src/**/*.ts'],
    ['glob', '.scratch/enricher/*.md'],
  ])('permite %s %s', (action, pattern) => {
    expect(evaluate(action, pattern)).toBe('allow')
  })

  it.each([
    ['grep', '/proc/self/environ'],
    ['grep', '~/.ssh'],
    ['grep', '../../etc'],
    ['glob', '/proc/*'],
    ['glob', '~/*'],
    ['glob', '../*'],
  ])('deniega %s %s', (action, pattern) => {
    expect(evaluate(action, pattern)).toBe('deny')
  })
})

describe('escritura confinada a .scratch/enricher', () => {
  it.each([
    '.scratch/enricher/body.md',
    '.scratch/enricher/comment.md',
    '.scratch/enricher/labels.txt',
    '/home/runner/work/finance-tracker/finance-tracker/.scratch/enricher/body.md',
  ])('permite %s', (resource) => {
    expect(evaluate('edit', resource)).toBe('allow')
  })

  it.each([
    'src/lib/server/github-issues.ts',
    'AGENTS.md',
    '.scratch/other/body.md',
    '.scratch/enricher/../body.md',
    '../../body.md',
    '/tmp/body.md',
    '~/.ssh/id_rsa',
    '/home/runner/work/finance-tracker/finance-tracker/src/body.md',
  ])('deniega %s', (resource) => {
    expect(evaluate('edit', resource)).toBe('deny')
  })
})
