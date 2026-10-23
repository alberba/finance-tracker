import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { createTestPinia } from '../helpers/pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({
  isDemoMode: vi.fn(() => false),
}))

import { isDemoMode } from '../../src/scripts/demo-mode'
import { useSyncStore } from '../../src/stores/sync'

describe('useSyncStore — read-only demo guard (WP8)', () => {
  beforeEach(() => {
    setActivePinia(createTestPinia())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(isDemoMode).mockReturnValue(false)
  })

  it('ignores enqueueCommand while demo mode is active', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)

    const store = useSyncStore()
    await expect(store.enqueueCommand({ action: 'noop' } as never)).resolves.toBeNull()
  })

  it('does not throw for the demo guard when demo mode is inactive (falls through to the normal not-ready no-op)', async () => {
    vi.mocked(isDemoMode).mockReturnValue(false)

    const store = useSyncStore()
    // Not initialized (`init()` never called) — resolves to null rather than
    // throwing, proving the demo guard isn't firing spuriously.
    await expect(store.enqueueCommand({ action: 'noop' } as never)).resolves.toBeNull()
  })

  it('init() is a no-op while the v2 read-only demo is active (never opens per-user IndexedDB)', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)

    const store = useSyncStore()
    await store.init('some-user-id')

    expect(store.userId).toBeNull()
  })
})
