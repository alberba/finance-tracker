import { describe, expect, it } from 'vitest'

import {
  parseReportMarkdown,
  REPORT_MARKDOWN_MAX_LENGTH,
  type BlockNode,
  type InlineNode,
} from '../../src/domain/reports/report-markdown'

function inlines(blocks: BlockNode[]): InlineNode[] {
  const first = blocks[0]
  if (!first || first.type !== 'paragraph') throw new Error('Se esperaba un párrafo')
  return first.children
}

function textOf(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value
      if (node.type === 'code') return node.value
      if (node.type === 'image') return node.alt
      return textOf(node.children)
    })
    .join('')
}

describe('parseReportMarkdown', () => {
  it('devuelve un párrafo vacío para una entrada vacía', () => {
    expect(parseReportMarkdown('   ')).toEqual([])
  })

  it('trata el HTML crudo como texto literal', () => {
    const nodes = inlines(parseReportMarkdown('<script>alert(1)</script>'))
    expect(nodes).toEqual([{ type: 'text', value: '<script>alert(1)</script>' }])
  })

  it('no interpreta comentarios HTML', () => {
    expect(textOf(inlines(parseReportMarkdown('antes <!-- oculto --> después')))).toBe(
      'antes <!-- oculto --> después',
    )
  })

  it('renderiza negrita, cursiva, tachado y código', () => {
    const nodes = inlines(parseReportMarkdown('**fuerte** _suave_ ~~viejo~~ `código`'))
    expect(nodes.map((node) => node.type)).toEqual([
      'strong',
      'text',
      'em',
      'text',
      'del',
      'text',
      'code',
    ])
  })

  it('acepta enlaces http y https', () => {
    const [link] = inlines(parseReportMarkdown('[ejemplo](https://example.com/a)'))
    expect(link).toMatchObject({ type: 'link', href: 'https://example.com/a' })
  })

  it('deja como texto un enlace javascript:', () => {
    const nodes = inlines(parseReportMarkdown('[malo](javascript:alert(1))'))
    expect(textOf(nodes)).toContain('javascript')
    expect(nodes.some((node) => node.type === 'link')).toBe(false)
  })

  it('incrusta imágenes solo de hosts de GitHub', () => {
    const allowed = inlines(
      parseReportMarkdown('![captura](https://github.com/user-attachments/assets/1)'),
    )
    expect(allowed[0]).toMatchObject({ type: 'image', alt: 'captura' })

    const degraded = inlines(parseReportMarkdown('![x](https://example.com/x.png)'))
    expect(degraded[0]).toMatchObject({ type: 'link', href: 'https://example.com/x.png' })

    const unsafe = inlines(parseReportMarkdown('![x](data:image/png;base64,AAAA)'))
    expect(unsafe.some((node) => node.type === 'image')).toBe(false)
  })

  it('no autoconvierte #123 ni @usuario en enlaces', () => {
    const nodes = inlines(parseReportMarkdown('Ver #123 y avisar a @ana'))
    expect(nodes.every((node) => node.type === 'text')).toBe(true)
  })

  it('parsea encabezados, listas, citas, código y reglas', () => {
    const blocks = parseReportMarkdown(
      [
        '# Título',
        '',
        '- uno',
        '- dos',
        '',
        '> cita',
        '',
        '```ts',
        'const a = 1',
        '```',
        '',
        '---',
      ].join('\n'),
    )
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'list', 'quote', 'code', 'rule'])
  })

  it('anida listas simples por sangría', () => {
    const [list] = parseReportMarkdown(['- uno', '  - uno y medio', '- dos'].join('\n'))
    if (list.type !== 'list') throw new Error('Se esperaba una lista')
    expect(list.items.map((item) => item.depth)).toEqual([0, 1, 0])
  })

  it('no recorta una aclaración de 20 001 caracteres', () => {
    const blocks = parseReportMarkdown('a'.repeat(20_001))
    expect(textOf(inlines(blocks))).toHaveLength(20_001)
  })

  it('corta entradas patológicas al límite', () => {
    const blocks = parseReportMarkdown('a'.repeat(REPORT_MARKDOWN_MAX_LENGTH + 50))
    expect(textOf(inlines(blocks))).toHaveLength(REPORT_MARKDOWN_MAX_LENGTH)
  })

  it('no revienta con anidación profunda', () => {
    const source = `${'*'.repeat(40)}texto${'*'.repeat(40)}`
    expect(() => parseReportMarkdown(source)).not.toThrow()
  })

  it('limita las citas anidadas y degrada el exceso a texto', () => {
    const source = `${'> '.repeat(2_000)}hola`
    let blocks: BlockNode[] = []
    expect(() => {
      blocks = parseReportMarkdown(source)
    }).not.toThrow()

    let depth = 0
    let current = blocks
    while (current[0]?.type === 'quote') {
      depth += 1
      current = current[0].blocks
    }

    expect(depth).toBe(4)
    // El resto de marcadores queda como texto, sin más bloques de cita.
    expect(current[0]).toMatchObject({ type: 'paragraph' })
    expect(textOf(inlines(current))).toContain('hola')
  })
})
