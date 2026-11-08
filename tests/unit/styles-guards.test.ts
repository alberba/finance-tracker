import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guards for the style architecture of ADR 0004
 * (docs/adr/0004-estilos-hibridos-tailwind-y-componentes-base.md) and ADR 0010:
 * the app has exactly the sheets below (the hand-written legacy sheet is gone
 * and can't come back under any name), the text/surface token pairs of the old
 * design keep AA contrast in both themes, and every CSS variable the code reads
 * is defined somewhere. That the new design's CSS can't leak into the old one
 * is tests/unit/style-isolation.test.ts.
 */

const readSrc = (path: string) =>
  readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')

/** `global.css` is the entry; the other three are its parts (ADR 0010). */
const STYLESHEETS = [
  'neon/styles/neon.css',
  'styles/common.css',
  'styles/global.css',
  'styles/legacy.css',
]

const globalCss = readSrc('styles/global.css')
/** The old design's token values, @theme and base typography. */
const legacyCss = readSrc('styles/legacy.css')

const srcDir = new URL('../../src/', import.meta.url)
const sourcePaths = readdirSync(srcDir, { recursive: true }) as string[]

describe('global stylesheet', () => {
  it('has no stylesheet in src/ beside its three parts', () => {
    // New styles go in components: utilities, base components or scoped styles.
    const stylesheets = sourcePaths.filter((path) => /\.(css|scss|sass|less)$/.test(path)).sort()

    expect(stylesheets).toEqual(STYLESHEETS)
  })

  it('has no global <style> blocks beside it', () => {
    // Components style themselves with scoped blocks; an unscoped or
    // `is:global` block would be a global sheet under another name.
    const globalBlocks = sourcePaths
      .filter((path) => /\.(vue|astro)$/.test(path))
      .flatMap((path) =>
        [...readFileSync(new URL(path, srcDir), 'utf8').matchAll(/<style\b[^>]*>/g)]
          .filter(([tag]) => !/\bscoped\b/.test(tag))
          .map(([tag]) => `${path}: ${tag}`),
      )

    expect(globalBlocks).toEqual([])
  })

  it('has no stylesheets in public/', () => {
    const publicDir = new URL('../../public/', import.meta.url)
    const stylesheets = (readdirSync(publicDir, { recursive: true }) as string[]).filter((path) =>
      path.endsWith('.css'),
    )

    expect(stylesheets).toEqual([])
  })

  it('imports only Tailwind and its own three parts, in that order', () => {
    // The new tokens come last so they win over the old @theme names inside
    // [data-ui="neon"].
    const imports = [...globalCss.matchAll(/^@import\s+([^;]+);/gm)].map(([, target]) =>
      target.trim(),
    )

    expect(imports).toEqual([
      "'tailwindcss'",
      "'./common.css'",
      "'./legacy.css'",
      "'../neon/styles/neon.css'",
    ])
  })

  it('imports nothing from the parts themselves', () => {
    for (const path of STYLESHEETS.filter((path) => path !== 'styles/global.css')) {
      expect(readSrc(path), path).not.toMatch(/^@import\b/m)
    }
  })

  it('declares no cascade layer of its own', () => {
    // Tailwind's theme, base, components and utilities are the whole order;
    // a layer for old rules is how the legacy sheet lived.
    // Block (`@layer base {`) and statement (`@layer theme, legacy;`) forms.
    const layers = STYLESHEETS.flatMap((path) =>
      [...readSrc(path).matchAll(/@layer\s+([^{;]+)/g)].flatMap(([, names]) =>
        names.split(',').map((name) => name.trim()),
      ),
    )

    expect(
      layers.filter((name) => !['theme', 'base', 'components', 'utilities'].includes(name)),
    ).toEqual([])
  })
})

type Theme = 'light' | 'dark'

function tokenBlock(selector: string): Record<string, string> {
  const start = legacyCss.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`legacy.css has no "${selector}" token block`)
  const body = legacyCss.slice(start, legacyCss.indexOf('}', start))
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

/** Every token the app paints text with, and the surfaces that text sits on. */
const PAGE_SURFACES = ['--bg-main', '--bg-panel', '--bg-subtle', '--bg-elevated']
const INK_SURFACES = ['--bg-sidebar', '--ink-surface']
const TEXT_PAIRS: Array<{ text: string; surfaces: string[] }> = [
  { text: '--text-main', surfaces: PAGE_SURFACES },
  { text: '--text-muted', surfaces: PAGE_SURFACES },
  { text: '--text-faint', surfaces: PAGE_SURFACES },
  { text: '--gain', surfaces: PAGE_SURFACES },
  { text: '--loss', surfaces: PAGE_SURFACES },
  { text: '--primary', surfaces: PAGE_SURFACES },
  { text: '--income', surfaces: PAGE_SURFACES },
  { text: '--expense', surfaces: PAGE_SURFACES },
  { text: '--invest', surfaces: PAGE_SURFACES },
  { text: '--saving', surfaces: PAGE_SURFACES },
  { text: '--accent', surfaces: PAGE_SURFACES },
  { text: '--on-primary', surfaces: ['--primary-fill', '--primary-fill-hover'] },
  { text: '--ink-text', surfaces: INK_SURFACES },
  { text: '--ink-muted', surfaces: INK_SURFACES },
  { text: '--ink-gain', surfaces: INK_SURFACES },
  { text: '--ink-loss', surfaces: INK_SURFACES },
  { text: '--notice-text', surfaces: ['--notice-bg'] },
]

/**
 * Pairs that were already below AA when the guard landed. The list only
 * shrinks: fix the token (or move its text to --gain / --loss) and delete the
 * entry — the test fails while a listed pair passes. Never add to it.
 * What is left is never painted as readable text (the next describe enforces
 * it): `--text-faint` is for placeholders and decoration; `--income` /
 * `--expense` are fills whose text counterparts are `--gain` / `--loss`;
 * `--accent` is a warning fill (dots, tinted pills with `text-text-main`).
 */
const KNOWN_BELOW_AA = new Set([
  ...PAGE_SURFACES.map((surface) => `light --text-faint on ${surface}`),
  ...PAGE_SURFACES.map((surface) => `dark --text-faint on ${surface}`),
  ...PAGE_SURFACES.map((surface) => `light --income on ${surface}`),
  ...PAGE_SURFACES.map((surface) => `light --expense on ${surface}`),
  ...PAGE_SURFACES.map((surface) => `light --accent on ${surface}`),
])

const AA_NORMAL_TEXT = 4.5

describe('token contrast (WCAG AA, normal text)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const { text, surfaces } of TEXT_PAIRS) {
      for (const surface of surfaces) {
        const pair = `${theme} ${text} on ${surface}`
        const ratio = () => contrastRatio(hexColor(theme, text), hexColor(theme, surface))

        if (KNOWN_BELOW_AA.has(pair)) {
          it(`${pair} is still below AA (known; remove it from the list once fixed)`, () => {
            expect(ratio()).toBeLessThan(AA_NORMAL_TEXT)
          })
        } else {
          it(`${pair} meets AA`, () => {
            expect(ratio()).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
          })
        }
      }
    }
  }
})

const sourceFiles = sourcePaths
  .filter((path) => /\.(vue|astro|ts|js|css)$/.test(path))
  .map((path) => ({ path, text: readFileSync(new URL(path, srcDir), 'utf8') }))

describe('CSS variables', () => {
  it('only reads variables that some source defines', () => {
    const defined = new Set<string>()
    for (const { text } of sourceFiles) {
      // Declarations (`--x: …`) and names set from code (`'--x'`).
      for (const [, name] of text.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) defined.add(name)
      for (const [, name] of text.matchAll(/['"`](--[a-zA-Z][\w-]*)['"`]/g)) defined.add(name)
    }

    const undefinedReads = sourceFiles.flatMap(({ path, text }) =>
      // `var(--x)` in CSS and scoped styles, `bg-(--x)` in Tailwind classes.
      [...text.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)|[a-z]-\((--[a-zA-Z][\w-]*)/g)]
        .map((match) => match[1] ?? match[2])
        .filter((name) => !name.startsWith('--tw-') && !defined.has(name))
        .map((name) => `${path}: ${name}`),
    )

    expect(undefinedReads).toEqual([])
  })
})

describe('tokens below AA', () => {
  it('are never painted as readable text', () => {
    // The pairs left in KNOWN_BELOW_AA stay there only because no text uses
    // them; `placeholder:text-text-faint` is the one allowed use.
    const textUses = sourceFiles.flatMap(({ path, text }) =>
      [
        ...text.matchAll(
          /(?<![\w-])((?:[\w-]+:)*)text-(income|expense|accent|text-faint|\(--(?:income|expense|accent|text-faint)\))(?![\w-])/g,
        ),
      ]
        .filter(([, variants]) => variants !== 'placeholder:')
        .map(([match]) => `${path}: ${match}`),
    )

    expect(textUses).toEqual([])
  })
})
