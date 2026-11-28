import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import { createTestPinia } from '../../helpers/pinia'
import { wipeIdbCache, wipeOutbox } from '../../helpers/client-storage'
import { ClientStorageError } from '../../../src/lib/client/storage'
import { useSyncStore } from '../../../src/stores/sync'

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
    // A late, already-rejected upgrade finishes and closes itself once the old
    // tab is gone; the wipe is refused while that connection is still open.
    await vi.waitFor(() => wipeOutbox(USER_ID))
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
      const failure = await store.init(USER_ID).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ClientStorageError)
      expect((failure as Error).message).toMatch(/pestaña/i)
      expect(store.lastError).toMatch(/pestaña/i)
      expect(store.syncStatus).toBe('error')
    } finally {
      oldTab.close()
    }
  })
})
