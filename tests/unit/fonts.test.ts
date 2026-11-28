import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Unbounded and Manrope ship with the app (#424). `src/styles/common.css`
 * declares them, `public/fonts` holds the latin woff2 files and the service
 * worker precaches them so the app keeps its typography offline. Vendoring the
 * OFL licenses is part of the redistribution terms.
 */

const root = new URL('../../', import.meta.url)
const commonCss = readFileSync(new URL('src/styles/common.css', root), 'utf8')
const serviceWorker = readFileSync(new URL('public/sw.js', root), 'utf8')
const fontPreloads = readFileSync(
  new URL('src/neon/layout/NeonFontPreloads.astro', root),
  'utf8',
)

const fontSources = [...commonCss.matchAll(/@font-face\s*\{([^}]*)\}/g)]
  .map(([, body]) => body.match(/url\('(\/fonts\/[^']+)'\)/)?.[1])
  .filter((source): source is string => Boolean(source))

const sourceFiles = (readdirSync(new URL('src/', root), { recursive: true }) as string[])
  .filter((path) => /\.(astro|css|js|ts|vue)$/.test(path))
  .map((path) => ({
    path,
    text: readFileSync(new URL(`src/${path}`, root), 'utf8'),
  }))

describe('self-hosted fonts', () => {
  it('serves every declared face from public/fonts', () => {
    const declared = [...new Set(fontSources)].sort()
    const vendored = (readdirSync(new URL('public/fonts/', root)) as string[])
      .filter((file) => file.endsWith('.woff2'))
      .map((file) => `/fonts/${file}`)
      .sort()

    expect(declared).toEqual(vendored)
  })

  it('preloads every face the first screen paints', () => {
    const preloads = [...fontPreloads.matchAll(/href="(\/fonts\/[^"]+)"/g)].map(([, href]) => href)

    expect(preloads.sort()).toEqual([...new Set(fontSources)].sort())
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

    expect(licenses).toHaveLength(2)
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
