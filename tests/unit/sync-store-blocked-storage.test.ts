import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import { createTestPinia } from '../helpers/pinia'
import { wipeIdbCache, wipeOutbox } from '../helpers/client-storage'
import { useSyncStore } from '../../src/stores/sync'

const USER_ID = 'user-store-blocked-storage'

describe('useSyncStore — almacenamiento bloqueado por una pestaña antigua (#490)', () => {
  beforeEach(async () => {
    vi.stubGlobal('navigator', { onLine: true })
    setActivePinia(createTestPinia())
    await wipeOutbox(USER_ID)
    await wipeIdbCache(USER_ID)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    // Let a late, already-rejected upgrade finish and close itself.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await wipeOutbox(USER_ID)
    await wipeIdbCache(USER_ID)
  })

  it('muestra un error tipado y visible en vez de quedarse esperando', async () => {
    const name = `finance-tracker-outbox-v2:${USER_ID}`
    const oldTab = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('commands', { keyPath: 'seq', autoIncrement: true })
        request.result.createObjectStore('movementPublications', { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const store = useSyncStore()
      await expect(store.init(USER_ID)).rejects.toThrow(/pestaña/i)
      expect(store.lastError).toMatch(/pestaña/i)
      expect(store.syncStatus).toBe('error')
    } finally {
      oldTab.close()
    }
  })
})
