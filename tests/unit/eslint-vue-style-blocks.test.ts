import type { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { withVueStyleBlocks } from '../../scripts/lib/eslint-vue-style-blocks'

const passthrough: Linter.Processor = {
  preprocess: (text) => [text],
  postprocess: (messages) => messages[0],
}

const SFC = [
  '<template><p class="x">hi</p></template>',
  '<style scoped>',
  '.x {',
  '  widht: 3px;',
  '}',
  '</style>',
  '<style lang="scss">',
  '.y { color: red; }',
  '</style>',
].join('\n')

function message(overrides: Partial<Linter.LintMessage>): Linter.LintMessage {
  return { ruleId: 'css/rule', message: 'm', severity: 2, line: 1, column: 1, ...overrides }
}

describe('withVueStyleBlocks', () => {
  it('exposes the SFC untouched plus each plain-CSS style block as a .css file', () => {
    const blocks = withVueStyleBlocks(passthrough).preprocess!(SFC, 'A.vue')

    expect(blocks).toEqual([SFC, { text: '\n.x {\n  widht: 3px;\n}\n', filename: 'style.css' }])
  })

  it('maps style-block positions and fixes back onto the SFC', () => {
    const processor = withVueStyleBlocks(passthrough)
    processor.preprocess!(SFC, 'A.vue')
    const blockStart = SFC.indexOf('<style scoped>') + '<style scoped>'.length

    const [shifted] = processor.postprocess!(
      [
        [],
        [
          message({
            line: 3,
            column: 3,
            endLine: 3,
            endColumn: 8,
            fix: { range: [8, 13], text: 'width' },
          }),
        ],
      ],
      'A.vue',
    )

    expect(shifted).toMatchObject({ line: 4, column: 3, endLine: 4, endColumn: 8 })
    expect(shifted.fix).toEqual({ range: [blockStart + 8, blockStart + 13], text: 'width' })
    expect(SFC.slice(blockStart + 8, blockStart + 13)).toBe('widht')
  })

  it('offsets the column of a message on the opening line of the block', () => {
    const sfc = '<style>.x { widht: 1px }</style>'
    const processor = withVueStyleBlocks(passthrough)
    processor.preprocess!(sfc, 'B.vue')

    const [shifted] = processor.postprocess!([[], [message({ line: 1, column: 6 })]], 'B.vue')

    expect(shifted).toMatchObject({ line: 1, column: 13 })
    expect(sfc.slice(12, 17)).toBe('widht')
  })

  it('runs the SFC messages through the wrapped processor', () => {
    const dropAll: Linter.Processor = { ...passthrough, postprocess: () => [] }
    const processor = withVueStyleBlocks(dropAll)
    processor.preprocess!(SFC, 'C.vue')

    const result = processor.postprocess!([[message({ ruleId: 'vue/x' })], []], 'C.vue')

    expect(result).toEqual([])
  })
})
