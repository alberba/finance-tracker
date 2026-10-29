import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(resolve('.github/workflows/enrich-web-issue.yml'), 'utf8')
const lines = workflow.split(/\r?\n/)

function step(name: string): string {
  const marker = `      - name: ${name}`
  const start = lines.findIndex((line) => line === marker)
  if (start < 0) throw new Error(`No existe el paso ${name}`)
  const next = lines.findIndex((line, index) => index > start && line.startsWith('      - name:'))
  return lines.slice(start, next < 0 ? lines.length : next).join('\n')
}

describe('workflow de reportes web', () => {
  it('el paso de OpenCode no define tokens de GitHub', () => {
    const analyze = step('Analyze with create-issue')
    expect(analyze).toContain('OPENCODE_GO_API_KEY')
    expect(analyze).not.toMatch(/^\s+(GH_TOKEN|GITHUB_TOKEN):/m)
    expect(analyze).not.toContain('github.token')
    expect(analyze).not.toContain('secrets.GITHUB_TOKEN')
    expect([...analyze.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((match) => match[1])).toEqual([
      'OPENCODE_GO_API_KEY',
    ])
    expect(analyze).toContain('unset GH_TOKEN GITHUB_TOKEN')
  })

  it('ni el job ni el workflow definen tokens de GitHub en env', () => {
    const jobs = lines.findIndex((line) => line === 'jobs:')
    expect(lines.slice(0, jobs).join('\n')).not.toMatch(/^env:/m)

    const enrich = lines.findIndex((line) => line === '  enrich:')
    const steps = lines.findIndex((line, index) => index > enrich && line === '    steps:')
    const job = lines.slice(enrich, steps).join('\n')
    expect(job).not.toMatch(/GH_TOKEN|GITHUB_TOKEN/)
    expect(job).not.toContain('github.token')
  })

  it('los pasos con gh reciben el token solo en su propio env', () => {
    expect(step('Fetch report for OpenCode')).toMatch(/^\s+GH_TOKEN:/m)
    expect(step('Publish enriched report')).toMatch(/^\s+GH_TOKEN:/m)
  })

  it('el issue.json no reenvía logins ni marcadores de reportero', () => {
    expect(workflow).toContain('gsub("<!-- finance-tracker:reporter-comment user=')
    expect(workflow).not.toMatch(/comments: \[\.comments\[\] \| \{ author:/)
  })

  it('el checkout no persiste credenciales', () => {
    expect(workflow).toContain('actions/checkout@v7')
    expect(workflow).toContain('persist-credentials: false')
  })
})
