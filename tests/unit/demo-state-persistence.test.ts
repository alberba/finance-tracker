import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({
  isDemoMode: vi.fn(() => false),
  resolveRuntimeNamespace: vi.fn(() => ''),
}))

import {
  BASE_SEED,
  loadPersistedState,
  normalizeState,
  persistState,
} from '../../src/scripts/state'
import { isDemoMode } from '../../src/scripts/demo-mode'

describe('persistencia del modo demo', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    storage.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
  })

  it('mantiene el estado demo en la clave local aislada', () => {
    vi.mocked(isDemoMode).mockReturnValue(true)
    const state = normalizeState(BASE_SEED)

    persistState(state)

    expect(localStorage.getItem('finance-tracker-state-v1')).toBeNull()
    expect(JSON.parse(localStorage.getItem('finance-tracker-state-v1::demo') ?? 'null')).toEqual(
      state,
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('no hidrata una sesión autenticada desde el blob local', () => {
    vi.mocked(isDemoMode).mockReturnValue(false)
    localStorage.setItem('finance-tracker-state-v1', JSON.stringify({ year: 1999 }))

    expect(loadPersistedState()).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
