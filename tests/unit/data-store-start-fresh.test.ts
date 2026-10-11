import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/client/state-initialize', () => ({
  resetState: vi.fn(),
}))

import { resetState } from '../../src/lib/client/state-initialize'
import { useDataStore } from '../../src/stores/data'

/**
 * Plain `node` environment (repo-wide vitest config, no jsdom dependency) —
 * `useToast()`/`window.location.reload` are stubbed manually just enough for
 * `showToast`'s `document.getElementById` early-return and the reload spy.
 */
function stubDom(): { reload: ReturnType<typeof vi.fn> } {
  vi.stubGlobal('document', { getElementById: () => null })
  const reload = vi.fn()
  vi.stubGlobal('window', { location: { reload } })
  return { reload }
}

describe("useDataStore — 'empezar de cero'", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(resetState).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('canStartFresh is available to authenticated users', () => {
    const store = useDataStore()
    expect(store.canStartFresh).toBe(true)
  })

  it('startFresh() calls the API and reloads the page on success', async () => {
    vi.mocked(resetState).mockResolvedValue({ ok: true })
    const { reload } = stubDom()

    const store = useDataStore()
    await store.startFresh()

    expect(resetState).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('startFresh() does not reload the page when the API call fails', async () => {
    vi.mocked(resetState).mockResolvedValue({ ok: false, error: 'boom' })
    const { reload } = stubDom()

    const store = useDataStore()
    await store.startFresh()

    expect(reload).not.toHaveBeenCalled()
  })
})
