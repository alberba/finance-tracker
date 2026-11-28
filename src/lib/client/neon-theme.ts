/**
 * Theme of the app (DESIGN.md, Temas): one of four named themes. With no
 * choice stored the system decides: «oscuro suave», or «claro melocotón» if it
 * asks for light. The pre-paint script in src/neon/app/AppShell.astro (and the
 * login page's) applies the same rule before the first frame; this controller
 * takes over once the app loads and is the only writer of `data-theme` and the
 * stored choice afterwards.
 */

export const NEON_THEMES = [
  'oscuro-suave',
  'oscuro-fuerte',
  'claro-hueso',
  'claro-melocoton',
] as const

export type NeonTheme = (typeof NEON_THEMES)[number]

export interface NeonThemeState {
  /** What the user chose; `null` while the system decides. */
  preference: NeonTheme | null
  /** The theme painted now. */
  theme: NeonTheme
}

export interface NeonThemeEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  /** `prefers-color-scheme: dark`. */
  media: {
    readonly matches: boolean
    addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
  }
  root: { dataset: DOMStringMap }
  /** `<meta name="color-scheme">`, so native UI matches the theme before the CSS loads. */
  colorSchemeMeta?: { content: string } | null
}

export interface NeonThemeController {
  getState(): NeonThemeState
  setPreference(preference: NeonTheme): void
  subscribe(listener: (state: NeonThemeState) => void): () => void
}

export const NEON_THEME_STORAGE_KEY = 'neon-theme'

function parsePreference(value: string | null): NeonTheme | null {
  return NEON_THEMES.find((theme) => theme === value) ?? null
}

function readStored(storage: NeonThemeEnvironment['storage']): string | null {
  try {
    return storage?.getItem(NEON_THEME_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function writeStored(storage: NeonThemeEnvironment['storage'], preference: NeonTheme): void {
  try {
    storage?.setItem(NEON_THEME_STORAGE_KEY, preference)
  } catch {
    /* Storage blocked: the choice lasts until the page reloads. */
  }
}

function colorSchemeOf(theme: NeonTheme): 'dark' | 'light' {
  return theme.startsWith('oscuro') ? 'dark' : 'light'
}

export function createNeonThemeController(env: NeonThemeEnvironment): NeonThemeController {
  let preference = parsePreference(readStored(env.storage))
  const listeners = new Set<(state: NeonThemeState) => void>()

  const getState = (): NeonThemeState => ({
    preference,
    theme: preference ?? (env.media.matches ? 'oscuro-suave' : 'claro-melocoton'),
  })

  const paint = (theme: NeonTheme) => {
    env.root.dataset.theme = theme
    if (env.colorSchemeMeta) env.colorSchemeMeta.content = colorSchemeOf(theme)
  }

  const apply = () => {
    const state = getState()
    paint(state.theme)
    listeners.forEach((listener) => listener(state))
  }

  env.media.addEventListener('change', () => {
    if (preference === null) apply()
  })
  paint(getState().theme)

  return {
    getState,
    setPreference(next) {
      preference = next
      writeStored(env.storage, next)
      apply()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

let browserController: NeonThemeController | null = null

/** The page's single controller, shared by the shell script and every island. */
export function getNeonThemeController(): NeonThemeController {
  browserController ??= createNeonThemeController({
    storage: browserStorage(),
    media: window.matchMedia('(prefers-color-scheme: dark)'),
    root: document.documentElement,
    colorSchemeMeta: document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]'),
  })
  return browserController
}
