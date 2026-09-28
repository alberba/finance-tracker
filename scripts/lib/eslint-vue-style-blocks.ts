import type { Linter } from 'eslint'

/**
 * ESLint processor that lints the `<style>` blocks of Vue SFCs as CSS.
 *
 * The SFC itself goes through untouched (vue-eslint-parser keeps linting
 * script and template); each plain-CSS `<style>` block becomes a virtual
 * `<file>.vue/<n>_style.css`, so the `**\/*.css` config (@eslint/css with
 * Tailwind 4 syntax) applies to it. Positions and fixes are mapped back to the
 * SFC. Blocks with a `lang` other than css are skipped.
 *
 * It wraps eslint-plugin-vue's own processor, which resolves the
 * `<!-- eslint-disable -->` comments of the template.
 */

type StyleBlock = { start: number; line: number; column: number }

const STYLE_BLOCK = /<style\b([^>]*)>([\s\S]*?)<\/style>/g
const blocksByFile = new Map<string, StyleBlock[]>()

function isPlainCss(attributes: string): boolean {
  const lang = attributes.match(/\blang\s*=\s*["']([^"']+)["']/)
  return !lang || lang[1] === 'css'
}

function positionOf(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - before.lastIndexOf('\n') }
}

function shiftMessage(message: Linter.LintMessage, block: StyleBlock): Linter.LintMessage {
  const shiftColumn = (line: number, column: number) =>
    line === 1 ? column + block.column - 1 : column
  const shifted: Linter.LintMessage = {
    ...message,
    line: message.line + block.line - 1,
    column: shiftColumn(message.line, message.column),
  }
  if (message.endLine !== undefined && message.endColumn !== undefined) {
    shifted.endLine = message.endLine + block.line - 1
    shifted.endColumn = shiftColumn(message.endLine, message.endColumn)
  }
  const shiftFix = (fix: Linter.LintMessage['fix']) =>
    fix && {
      ...fix,
      range: [fix.range[0] + block.start, fix.range[1] + block.start] as [number, number],
    }
  if (message.fix) shifted.fix = shiftFix(message.fix)
  if (message.suggestions) {
    shifted.suggestions = message.suggestions.map((suggestion) => ({
      ...suggestion,
      fix: shiftFix(suggestion.fix)!,
    }))
  }
  return shifted
}

export function withVueStyleBlocks(sfcProcessor: Linter.Processor): Linter.Processor {
  return {
    meta: { name: 'vue-style-blocks' },
    supportsAutofix: true,
    preprocess(text, filename) {
      const blocks: StyleBlock[] = []
      const virtualFiles: Linter.ProcessorFile[] = []
      for (const match of text.matchAll(STYLE_BLOCK)) {
        if (!isPlainCss(match[1])) continue
        const start = match.index + match[0].indexOf('>') + 1
        blocks.push({ start, ...positionOf(text, start) })
        virtualFiles.push({ text: match[2], filename: 'style.css' })
      }
      blocksByFile.set(filename, blocks)
      return [text, ...virtualFiles]
    },
    postprocess(messageLists, filename) {
      const blocks = blocksByFile.get(filename) ?? []
      blocksByFile.delete(filename)
      const [sfcMessages = [], ...styleMessages] = messageLists
      return [
        ...(sfcProcessor.postprocess?.([sfcMessages], filename) ?? sfcMessages),
        ...styleMessages.flatMap((messages, index) =>
          messages.map((message) => shiftMessage(message, blocks[index])),
        ),
      ]
    },
  }
}
