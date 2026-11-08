import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { declaredCustomProperties, parseCss } from '../helpers/css-blocks'

/**
 * Style isolation of ADR 0010 (docs/adr/0010-migracion-con-convivencia-aislada.md):
 * the new design's CSS can't leak into the old one, and the common part can't
 * define tokens. While both designs coexist, `data-ui="neon"` on <html> is the
 * only thing that turns the new styles on.
 */

const read = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')

const NEON_SCOPE = /^\[data-ui=(['"])neon\1\]/

/** Rules of a new-design sheet that are not under `[data-ui="neon"]` or the `neon:` variant. */
function unscopedNeonRules(css: string): string[] {
  return parseCss(css)
    .blocks.filter(({ prelude, ancestors }) => {
      if (prelude.startsWith('@')) return false
      // Steps of a keyframes rule are not selectors.
      if (ancestors.some((ancestor) => /^@keyframes\b/.test(ancestor))) return false
      if (ancestors.includes('@variant neon')) return false
      return prelude.split(',').some((selector) => !NEON_SCOPE.test(selector.trim()))
    })
    .map(({ prelude }) => prelude)
}

/** Things a new-design sheet declares globally, which would reach the old design. */
function globalNeonLeaks(css: string, legacyCss: string): string[] {
  const { blocks, statements } = parseCss(css)
  const legacyNames = new Set(
    parseCss(legacyCss).blocks.flatMap((block) => declaredCustomProperties(block)),
  )

  const leaks: string[] = []
  for (const { prelude } of blocks) {
    // Fonts are shared and live in common.css; animation names are global.
    if (/^@font-face\b/.test(prelude)) leaks.push(prelude)
    if (/^@keyframes\s+(?!neon-)/.test(prelude)) leaks.push(`${prelude} (name without neon-)`)
  }
  for (const statement of statements) {
    if (/^@import\b/.test(statement)) leaks.push(statement)
  }
  // `@theme` registers a utility at :root, outside the scope: only for names
  // the old design doesn't have, or it would redefine them for everyone.
  for (const block of blocks.filter(({ prelude }) => /^@theme\b/.test(prelude))) {
    for (const name of declaredCustomProperties(block)) {
      if (legacyNames.has(name)) leaks.push(`@theme ${name} (already an old-design token)`)
    }
  }
  return leaks
}

/** Tokens a common sheet defines: any custom property or `@theme` block. */
function commonTokenDefinitions(css: string): string[] {
  return parseCss(css).blocks.flatMap((block) => [
    ...(/^@theme\b/.test(block.prelude) ? [block.prelude] : []),
    ...declaredCustomProperties(block),
  ])
}

const neonCss = read('neon/styles/neon.css')
const commonCss = read('styles/common.css')
const legacyCss = read('styles/legacy.css')

describe('style isolation: the real sheets', () => {
  it('has every rule of the new design under [data-ui="neon"]', () => {
    expect(unscopedNeonRules(neonCss)).toEqual([])
  })

  it('declares nothing global in the new design', () => {
    expect(globalNeonLeaks(neonCss, legacyCss)).toEqual([])
  })

  it('defines no token in the common part', () => {
    expect(commonTokenDefinitions(commonCss)).toEqual([])
  })

  it('keeps the new design out of the old one', () => {
    // Comments may point at the new design; the rules may not.
    expect(legacyCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/data-ui|neon/i)
  })

  it('defines the new tokens with the names of DESIGN.md', () => {
    const names = new Set(
      parseCss(neonCss).blocks.flatMap((block) => declaredCustomProperties(block)),
    )

    for (const name of ['--color-bg', '--color-accent', '--font-display', '--radius-card']) {
      expect(names.has(name), name).toBe(true)
    }
  })

  it('declares the neon: variant in the common part', () => {
    expect(parseCss(commonCss).statements).toContainEqual(
      expect.stringMatching(/^@custom-variant neon\b/),
    )
  })
})

describe('style isolation: the guard catches a leak', () => {
  const scoped = `@layer base { [data-ui='neon'] { --x: 1; } [data-ui="neon"][data-theme='a'] { --x: 2; } }`

  it('passes scoped rules, in either quote style', () => {
    expect(unscopedNeonRules(scoped)).toEqual([])
  })

  it('fails a rule with no scope', () => {
    expect(unscopedNeonRules(`${scoped} .panel { color: red; }`)).toEqual(['.panel'])
  })

  it('fails a scoped selector sharing a list with an unscoped one', () => {
    expect(unscopedNeonRules(`[data-ui='neon'] .a, .b { color: red; }`)).toEqual([
      "[data-ui='neon'] .a, .b",
    ])
  })

  it('fails a rule that only mentions the scope further down the selector', () => {
    expect(unscopedNeonRules(`.card [data-ui='neon'] { color: red; }`)).toHaveLength(1)
  })

  it('fails a bare element rule', () => {
    expect(unscopedNeonRules(`@layer base { body { color: red; } }`)).toEqual(['body'])
  })

  it('accepts keyframe steps and the neon: variant', () => {
    expect(
      unscopedNeonRules(
        '@keyframes neon-in { from { opacity: 0; } to { opacity: 1; } } @variant neon { .x { color: red; } }',
      ),
    ).toEqual([])
  })

  it('fails global declarations of the new sheet', () => {
    const legacy = ':root { --color-panel: #fff; }'
    expect(globalNeonLeaks('@font-face { font-family: X; }', legacy)).toHaveLength(1)
    expect(globalNeonLeaks('@keyframes panelIn { from { opacity: 0; } }', legacy)).toHaveLength(1)
    expect(globalNeonLeaks('@theme { --color-panel: red; }', legacy)).toHaveLength(1)
    expect(globalNeonLeaks('@theme { --color-panel2: red; }', legacy)).toEqual([])
  })

  it('fails a token in the common part', () => {
    expect(commonTokenDefinitions(':root { --x: 1; }')).toEqual(['--x'])
    expect(commonTokenDefinitions('@theme { --y: 1; }')).toEqual(['@theme', '--y'])
    expect(commonTokenDefinitions('@font-face { font-family: X; }')).toEqual([])
  })
})
