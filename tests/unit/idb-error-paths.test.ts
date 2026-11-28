import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { wipeEncryptionKey, wipeIdbCache, wipeOutbox } from '../helpers/client-storage'

/**
 * Al cerrar sesión se borran las tres bases por usuario. Si el borrado falla o
 * lo bloquea otra pestaña, el wipe debe rechazar (y decirlo) en vez de dar por
 * borrados unos datos que siguen en el dispositivo.
 */

function failingDelete(outcome: 'onerror' | 'onblocked') {
  return vi.fn(() => {
    const request: Record<string, unknown> = {
      onsuccess: null,
      onerror: null,
      onblocked: null,
      error: new Error('simulated failure'),
      result: undefined,
    }
    queueMicrotask(() => (request[outcome] as (() => void) | null)?.())
    return request
  })
}

describe('wipe de IndexedDB cuando el borrado no termina', () => {
  const originalIndexedDb = globalThis.indexedDB

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.indexedDB = originalIndexedDb
  })

  it.each([
    { name: 'caché', wipe: wipeIdbCache },
    { name: 'outbox', wipe: wipeOutbox },
    { name: 'clave de cifrado', wipe: wipeEncryptionKey },
  ])('$name: rechaza si deleteDatabase falla o lo bloquea otra pestaña', async ({ wipe }) => {
    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: failingDelete('onerror') })
    await expect(wipe('user-wipe-error')).rejects.toThrow()

    vi.stubGlobal('indexedDB', { ...originalIndexedDb, deleteDatabase: failingDelete('onblocked') })
    await expect(wipe('user-wipe-error')).rejects.toThrow(/pestaña/i)
  })
})
