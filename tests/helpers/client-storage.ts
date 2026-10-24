/**
 * Edge helpers for the client storage tests.
 *
 * The storage modules return `Effect`s over `ClientStorage` (ADR-0006); a test
 * is an edge, so it opens the handles once and runs each program with them.
 * These wrappers keep the `(storage, ...args)` shape tests already used, so a
 * failure still points at the operation under test and not at Effect plumbing.
 */

import { Effect } from 'effect'

import * as crypto from '../../src/lib/client/crypto'
import * as cache from '../../src/lib/client/idb-cache'
import * as outbox from '../../src/lib/client/outbox'
import { ClientStorage, type ClientStorageHandles } from '../../src/lib/client/storage'
import * as wipe from '../../src/lib/client/wipe'

export type { ClientStorageHandles }
export type { CachedEntity } from '../../src/lib/client/idb-cache'
export type {
  OutboxCommandInput,
  OutboxEntry,
  PendingCreateMatch,
} from '../../src/lib/client/outbox'
export type { EncryptedPayload } from '../../src/lib/client/crypto'
export { InvalidCommandError } from '../../src/lib/client/outbox'

export function runWithStorage<A, E>(
  storage: ClientStorageHandles,
  effect: Effect.Effect<A, E, ClientStorage>,
): Promise<A> {
  return Effect.runPromise(Effect.provideService(effect, ClientStorage, storage))
}

export function closeStorage(storage: ClientStorageHandles): void {
  storage.cache.close()
  storage.outbox.close()
}

export interface TestStorage extends ClientStorageHandles {
  close: () => void
}

export async function openStorage(userId: string): Promise<TestStorage> {
  const cacheDb = await Effect.runPromise(cache.openIdbCache(userId))
  const outboxDb = await Effect.runPromise(outbox.openOutbox(userId))
  return {
    cache: cacheDb,
    outbox: outboxDb,
    close: () => {
      cacheDb.close()
      outboxDb.close()
    },
  }
}

/** Only for the wrapper's error branches: opens one database on its own. */
export const openIdbCache = (userId: string) => Effect.runPromise(cache.openIdbCache(userId))

export const openOutbox = (userId: string) => Effect.runPromise(outbox.openOutbox(userId))

// -- cache ---------------------------------------------------------------------

export const getAllEntities = <T extends cache.CachedEntity = cache.CachedEntity>(
  storage: ClientStorageHandles,
  entityType: cache.SyncEntityType,
) => runWithStorage(storage, cache.getAllEntities<T>(entityType))

export const getEntity = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof cache.getEntity>
) => runWithStorage(storage, cache.getEntity(...args))

export const putEntity = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof cache.putEntity>
) => runWithStorage(storage, cache.putEntity(...args))

export const putEntities = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof cache.putEntities>
) => runWithStorage(storage, cache.putEntities(...args))

export const replaceEntities = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof cache.replaceEntities>
) => runWithStorage(storage, cache.replaceEntities(...args))

export const removeEntity = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof cache.removeEntity>
) => runWithStorage(storage, cache.removeEntity(...args))

export const clearEntityStore = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof cache.clearEntityStore>
) => runWithStorage(storage, cache.clearEntityStore(...args))

export const getRevision = (storage: ClientStorageHandles) =>
  runWithStorage(storage, cache.getRevision())

export const setRevision = (storage: ClientStorageHandles, revision: number) =>
  runWithStorage(storage, cache.setRevision(revision))

export const getCachedSettings = <T = unknown>(storage: ClientStorageHandles) =>
  runWithStorage(storage, cache.getCachedSettings<T>())

export const setCachedSettings = (storage: ClientStorageHandles, settings: unknown) =>
  runWithStorage(storage, cache.setCachedSettings(settings))

export const getCachedBootstrap = <T = unknown>(storage: ClientStorageHandles) =>
  runWithStorage(storage, cache.getCachedBootstrap<T>())

export const setCachedBootstrap = (storage: ClientStorageHandles, bootstrap: unknown) =>
  runWithStorage(storage, cache.setCachedBootstrap(bootstrap))

export const saveReadModel = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof cache.saveReadModel>
) => runWithStorage(storage, cache.saveReadModel(...args))

export const wipeIdbCache = (userId: string) => Effect.runPromise(cache.wipeIdbCache(userId))

// -- outbox --------------------------------------------------------------------

export const enqueue = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof outbox.enqueue>
) => runWithStorage(storage, outbox.enqueue(...args))

export const listAll = (storage: ClientStorageHandles) => runWithStorage(storage, outbox.listAll())

export const peekBatch = (storage: ClientStorageHandles, limit?: number) =>
  runWithStorage(storage, outbox.peekBatch(limit))

export const count = (storage: ClientStorageHandles) => runWithStorage(storage, outbox.count())

export const acknowledge = (storage: ClientStorageHandles, seqs: number[]) =>
  runWithStorage(storage, outbox.acknowledge(seqs))

export const recordFailure = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof outbox.recordFailure>
) => runWithStorage(storage, outbox.recordFailure(...args))

export const clear = (storage: ClientStorageHandles) => runWithStorage(storage, outbox.clear())

export const findPendingCreate = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof outbox.findPendingCreate>
) => runWithStorage(storage, outbox.findPendingCreate(...args))

export const amendPendingCreate = (
  storage: ClientStorageHandles,
  ...args: Parameters<typeof outbox.amendPendingCreate>
) => runWithStorage(storage, outbox.amendPendingCreate(...args))

export const discard = (storage: ClientStorageHandles, seq: number) =>
  runWithStorage(storage, outbox.discard(seq))

export const wipeOutbox = (userId: string) => Effect.runPromise(outbox.wipeOutbox(userId))

// -- crypto and wipe -----------------------------------------------------------

export const getOrCreateEncryptionKey = (userId: string) =>
  Effect.runPromise(crypto.getOrCreateEncryptionKey(userId))

export const encryptText = (key: CryptoKey, plaintext: string) =>
  Effect.runPromise(crypto.encryptText(key, plaintext))

export const decryptText = (key: CryptoKey, payload: crypto.EncryptedPayload) =>
  Effect.runPromise(crypto.decryptText(key, payload))

export const wipeEncryptionKey = (userId: string) =>
  Effect.runPromise(crypto.wipeEncryptionKey(userId))

export const wipeAllClientData = (userId: string) =>
  Effect.runPromise(wipe.wipeAllClientData(userId))

export { wipeLegacyClientData } from '../../src/lib/client/wipe'
