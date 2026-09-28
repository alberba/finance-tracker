import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guards for the style architecture of ADR 0004
 * (docs/adr/0004-estilos-hibridos-tailwind-y-componentes-base.md): the legacy
 * sheet can only shrink, it stays below Tailwind in the cascade, and the
 * text/surface token pairs keep AA contrast in both themes.
 */

const globalCss = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8')
const legacyCss = readFileSync(new URL('../../src/styles/legacy.css', import.meta.url), 'utf8')

/**
 * Line ceiling for src/styles/legacy.css. It only goes down: a zone migration
 * that deletes legacy rules lowers it in the same PR. Never raise it; new
 * styles go in components (utilities, base components or scoped styles).
 */
const LEGACY_CSS_LINE_CEILING = 3176

describe('legacy.css', () => {
  it('does not grow past its line ceiling', () => {
    const lines = legacyCss.split('\n').length - (legacyCss.endsWith('\n') ? 1 : 0)

    expect(lines).toBeLessThanOrEqual(LEGACY_CSS_LINE_CEILING)
  })
})

describe('cascade layers', () => {
  it('declares legacy below components and utilities, above base', () => {
    const statement = globalCss.match(/^@layer\s+([^;{]+);/m)
    expect(statement, 'global.css declares the layer order in one statement').not.toBeNull()
    const order = statement![1].split(',').map((layer) => layer.trim())

    expect(order).toEqual(['theme', 'base', 'legacy', 'components', 'utilities'])
  })

  it('declares the order before importing Tailwind', () => {
    expect(globalCss.indexOf('@layer theme, base, legacy')).toBeLessThan(
      globalCss.indexOf("@import 'tailwindcss'"),
    )
  })

  it('imports legacy.css only inside the legacy layer', () => {
    const imports = [...globalCss.matchAll(/^@import\s+['"]\.\/legacy\.css['"]([^;]*);/gm)]

    expect(imports).toHaveLength(1)
    expect(imports[0][1].trim()).toBe('layer(legacy)')
  })
})

type Theme = 'light' | 'dark'

function tokenBlock(selector: string): Record<string, string> {
  const start = globalCss.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`global.css has no "${selector}" token block`)
  const body = globalCss.slice(start, globalCss.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  )
}

const lightTokens = tokenBlock(':root')
const themeTokens: Record<Theme, Record<string, string>> = {
  light: lightTokens,
  dark: { ...lightTokens, ...tokenBlock(":root[data-theme='dark']") },
}

function hexColor(theme: Theme, token: string): string {
  const value = themeTokens[theme][token]
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${token} in ${theme} must be a #rrggbb literal, got "${value}"`)
  }
  return value
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Text tokens and the surfaces they are meant to sit on. `--text-faint` is
 * left out on purpose: it is for placeholders and decoration, not for text
 * that has to be read. `--income` / `--expense` are fill colors; text uses
 * `--gain` / `--loss`.
 */
const PAGE_SURFACES = ['--bg-main', '--bg-panel', '--bg-subtle', '--bg-elevated']
const TEXT_PAIRS: Array<{ text: string; surfaces: string[] }> = [
  { text: '--text-main', surfaces: PAGE_SURFACES },
  { text: '--text-muted', surfaces: PAGE_SURFACES },
  { text: '--gain', surfaces: PAGE_SURFACES },
  { text: '--loss', surfaces: PAGE_SURFACES },
  { text: '--ink-text', surfaces: ['--bg-sidebar'] },
  { text: '--ink-muted', surfaces: ['--bg-sidebar'] },
]

const AA_NORMAL_TEXT = 4.5

describe('token contrast (WCAG AA, normal text)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const { text, surfaces } of TEXT_PAIRS) {
      for (const surface of surfaces) {
        it(`${text} on ${surface} in ${theme}`, () => {
          const ratio = contrastRatio(hexColor(theme, text), hexColor(theme, surface))

          expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        })
      }
    }
  }
})
