/**
 * Theme preference: light, dark or "system", which follows the OS live.
 * The pre-paint script in FinanceTrackerShell.astro applies the same rule
 * before the first frame; this controller takes over once the app loads and
 * is the only writer of `data-theme` and the stored preference afterwards.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export interface ThemeState {
  preference: ThemePreference
  theme: Theme
}

export interface ThemeEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  /** `prefers-color-scheme: dark`. */
  media: {
    readonly matches: boolean
    addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
  }
  root: { dataset: DOMStringMap }
}

export interface ThemeController {
  getState(): ThemeState
  setPreference(preference: ThemePreference): void
  subscribe(listener: (state: ThemeState) => void): () => void
}

const STORAGE_KEY = 'theme'

function parsePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function readStored(storage: ThemeEnvironment['storage']): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function writeStored(storage: ThemeEnvironment['storage'], preference: ThemePreference): void {
  try {
    storage?.setItem(STORAGE_KEY, preference)
  } catch {
    /* Storage blocked: the choice lasts until the page reloads. */
  }
}

export function createThemeController(env: ThemeEnvironment): ThemeController {
  let preference = parsePreference(readStored(env.storage))
  const listeners = new Set<(state: ThemeState) => void>()

  const getState = (): ThemeState => ({
    preference,
    theme: preference === 'system' ? (env.media.matches ? 'dark' : 'light') : preference,
  })

  const apply = () => {
    const state = getState()
    env.root.dataset.theme = state.theme
    listeners.forEach((listener) => listener(state))
  }

  env.media.addEventListener('change', () => {
    if (preference === 'system') apply()
  })
  env.root.dataset.theme = getState().theme

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

let browserController: ThemeController | null = null

/** The page's single controller, shared by the shell script and every island. */
export function getThemeController(): ThemeController {
  browserController ??= createThemeController({
    storage: browserStorage(),
    media: window.matchMedia('(prefers-color-scheme: dark)'),
    root: document.documentElement,
  })
  return browserController
}
