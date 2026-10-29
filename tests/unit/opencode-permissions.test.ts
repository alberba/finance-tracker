import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regresión de los permisos shell del workflow de reportes web.
 *
 * OpenCode 2.2.0 combina las reglas con `findLast` (gana la última que casa).
 * El shell se parsea con tree-sitter y cada nodo `command` se evalúa por
 * separado; las asignaciones sueltas no son `command`. La función `matches`
 * replica el comparador del binario (`ey`): escapa la mayoría de caracteres
 * regex, convierte `*` en `.*`, `?` en `.` y hace opcional el sufijo ` *`.
 *
 * No se puede expresar un `?` literal en una regla porque el comparador lo
 * convierte en comodín. Por eso el contenido solo puede entrar por una ruta
 * fija (`--body-file .scratch/enricher/comment.md`); un glob o una ruta
 * absoluta no casa con ninguna regla allow.
 */
interface Rule {
  action: string
  resource: string
  effect: 'allow' | 'deny' | 'ask'
}

const ENV: Record<string, string> = {
  GITHUB_WORKSPACE: '/home/runner/work/finance-tracker/finance-tracker',
  GITHUB_REPOSITORY: 'alberba/finance-tracker',
  ISSUE_NUMBER: '12',
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

function shell(command: string): string {
  return evaluate('shell', command)
}

const REPO = 'alberba/finance-tracker'
const COMMENT = '.scratch/enricher/comment.md'

describe('permisos de lectura del enricher web', () => {
  it.each([
    'AGENTS.md',
    'src/lib/server/github-issues.ts',
    'docs/agents/issue-tracker.md',
    '.gitignore',
    '.scratch/enricher/comment.md',
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

describe('permisos shell del enricher web', () => {
  it.each([
    `gh issue view 12 --repo ${REPO}`,
    `gh issue view 12 --repo ${REPO} --json title,body,labels,comments`,
    `gh issue view 12 --repo ${REPO} --json title --jq .title`,
    `gh issue list --repo ${REPO} --state open --json number,title,body,labels`,
    `gh label list --repo ${REPO} --json name`,
    `gh issue comment 12 --repo ${REPO} --body-file ${COMMENT}`,
    `gh issue edit 12 --repo ${REPO} --add-label ready-for-agent`,
    `gh issue edit 12 --repo ${REPO} --remove-label needs-triage`,
    `gh issue edit 12 --repo ${REPO} --add-label feature --remove-label needs-triage`,
    'gh issue comment --help',
    'gh issue create --help',
  ])('permite %s', (command) => {
    expect(shell(command)).toBe('allow')
  })

  it.each([
    ['indirección de variable', `gh issue comment 12 --repo ${REPO} --body "\${!X}"`],
    ['glob en body-file', `gh issue comment 12 --repo ${REPO} --body-file /pro?/self/environ`],
    ['ruta /proc', `gh issue comment 12 --repo ${REPO} --body-file /proc/self/environ`],
    ['ruta del runner', `gh issue comment 12 --repo ${REPO} --body-file /home/runner/work/_temp/x`],
    ['travesía relativa', `gh issue comment 12 --repo ${REPO} --body-file ../proc/self/environ`],
    [
      'travesía tras ruta fija',
      `gh issue comment 12 --repo ${REPO} --body-file ${COMMENT}/../../proc/self/environ`,
    ],
    ['glob en ruta fija', `gh issue comment 12 --repo ${REPO} --body-file .scratch/enricher/*`],
    ['--body inline', `gh issue comment 12 --repo ${REPO} --body "texto"`],
    ['printenv', 'printenv'],
    ['env', 'env'],
    ['cat /proc', 'cat /proc/self/environ'],
    ['base64 /proc', 'base64 /proc/self/environ'],
    ['expansión ${GH_TOKEN}', 'echo ${GH_TOKEN}'],
    ['expansión $GH_TOKEN', 'echo $GH_TOKEN'],
    ['sustitución $(...)', `gh issue comment 12 --repo ${REPO} --body "$(cat /proc/self/environ)"`],
    [
      'sustitución con backticks',
      `gh issue comment 12 --repo ${REPO} --body \`cat /proc/self/environ\``,
    ],
    ['heredoc', `gh issue comment 12 --repo ${REPO} --body-file <<EOF`],
    ['encadenado', `gh issue comment 12 --repo ${REPO} --body-file ${COMMENT} && printenv`],
    ['asignación + indirección', `X=GH_TOKEN; gh issue comment 12 --repo ${REPO} --body "\${!X}"`],
    [
      'edit con body-file',
      `gh issue edit 12 --repo ${REPO} --add-label ready-for-agent --body-file /proc/self/environ`,
    ],
    [
      'edit con body inline',
      `gh issue edit 12 --repo ${REPO} --add-label ready-for-agent --body "x"`,
    ],
    ['body-file en /tmp', `gh issue comment 12 --repo ${REPO} --body-file /tmp/x`],
    ['body-file con ./', `gh issue comment 12 --repo ${REPO} --body-file ./${COMMENT}`],
    ['crear issue', 'gh issue create --title x'],
    ['rm', 'rm -rf .scratch'],
    ['git remote', 'git remote -v'],
    ['otra issue', `gh issue view 13 --repo ${REPO} --json title`],
    ['otro repo', 'gh issue view 12 --repo otro/repo --json title'],
    ['comentar en otro repo', `gh issue comment 12 --repo otro/repo --body-file ${COMMENT}`],
    ['editar otro repo', 'gh issue edit 12 --repo otro/repo --add-label x'],
    ['listar otro repo', 'gh issue list --repo otro/repo'],
    ['labels de otro repo', 'gh label list --repo otro/repo'],
    [
      'comentario exacto con argumentos extra',
      `gh issue comment 12 --repo ${REPO} --body-file ${COMMENT} --body x`,
    ],
    [
      'comentario exacto con texto extra',
      `gh issue comment 12 --repo ${REPO} --body-file ${COMMENT} extra`,
    ],
  ])('deniega %s', (_name, command) => {
    expect(shell(command)).toBe('deny')
  })

  it('deniega la asignación que usa un comando separado con variables', () => {
    // El parser real evalúa el nodo command; la asignación sola no es command.
    expect(shell(`gh issue comment 12 --repo ${REPO} --body "\${GH_TOKEN}"`)).toBe('deny')
  })
})
