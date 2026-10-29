import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  MAX_BODY_BYTES,
  parseLabels,
  publishReport,
  selectLabels,
} from '../../.github/scripts/publish-web-report.mjs'

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'publish-web-report-'))
  mkdirSync(join(root, 'enricher'), { recursive: true })
  return { root, enricher: join(root, 'enricher') }
}

describe('parseLabels y selectLabels', () => {
  it('recorta, elimina vacíos y deduplica', () => {
    expect(parseLabels(' feature\n\nneeds-triage\nfeature\n')).toEqual(['feature', 'needs-triage'])
  })

  it('rechaza más de 50 labels', () => {
    expect(() =>
      parseLabels(Array.from({ length: 51 }, (_, i) => `label-${i}`).join('\n')),
    ).toThrow('50')
  })

  it('solo acepta labels con forma válida y existentes', () => {
    expect(selectLabels(['feature', 'missing', 'bad;label'], new Set(['feature']))).toEqual({
      accepted: ['feature'],
      rejected: ['missing', 'bad;label'],
    })
  })
})

describe('publicación de los ficheros del agente', () => {
  it('publica body, comment y solo los labels existentes', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'body.md'), '## Descripción\n\nCuerpo enriquecido.')
    writeFileSync(join(enricher, 'comment.md'), '## Agent Brief\n\n- [ ] Criterio.')
    writeFileSync(join(enricher, 'labels.txt'), 'feature\nmissing\nbad;label\nready-for-agent\n')
    const calls: string[][] = []
    const gh = vi.fn((args: string[]) => {
      calls.push(args)
      if (args[0] === 'label')
        return JSON.stringify([{ name: 'feature' }, { name: 'ready-for-agent' }])
      return ''
    })

    const result = publishReport({ repository: 'org/repo', issueNumber: 12, root: enricher, gh })

    expect(result).toEqual({
      body: true,
      comment: true,
      labels: ['feature', 'ready-for-agent'],
      rejected: ['missing', 'bad;label'],
    })
    expect(calls).toEqual([
      ['label', 'list', '--repo', 'org/repo', '--limit', '1000', '--json', 'name'],
      ['issue', 'edit', '12', '--repo', 'org/repo', '--body-file', join(enricher, 'body.md')],
      ['issue', 'comment', '12', '--repo', 'org/repo', '--body-file', join(enricher, 'comment.md')],
      [
        'issue',
        'edit',
        '12',
        '--repo',
        'org/repo',
        '--add-label',
        'feature',
        '--add-label',
        'ready-for-agent',
      ],
    ])
    expect(calls.flat()).not.toContain('--body')
    expect(calls.flat()).not.toContain('--title')
  })

  it('no llama a gh si no hay ficheros', () => {
    const { enricher } = workspace()
    const gh = vi.fn()
    expect(publishReport({ repository: 'org/repo', issueNumber: 12, root: enricher, gh })).toEqual({
      body: false,
      comment: false,
      labels: [],
      rejected: [],
    })
    expect(gh).not.toHaveBeenCalled()
  })

  it('rechaza un body demasiado grande antes de publicar', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'body.md'), 'a'.repeat(MAX_BODY_BYTES + 1))
    const gh = vi.fn()
    expect(() =>
      publishReport({ repository: 'org/repo', issueNumber: 12, root: enricher, gh }),
    ).toThrow('supera')
    expect(gh).not.toHaveBeenCalled()
  })

  it('no publica labels si todos se rechazan', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'labels.txt'), 'missing\nbad;label\n')
    const gh = vi.fn((args: string[]) => {
      if (args[0] === 'label') return JSON.stringify([{ name: 'feature' }])
      return ''
    })
    const result = publishReport({ repository: 'org/repo', issueNumber: 12, root: enricher, gh })
    expect(result).toEqual({
      body: false,
      comment: false,
      labels: [],
      rejected: ['missing', 'bad;label'],
    })
    expect(gh.mock.calls.map(([args]) => args)).toEqual([
      ['label', 'list', '--repo', 'org/repo', '--limit', '1000', '--json', 'name'],
    ])
  })
})
