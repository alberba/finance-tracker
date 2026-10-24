/**
 * Full client-storage wipe (WP7) — logout must leave nothing recoverable
 * for the identity that just signed out: cached entities, the outbox, and
 * the non-extractable encryption key all live in separate IndexedDB
 * databases, so all three need deleting.
 *
 * The wipe is an `Effect` (ADR-0006): each database deletion is typed, and
 * the sync store runs the whole program at its logout edge.
 */

import { Effect } from 'effect'

import { wipeEncryptionKey } from './crypto'
import { wipeIdbCache } from './idb-cache'
import { wipeOutbox } from './outbox'
import type { ClientStorageError } from './storage'

const LEGACY_STORAGE_KEYS = [
  'finance-tracker-state-v1',
  'finance-tracker-state-v2',
  'finance-tracker-server-version-v1',
  'finance-tracker-pending-v1',
  'finance-tracker-state-v1::demo',
  'finance-tracker-state-v2::demo',
  'finance-tracker-server-version-v1::demo',
  'finance-tracker-pending-v1::demo',
]

export function wipeLegacyClientData(): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  for (const key of LEGACY_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}

export const wipeAllClientData = (userId: string): Effect.Effect<void, ClientStorageError> =>
  Effect.gen(function* () {
    wipeLegacyClientData()
    yield* wipeIdbCache(userId)
    yield* wipeOutbox(userId)
    yield* wipeEncryptionKey(userId)
  })
