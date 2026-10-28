/**
 * Parser Markdown mínimo para las aclaraciones de un reporte (#340, [D3]).
 *
 * Produce un AST y el render Vue lo recorre sin `v-html`: el HTML crudo del
 * texto es texto literal, los enlaces solo admiten `http(s)` y las imágenes
 * solo hosts de GitHub. Sin dependencias y sin superficie XSS.
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'del'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'image'; src: string; alt: string }

export interface MarkdownListItem {
  depth: number
  children: InlineNode[]
}

export type BlockNode =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'heading'; level: number; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: MarkdownListItem[] }
  | { type: 'quote'; blocks: BlockNode[] }
  | { type: 'code'; language: string | null; value: string }
  | { type: 'rule' }

/** Límite del cuerpo de un comentario en GitHub: 65 536 caracteres. */
export const REPORT_MARKDOWN_MAX_LENGTH = 65_536
export const REPORT_MARKDOWN_MAX_DEPTH = 4

const SAFE_LINK_PROTOCOL = /^https?:\/\//i
const FENCE = /^(```|~~~)\s*([^\s`]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/

export function isSafeLink(value: string): boolean {
  return SAFE_LINK_PROTOCOL.test(value.trim())
}

/** Hosts que se aceptan para incrustar una imagen; el resto se degrada a enlace. */
export function isAllowedImageHost(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (url.hostname === 'github.com') return url.pathname.startsWith('/user-attachments/')
    return (
      url.hostname === 'githubusercontent.com' || url.hostname.endsWith('.githubusercontent.com')
    )
  } catch {
    return false
  }
}

function text(value: string): InlineNode {
  return { type: 'text', value }
}

function findClosing(source: string, needle: string, from: number): number {
  return source.indexOf(needle, from)
}

function parseImage(
  source: string,
  start: number,
  depth: number,
): { node: InlineNode; end: number } | null {
  const labelEnd = source.indexOf(']', start + 2)
  if (labelEnd === -1 || source[labelEnd + 1] !== '(') return null
  const urlEnd = source.indexOf(')', labelEnd + 2)
  if (urlEnd === -1) return null
  const alt = source.slice(start + 2, labelEnd)
  const url = source.slice(labelEnd + 2, urlEnd).trim()
  if (isAllowedImageHost(url)) {
    return { node: { type: 'image', src: url, alt }, end: urlEnd + 1 }
  }
  // Una imagen de un host no permitido nunca se incrusta: queda como enlace.
  if (isSafeLink(url)) {
    return {
      node: { type: 'link', href: url, children: parseInline(alt, depth + 1) },
      end: urlEnd + 1,
    }
  }
  return { node: text(alt || url), end: urlEnd + 1 }
}

function parseLink(
  source: string,
  start: number,
  depth: number,
): { node: InlineNode; end: number } | null {
  const labelEnd = source.indexOf(']', start + 1)
  if (labelEnd === -1 || source[labelEnd + 1] !== '(') return null
  const urlEnd = source.indexOf(')', labelEnd + 2)
  if (urlEnd === -1) return null
  const label = source.slice(start + 1, labelEnd)
  const url = source.slice(labelEnd + 2, urlEnd).trim()
  if (!isSafeLink(url)) {
    return { node: text(source.slice(start, urlEnd + 1)), end: urlEnd + 1 }
  }
  return {
    node: { type: 'link', href: url, children: parseInline(label, depth + 1) },
    end: urlEnd + 1,
  }
}

function parseDelimited(
  source: string,
  start: number,
  delimiter: string,
  type: 'strong' | 'em' | 'del',
  depth: number,
): { node: InlineNode; end: number } | null {
  const next = source[start + delimiter.length]
  // Un delimitador seguido de espacio no abre énfasis.
  if (next === undefined || /\s/.test(next)) return null
  const closing = findClosing(source, delimiter, start + delimiter.length + 1)
  if (closing === -1) return null
  return {
    node: {
      type,
      children: parseInline(source.slice(start + delimiter.length, closing), depth + 1),
    },
    end: closing + delimiter.length,
  }
}

export function parseInline(source: string, depth = 0): InlineNode[] {
  if (!source) return []
  if (depth > REPORT_MARKDOWN_MAX_DEPTH) return [text(source)]

  const nodes: InlineNode[] = []
  let buffer = ''
  let index = 0

  const flush = () => {
    if (buffer) {
      nodes.push(text(buffer))
      buffer = ''
    }
  }

  while (index < source.length) {
    const char = source[index]
    let parsed: { node: InlineNode; end: number } | null = null

    if (char === '`') {
      const closing = source.indexOf('`', index + 1)
      if (closing > index + 1) {
        flush()
        nodes.push({ type: 'code', value: source.slice(index + 1, closing) })
        index = closing + 1
        continue
      }
    } else if (source.startsWith('![', index)) {
      parsed = parseImage(source, index, depth)
    } else if (char === '[') {
      parsed = parseLink(source, index, depth)
    } else if (source.startsWith('**', index) || source.startsWith('__', index)) {
      parsed = parseDelimited(source, index, source.slice(index, index + 2), 'strong', depth)
    } else if (source.startsWith('~~', index)) {
      parsed = parseDelimited(source, index, '~~', 'del', depth)
    } else if (char === '*') {
      parsed = parseDelimited(source, index, '*', 'em', depth)
    } else if (char === '_') {
      const previous = source[index - 1]
      if (previous === undefined || /[\s([{.,;:!?]/.test(previous)) {
        parsed = parseDelimited(source, index, '_', 'em', depth)
      }
    }

    if (parsed) {
      flush()
      nodes.push(parsed.node)
      index = parsed.end
      continue
    }

    buffer += char
    index += 1
  }

  flush()
  return nodes
}

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    LIST_ITEM.test(line) ||
    QUOTE.test(line)
  )
}

function parseBlocks(lines: string[]): BlockNode[] {
  const blocks: BlockNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const [, marker, language] = fence
      const content: string[] = []
      index += 1
      while (index < lines.length && lines[index].trim() !== marker) {
        content.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: language || null, value: content.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        children: parseInline(heading[2].trim()),
      })
      index += 1
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (QUOTE.test(line)) {
      const content: string[] = []
      while (index < lines.length) {
        const quote = QUOTE.exec(lines[index])
        if (!quote) break
        content.push(quote[1])
        index += 1
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(content) })
      continue
    }

    const listItem = LIST_ITEM.exec(line)
    if (listItem) {
      const ordered = /\d/.test(listItem[2])
      const items: MarkdownListItem[] = []
      while (index < lines.length) {
        const current = LIST_ITEM.exec(lines[index])
        if (!current) break
        if (/\d/.test(current[2]) !== ordered) break
        const indent = current[1].replace(/\t/g, '  ').length
        items.push({
          depth: Math.min(Math.floor(indent / 2), 2),
          children: parseInline(current[3].trim()),
        })
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) })
  }

  return blocks
}

export function parseReportMarkdown(source: string): BlockNode[] {
  const normalized = (source ?? '').replace(/\r\n?/g, '\n').slice(0, REPORT_MARKDOWN_MAX_LENGTH)
  if (!normalized.trim()) return []
  return parseBlocks(normalized.split('\n'))
}
