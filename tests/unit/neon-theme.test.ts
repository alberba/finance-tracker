import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  createNeonThemeController,
  NEON_THEMES,
  type NeonThemeEnvironment,
} from '../../src/lib/client/neon-theme'

function fakeSystemScheme(prefersDark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const media = {
    matches: prefersDark,
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
  }
  return {
    media,
    change(nextPrefersDark: boolean) {
      media.matches = nextPrefersDark
      listeners.forEach((listener) => listener({ matches: nextPrefersDark }))
    },
  }
}

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  }
}

function setup(
  options: {
    stored?: string
    prefersDark?: boolean
    storage?: NeonThemeEnvironment['storage']
  } = {},
) {
  const scheme = fakeSystemScheme(options.prefersDark ?? true)
  const storage =
    options.storage ??
    fakeStorage(options.stored === undefined ? {} : { 'neon-theme': options.stored })
  const root = { dataset: {} as DOMStringMap }
  const colorSchemeMeta = { content: 'light dark' }
  const controller = createNeonThemeController({
    storage,
    media: scheme.media,
    root,
    colorSchemeMeta,
  })
  return { controller, root, colorSchemeMeta, scheme, storage }
}

describe('theme controller', () => {
  it('without a preference paints «oscuro suave», or «claro melocotón» if the system asks for light', () => {
    expect(setup({ prefersDark: true }).root.dataset.theme).toBe('oscuro-suave')
    expect(setup({ prefersDark: false }).root.dataset.theme).toBe('claro-melocoton')
  })

  it.each(['oscuro-fuerte', 'claro-hueso'] as const)(
    'keeps a stored %s whatever the system says',
    (theme) => {
      const { controller, root } = setup({ stored: theme, prefersDark: theme.startsWith('claro') })

      expect(controller.getState()).toEqual({ preference: theme, theme })
      expect(root.dataset.theme).toBe(theme)
    },
  )

  it('reads an unknown stored value, such as «dark», as no preference', () => {
    const { controller } = setup({ stored: 'dark', prefersDark: false })

    expect(controller.getState()).toEqual({ preference: null, theme: 'claro-melocoton' })
  })

  it('applies, stores and announces a chosen theme', () => {
    const { controller, root, storage } = setup()
    const listener = vi.fn()
    controller.subscribe(listener)

    controller.setPreference('claro-hueso')

    expect(root.dataset.theme).toBe('claro-hueso')
    expect((storage as ReturnType<typeof fakeStorage>).values.get('neon-theme')).toBe('claro-hueso')
    expect(listener).toHaveBeenCalledWith({ preference: 'claro-hueso', theme: 'claro-hueso' })
  })

  it('tracks the system live only while nothing was chosen', () => {
    const { controller, root, scheme } = setup({ prefersDark: true })

    scheme.change(false)
    expect(root.dataset.theme).toBe('claro-melocoton')

    controller.setPreference('oscuro-fuerte')
    scheme.change(true)
    scheme.change(false)
    expect(root.dataset.theme).toBe('oscuro-fuerte')
  })

  it('keeps <meta name="color-scheme"> on the painted theme, so native UI is not left in the other scheme', () => {
    const { controller, colorSchemeMeta, scheme } = setup({ prefersDark: true })
    expect(colorSchemeMeta.content).toBe('dark')

    controller.setPreference('claro-hueso')
    expect(colorSchemeMeta.content).toBe('light')

    controller.setPreference('oscuro-fuerte')
    scheme.change(false)
    expect(colorSchemeMeta.content).toBe('dark')
  })

  it('still applies the choice when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const { controller, root } = setup({ storage: blocked })

    controller.setPreference('claro-hueso')

    expect(root.dataset.theme).toBe('claro-hueso')
  })
})

it('the shared pre-paint script accepts every theme supported by the controller', () => {
  const source = readFileSync(
    new URL('../../src/neon/layout/NeonInitialTheme.astro', import.meta.url),
    'utf8',
  )
  const inlineList = source.match(/\[\s*((?:'[a-z-]+',?\s*)+)\]\.includes\(stored\)/)?.[1]

  expect([...(inlineList ?? '').matchAll(/'([a-z-]+)'/g)].map(([, name]) => name)).toEqual([
    ...NEON_THEMES,
  ])
})
