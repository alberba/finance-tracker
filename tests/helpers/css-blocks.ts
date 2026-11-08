/**
 * A small CSS reader for guards: it lists every block (`prelude { … }`) with the
 * preludes that enclose it and the statements directly inside it, and the
 * top-level statements (`@import …;`). It understands comments and quoted
 * strings, not the whole language: enough to answer "which selectors does this
 * sheet style" without a parser dependency.
 */

export interface CssBlock {
  /** Selector list or at-rule head: `[data-ui='neon'], …`, `@layer base`. */
  prelude: string
  /** Preludes of the blocks around this one, outermost first. */
  ancestors: string[]
  /** Statements directly inside the block: `--x: 1`, `color: red`. */
  declarations: string[]
}

export interface ParsedCss {
  blocks: CssBlock[]
  /** Statements outside any block: `@import 'x'`, `@custom-variant …`. */
  statements: string[]
}

export function parseCss(css: string): ParsedCss {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks: CssBlock[] = []
  const statements: string[] = []
  const stack: CssBlock[] = []
  let buffer = ''
  let quote = ''

  const enclosing = () => stack[stack.length - 1]

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      buffer += char
      if (char === '\\') buffer += text[++index] ?? ''
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
      buffer += char
    } else if (char === '{') {
      const block = {
        prelude: buffer.trim(),
        ancestors: stack.map((open) => open.prelude),
        declarations: [],
      }
      blocks.push(block)
      stack.push(block)
      buffer = ''
    } else if (char === '}') {
      if (buffer.trim()) enclosing()?.declarations.push(buffer.trim())
      stack.pop()
      buffer = ''
    } else if (char === ';') {
      const statement = buffer.trim()
      buffer = ''
      if (!statement) continue
      if (enclosing()) enclosing().declarations.push(statement)
      else statements.push(statement)
    } else {
      buffer += char
    }
  }

  return { blocks, statements }
}

/** Names of the custom properties (`--x`) declared directly in a block. */
export function declaredCustomProperties(block: CssBlock): string[] {
  return block.declarations
    .map((declaration) => declaration.match(/^(--[\w-]+)\s*:/)?.[1])
    .filter((name): name is string => Boolean(name))
}
