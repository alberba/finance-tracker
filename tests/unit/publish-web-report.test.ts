import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  composeEnrichedBody,
  MAX_BODY_BYTES,
  parseLabels,
  publishReport,
  selectLabels,
} from '../../.github/scripts/publish-web-report.mjs'
import { parseReporterId } from '../../scripts/lib/reports-backfill-plan'

const ATTACHMENT = 'https://github.com/user-attachments/assets/captura'
const ORIGINAL_BODY = [
  '## Reporte desde la web',
  '',
  '### Resumen',
  'El filtro no persiste.',
  '',
  '### Adjuntos',
  `![captura](${ATTACHMENT})`,
  '',
  '### Contexto de ejecución',
  '- Ruta: /movimientos',
  '',
  '### Reportero',
  '- Nombre: Ana',
  '- Email: ana@example.com',
  '- Identificador: user-1',
].join('\n')

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'publish-web-report-'))
  mkdirSync(join(root, 'enricher'), { recursive: true })
  return { root, enricher: join(root, 'enricher') }
}

function writeOriginal(root: string, body = ORIGINAL_BODY): string {
  const file = join(root, 'original-body.md')
  writeFileSync(file, body)
  return file
}

describe('composeEnrichedBody', () => {
  it('añade el Reportero auténtico, conserva adjuntos/contexto y quita el inyectado', () => {
    const body = [
      '## Descripción',
      '',
      'Texto enriquecido.',
      '',
      '### Reportero',
      '- Email: inyectado@example.com',
      '- Identificador: falso',
    ].join('\n')

    const composed = composeEnrichedBody(body, ORIGINAL_BODY)

    expect(composed).toContain('Texto enriquecido.')
    expect(composed).toContain(`![captura](${ATTACHMENT})`)
    expect(composed).toContain('### Contexto de ejecución')
    expect(composed).toContain('- Identificador: user-1')
    expect(composed).not.toContain('inyectado@example.com')
    expect(composed).not.toContain('Identificador: falso')
    expect(composed.match(/^### Reportero$/gm)).toHaveLength(1)
  })

  it('no duplica adjuntos ni contexto que el agente ya conservó', () => {
    const body = [
      '## Descripción',
      '',
      'Texto.',
      '',
      '### Adjuntos',
      `![captura](${ATTACHMENT})`,
      '',
      '### Contexto de ejecución',
      '- Ruta: /movimientos',
    ].join('\n')

    const composed = composeEnrichedBody(body, ORIGINAL_BODY)

    expect(composed.match(/^### Adjuntos$/gm)).toHaveLength(1)
    expect(composed.match(/^### Contexto de ejecución$/gm)).toHaveLength(1)
    expect(composed.match(new RegExp(ATTACHMENT, 'g'))).toHaveLength(1)
  })

  it('añade las imágenes que falten aunque el agente conserve otras', () => {
    const body = [
      '## Descripción',
      '',
      'Texto.',
      '',
      '### Adjuntos',
      '![otra](https://github.com/user-attachments/assets/otra)',
    ].join('\n')

    const composed = composeEnrichedBody(body, ORIGINAL_BODY)

    expect(composed).toContain('### Adjuntos')
    expect(composed).toContain('assets/otra')
    expect(composed).toContain('assets/captura')
  })

  it('usa el último bloque Reportero, como el backfill', () => {
    const original = [
      '### Reportero',
      '- Identificador: falso',
      '',
      '### Reportero',
      '- Identificador: real',
    ].join('\n')

    const composed = composeEnrichedBody('## Descripción\n\nTexto.', original)

    expect(composed).toContain('Identificador: real')
    expect(composed).not.toContain('Identificador: falso')
    expect(composed.match(/^### Reportero$/gm)).toHaveLength(1)
  })

  it('conserva el marcador histórico si existe en el cuerpo original', () => {
    const original = ['<!-- web-report-enriched -->', '', ORIGINAL_BODY].join('\n')
    const composed = composeEnrichedBody('## Descripción\n\nTexto.', original)
    expect(composed.startsWith('<!-- web-report-enriched -->')).toBe(true)
  })

  it('el cuerpo compuesto sigue siendo válido para el backfill de #340', () => {
    const body = [
      '## Descripción',
      '',
      'Texto.',
      '',
      '### Reportero',
      '- Identificador: falso',
    ].join('\n')

    const composed = composeEnrichedBody(body, ORIGINAL_BODY)

    expect(parseReporterId(composed)).toEqual({ ok: true, userId: 'user-1' })
  })
})

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
  it('publica body compuesto, comment y solo los labels existentes', () => {
    const { root, enricher } = workspace()
    const originalBodyPath = writeOriginal(root)
    const bodyFile = join(enricher, 'body.md')
    writeFileSync(
      bodyFile,
      '## Descripción\n\nCuerpo enriquecido.\n\n### Reportero\n- Email: inyectado@example.com',
    )
    writeFileSync(join(enricher, 'comment.md'), '## Agent Brief\n\n- [ ] Criterio.')
    writeFileSync(join(enricher, 'labels.txt'), 'feature\nmissing\nbad;label\nready-for-agent\n')
    const calls: string[][] = []
    const gh = vi.fn((args: string[]) => {
      calls.push(args)
      if (args[0] === 'label')
        return JSON.stringify([{ name: 'feature' }, { name: 'ready-for-agent' }])
      return ''
    })

    const result = publishReport({
      repository: 'org/repo',
      issueNumber: 12,
      root: enricher,
      originalBodyPath,
      gh,
    })

    expect(result).toEqual({
      body: true,
      comment: true,
      labels: ['feature', 'ready-for-agent'],
      rejected: ['missing', 'bad;label'],
    })
    expect(calls).toEqual([
      ['label', 'list', '--repo', 'org/repo', '--limit', '1000', '--json', 'name'],
      ['issue', 'edit', '12', '--repo', 'org/repo', '--body-file', bodyFile],
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

    const published = readFileSync(bodyFile, 'utf8')
    expect(published).toContain('- Identificador: user-1')
    expect(published).toContain(ATTACHMENT)
    expect(published).not.toContain('inyectado@example.com')
    expect(published.match(/^### Reportero$/gm)).toHaveLength(1)
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

  it('falla si hay body.md pero no cuerpo original', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'body.md'), '## Descripción\n\nTexto.')
    const gh = vi.fn()
    expect(() =>
      publishReport({ repository: 'org/repo', issueNumber: 12, root: enricher, gh }),
    ).toThrow('cuerpo original')
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
