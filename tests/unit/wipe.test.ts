import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  count,
  enqueue,
  getAllEntities,
  getOrCreateEncryptionKey,
  openStorage,
  putEntity,
  wipeAllClientData,
} from '../helpers/client-storage'

const USER_ID = 'user-wipe-test'

describe('wipeAllClientData', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('deletes the cache, outbox and key databases together', async () => {
    localStorage.setItem('finance-tracker-state-v1', 'private-state')
    localStorage.setItem('finance-tracker-server-version-v1', '12')
    localStorage.setItem('finance-tracker-pending-v1', '1')
    const cacheDb = await openStorage(USER_ID)
    await putEntity(cacheDb, 'account', { id: 'acc-1' })
    cacheDb.close()

    const outboxDb = await openStorage(USER_ID)
    await enqueue(outboxDb, { action: 'noop' })
    outboxDb.close()

    await getOrCreateEncryptionKey(USER_ID)

    await wipeAllClientData(USER_ID)

    expect(localStorage.getItem('finance-tracker-state-v1')).toBeNull()
    expect(localStorage.getItem('finance-tracker-server-version-v1')).toBeNull()
    expect(localStorage.getItem('finance-tracker-pending-v1')).toBeNull()

    const reopenedCache = await openStorage(USER_ID)
    expect(await getAllEntities(reopenedCache, 'account')).toEqual([])
    reopenedCache.close()

    const reopenedOutbox = await openStorage(USER_ID)
    expect(await count(reopenedOutbox)).toBe(0)
    reopenedOutbox.close()
  })
})
