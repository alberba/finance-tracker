import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  count,
  enqueue,
  getOrCreateEncryptionKey,
  listAll,
  openIdbCache,
  openOutbox,
  openStorage,
  wipeEncryptionKey,
  wipeIdbCache,
  wipeOutbox,
} from '../../helpers/client-storage'
import { ClientStorageError } from '../../../src/lib/client/storage'

/**
 * Exercises the `onerror`/`onblocked`/`onabort` branches of the three
 * IndexedDB wrappers, which the happy-path tests in `idb-cache.test.ts`,
 * `outbox.test.ts` and `client-crypto.test.ts` never hit.
 */

interface FakeRequest {
  onsuccess: (() => void) | null
  onerror: (() => void) | null
  onupgradeneeded: (() => void) | null
  onblocked: (() => void) | null
  error: Error
  result: undefined
}

function makeFailingRequest(): FakeRequest {
  return {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
    error: new Error('simulated failure'),
    result: undefined,
  }
}

describe('IndexedDB wrapper error branches', () => {
  const originalIndexedDb = globalThis.indexedDB

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.indexedDB = originalIndexedDb
  })

  it('openIdbCache rejects when indexedDB.open fails', async () => {
    const fakeOpen = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onerror?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, open: fakeOpen })

    await expect(openIdbCache('user-error-cache')).rejects.toThrow()
  })

  it('wipeIdbCache rejects when deleteDatabase fails', async () => {
    const fakeDelete = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onerror?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: fakeDelete })

    await expect(wipeIdbCache('user-error-cache')).rejects.toThrow()
  })

  it('wipeIdbCache reports when deletion is blocked', async () => {
    const fakeDelete = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onblocked?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: fakeDelete })

    await expect(wipeIdbCache('user-error-cache')).rejects.toThrow(/pestaña/i)
  })

  it('a transaction error/abort rejects the pending write', async () => {
    await wipeIdbCache('user-error-tx')
    const db = await openIdbCache('user-error-tx')
    const tx = db.transaction('account', 'readwrite')
    tx.objectStore('account').put({ id: 'acc-1' })
    tx.abort()
    await expect(
      new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(undefined)
        tx.onabort = () => reject(new Error('aborted'))
      }),
    ).rejects.toThrow('aborted')
    db.close()
    await wipeIdbCache('user-error-tx')
  })

  it('openOutbox rejects when indexedDB.open fails', async () => {
    const fakeOpen = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onerror?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, open: fakeOpen })

    await expect(openOutbox('user-error-outbox')).rejects.toThrow()
  })

  it('wipeOutbox rejects when deleteDatabase fails or is blocked', async () => {
    const failingDelete = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onerror?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: failingDelete })
    await expect(wipeOutbox('user-error-outbox')).rejects.toThrow()

    const blockedDelete = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onblocked?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: blockedDelete })
    await expect(wipeOutbox('user-error-outbox')).rejects.toThrow(/pestaña/i)
  })

  it("enqueue's write transaction propagates an abort as a typed storage error and leaves no partial entry", async () => {
    await wipeOutbox('user-error-outbox-tx')
    const db = await openStorage('user-error-outbox-tx')
    try {
      // The browser aborts the write transaction (quota, eviction, another
      // tab): IndexedDB is the boundary, so the abort is injected there.
      const aborting = new Proxy(db.outbox, {
        get(target, property) {
          if (property === 'transaction') {
            return (...args: Parameters<IDBDatabase['transaction']>) => {
              const tx = target.transaction(...args)
              queueMicrotask(() => tx.abort())
              return tx
            }
          }
          const value = Reflect.get(target, property, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })

      const error = await enqueue({ ...db, outbox: aborting }, { action: 'noop' }).catch(
        (rejection: unknown) => rejection,
      )

      expect(error).toBeInstanceOf(ClientStorageError)
      expect((error as ClientStorageError).message).toMatch(/abort/i)
      expect(((error as ClientStorageError).cause as DOMException).name).toBe('AbortError')
      expect(await listAll(db)).toEqual([])
      expect(await count(db)).toBe(0)
    } finally {
      db.close()
      await wipeOutbox('user-error-outbox-tx')
    }
  })

  it('getOrCreateEncryptionKey rejects when the key store fails to open', async () => {
    const fakeOpen = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onerror?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, open: fakeOpen })

    await expect(getOrCreateEncryptionKey('user-error-crypto')).rejects.toThrow()
  })

  it('wipeEncryptionKey rejects on failure or blocked deletion', async () => {
    const failingDelete = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onerror?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: failingDelete })
    await expect(wipeEncryptionKey('user-error-crypto')).rejects.toThrow()

    const blockedDelete = vi.fn(() => {
      const request = makeFailingRequest()
      queueMicrotask(() => request.onblocked?.())
      return request
    })
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: blockedDelete })
    await expect(wipeEncryptionKey('user-error-crypto')).rejects.toThrow(/pestaña/i)
  })
})
