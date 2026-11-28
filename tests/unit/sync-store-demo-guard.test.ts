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

  it('init() is a no-op while the v2 read-only demo is active (never opens per-user IndexedDB)', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)

    const store = useSyncStore()
    await store.init('some-user-id')

    expect(store.userId).toBeNull()
  })
})
