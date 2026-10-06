import { describe, expect, it, vi } from 'vitest'

import { createThemeController, type ThemeEnvironment } from '../../src/lib/client/theme'

/** A `prefers-color-scheme: dark` query whose answer the test flips by hand. */
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
  options: { stored?: string; prefersDark?: boolean; storage?: ThemeEnvironment['storage'] } = {},
) {
  const scheme = fakeSystemScheme(options.prefersDark ?? false)
  const storage =
    options.storage ?? fakeStorage(options.stored === undefined ? {} : { theme: options.stored })
  const root = { dataset: {} as DOMStringMap }
  const controller = createThemeController({ storage, media: scheme.media, root })
  return { controller, root, scheme, storage }
}

describe('theme controller', () => {
  it('follows the system when nothing is stored', () => {
    const { controller, root } = setup({ prefersDark: true })

    expect(controller.getState()).toEqual({ preference: 'system', theme: 'dark' })
    expect(root.dataset.theme).toBe('dark')
  })

  it('keeps a stored light or dark choice whatever the system says', () => {
    const { controller, root } = setup({ stored: 'light', prefersDark: true })

    expect(controller.getState()).toEqual({ preference: 'light', theme: 'light' })
    expect(root.dataset.theme).toBe('light')
  })

  it('reads an unknown stored value as "system"', () => {
    const { controller } = setup({ stored: 'sepia', prefersDark: false })

    expect(controller.getState()).toEqual({ preference: 'system', theme: 'light' })
  })

  it('applies, stores and announces a new preference', () => {
    const { controller, root, storage } = setup({ prefersDark: false })
    const listener = vi.fn()
    controller.subscribe(listener)

    controller.setPreference('dark')

    expect(root.dataset.theme).toBe('dark')
    expect((storage as ReturnType<typeof fakeStorage>).values.get('theme')).toBe('dark')
    expect(listener).toHaveBeenCalledWith({ preference: 'dark', theme: 'dark' })
  })

  it('tracks the system live while the preference is "system"', () => {
    const { controller, root, scheme } = setup({ prefersDark: false })
    const listener = vi.fn()
    controller.subscribe(listener)

    scheme.change(true)

    expect(root.dataset.theme).toBe('dark')
    expect(listener).toHaveBeenCalledWith({ preference: 'system', theme: 'dark' })
  })

  it('ignores system changes once the user picks light or dark', () => {
    const { controller, root, scheme } = setup({ stored: 'light', prefersDark: false })
    const listener = vi.fn()
    controller.subscribe(listener)

    scheme.change(true)

    expect(root.dataset.theme).toBe('light')
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops announcing to a listener that unsubscribed', () => {
    const { controller } = setup()
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)

    unsubscribe()
    controller.setPreference('dark')

    expect(listener).not.toHaveBeenCalled()
  })

  it('still switches theme when storage is unavailable', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const { controller, root } = setup({ storage: throwing, prefersDark: false })

    controller.setPreference('dark')

    expect(controller.getState()).toEqual({ preference: 'dark', theme: 'dark' })
    expect(root.dataset.theme).toBe('dark')
  })
})
