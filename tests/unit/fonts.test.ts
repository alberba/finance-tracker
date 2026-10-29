import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The three families the design language uses ship with the app (#404):
 * `global.css` declares them, `public/fonts` holds the latin woff2 files and
 * the service worker precaches them so the app keeps its typography offline.
 * Vendoring the OFL licenses is part of the redistribution terms.
 */

const root = new URL('../../', import.meta.url)
const globalCss = readFileSync(new URL('src/styles/global.css', root), 'utf8')
const serviceWorker = readFileSync(new URL('public/sw.js', root), 'utf8')
const fontPreloads = readFileSync(new URL('src/components/layout/FontPreloads.astro', root), 'utf8')

type FontFace = {
  family: string
  style: string
  weight: string
  source: string
}

const fontFaces: FontFace[] = [...globalCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
  ([, body]) => {
    const field = (name: string) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
    return {
      family: field('font-family')?.replace(/['"]/g, '') ?? '',
      style: field('font-style') ?? '',
      weight: field('font-weight') ?? '',
      source: field('src') ?? '',
    }
  },
)

const fontSources = fontFaces
  .map((face) => face.source.match(/url\('(\/fonts\/[^']+)'\)/)?.[1])
  .filter((source): source is string => Boolean(source))

const sourceFiles = (readdirSync(new URL('src/', root), { recursive: true }) as string[])
  .filter((path) => /\.(astro|css|js|ts|vue)$/.test(path))
  .map((path) => ({
    path,
    text: readFileSync(new URL(`src/${path}`, root), 'utf8'),
  }))

describe('self-hosted fonts', () => {
  it('declares Syne, DM Sans and DM Mono with the weights the app paints', () => {
    expect(
      fontFaces.map(({ family, style, weight }) => `${family} ${style} ${weight}`).sort(),
    ).toEqual(
      [
        'Syne normal 400 800',
        'DM Sans normal 400 700',
        'DM Sans italic 400',
        'DM Mono normal 400',
        'DM Mono normal 500',
      ].sort(),
    )
  })

  it('serves every declared face from public/fonts', () => {
    const declared = [...new Set(fontSources)].sort()
    const vendored = (readdirSync(new URL('public/fonts/', root)) as string[])
      .filter((file) => file.endsWith('.woff2'))
      .map((file) => `/fonts/${file}`)
      .sort()

    expect(declared).toEqual(vendored)
  })

  it('preloads the faces the first screen paints', () => {
    const preloaded = new Set(
      [...fontPreloads.matchAll(/href="(\/fonts\/[^"]+)"/g)].map(([, href]) => href),
    )
    const declared = new Set(fontSources)
    const painted = new Set(
      fontFaces
        .filter((face) => face.style !== 'italic')
        .map((face) => face.source.match(/url\('(\/fonts\/[^']+)'\)/)?.[1])
        .filter((source): source is string => Boolean(source)),
    )

    for (const href of preloaded) {
      expect(declared.has(href), `${href} is not declared`).toBe(true)
    }
    expect([...preloaded].sort()).toEqual([...painted].sort())
  })

  it('precaches every font in the service worker shell', () => {
    const appShell = serviceWorker.match(/const APP_SHELL = \[([^\]]*)\]/)?.[1] ?? ''

    for (const source of new Set(fontSources)) {
      expect(appShell, `${source} is missing from APP_SHELL`).toContain(`'${source}'`)
    }
  })

  it('keeps the OFL license of each family next to the files', () => {
    const licenses = (readdirSync(new URL('public/fonts/', root)) as string[]).filter((file) =>
      file.startsWith('OFL-'),
    )

    expect(licenses).toHaveLength(3)
    for (const license of licenses) {
      expect(readFileSync(new URL(`public/fonts/${license}`, root), 'utf8')).toContain(
        'SIL OPEN FONT LICENSE',
      )
    }
  })

  it('never asks Google Fonts for a resource', () => {
    const external = sourceFiles
      .filter(({ text }) => /fonts\.(googleapis|gstatic)\.com/.test(text))
      .map(({ path }) => path)

    expect(external).toEqual([])
  })
})
