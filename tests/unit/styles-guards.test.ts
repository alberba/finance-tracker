import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { declaredCustomProperties, parseCss } from '../helpers/css-blocks'

/**
 * Guards for the style architecture of ADR 0004
 * (docs/adr/0004-estilos-hibridos-tailwind-y-componentes-base.md): the app has
 * exactly the sheets below, the common part defines no token, the text/surface
 * token pairs keep AA contrast in the four themes, and every CSS variable the
 * code reads is defined somewhere.
 */

const readSrc = (path: string) =>
  readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')

/** `global.css` is the entry; the other two are its parts. */
const STYLESHEETS = ['neon/styles/neon.css', 'styles/common.css', 'styles/global.css']

const globalCss = readSrc('styles/global.css')
const commonCss = readSrc('styles/common.css')
const neonCss = readSrc('neon/styles/neon.css')

const srcDir = new URL('../../src/', import.meta.url)
const sourcePaths = readdirSync(srcDir, { recursive: true }) as string[]

describe('global stylesheet', () => {
  it('has no stylesheet in src/ beside its parts', () => {
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

  it('imports only Tailwind and its own parts, in that order', () => {
    const imports = [...globalCss.matchAll(/^@import\s+([^;]+);/gm)].map(([, target]) =>
      target.trim(),
    )

    expect(imports).toEqual(["'tailwindcss'", "'./common.css'", "'../neon/styles/neon.css'"])
  })

  it('imports nothing from the parts themselves', () => {
    for (const path of STYLESHEETS.filter((path) => path !== 'styles/global.css')) {
      expect(readSrc(path), path).not.toMatch(/^@import\b/m)
    }
  })

  it('declares no cascade layer of its own', () => {
    // Tailwind's theme, base, components and utilities are the whole order.
    // Block (`@layer base {`) and statement (`@layer theme, x;`) forms.
    const layers = STYLESHEETS.flatMap((path) =>
      [...readSrc(path).matchAll(/@layer\s+([^{;]+)/g)].flatMap(([, names]) =>
        names.split(',').map((name) => name.trim()),
      ),
    )

    expect(
      layers.filter((name) => !['theme', 'base', 'components', 'utilities'].includes(name)),
    ).toEqual([])
  })

  it('defines no token in the common part', () => {
    const tokens = parseCss(commonCss).blocks.flatMap((block) => [
      ...(/^@theme\b/.test(block.prelude) ? [block.prelude] : []),
      ...declaredCustomProperties(block),
    ])

    expect(tokens).toEqual([])
  })

  it('defines the tokens with the names of DESIGN.md', () => {
    const names = new Set(
      parseCss(neonCss).blocks.flatMap((block) => declaredCustomProperties(block)),
    )

    for (const name of ['--color-bg', '--color-accent', '--font-display', '--radius-card']) {
      expect(names.has(name), name).toBe(true)
    }
  })
})

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

const AA_NORMAL_TEXT = 4.5

/**
 * Contrast of the tokens (DESIGN.md, Temas): every text token reaches AA on
 * every surface of its theme, in the four themes.
 */

const NEON_THEMES = {
  'oscuro-suave': ':root,',
  'oscuro-fuerte': "[data-theme='oscuro-fuerte']",
  'claro-hueso': "[data-theme='claro-hueso']",
  'claro-melocoton': "[data-theme='claro-melocoton']",
} as const

function neonTokens(selector: string): Record<string, string> {
  const start = neonCss.indexOf(selector)
  if (start === -1) throw new Error(`neon.css has no "${selector}" token block`)
  const body = neonCss.slice(neonCss.indexOf('{', start), neonCss.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  )
}

const NEON_SURFACES = ['--color-bg', '--color-side', '--color-panel', '--color-panel2']
const NEON_TEXT_PAIRS: Array<{ text: string; surfaces: string[] }> = [
  {
    text: '--color-text',
    surfaces: NEON_SURFACES,
  },
  { text: '--color-soft', surfaces: NEON_SURFACES },
  { text: '--color-muted', surfaces: NEON_SURFACES },
  { text: '--color-faint', surfaces: NEON_SURFACES },
  { text: '--color-accent-text', surfaces: NEON_SURFACES },
  { text: '--color-gain', surfaces: NEON_SURFACES },
  { text: '--color-loss', surfaces: NEON_SURFACES },
  { text: '--color-on-accent', surfaces: ['--color-accent'] },
  { text: '--color-nav-active-text', surfaces: ['--color-nav-active-bg'] },
  { text: '--color-sel-text', surfaces: ['--color-sel-bg'] },
]

describe('token contrast (WCAG AA, normal text)', () => {
  for (const [theme, selector] of Object.entries(NEON_THEMES)) {
    const tokens = neonTokens(selector)
    for (const { text, surfaces } of NEON_TEXT_PAIRS) {
      for (const surface of surfaces) {
        it(`${theme} ${text} on ${surface} meets AA`, () => {
          for (const name of [text, surface]) {
            if (!/^#[0-9a-f]{6}$/i.test(tokens[name] ?? '')) {
              throw new Error(`${name} in ${theme} must be a #rrggbb literal`)
            }
          }
          expect(contrastRatio(tokens[text], tokens[surface])).toBeGreaterThanOrEqual(
            AA_NORMAL_TEXT,
          )
        })
      }
    }
  }
})
