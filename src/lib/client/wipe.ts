/**
 * Full client-storage wipe (WP7) — logout must leave nothing recoverable
 * for the identity that just signed out: cached entities, the outbox, and
 * the non-extractable encryption key all live in separate IndexedDB
 * databases, so all three need deleting.
 */

import { wipeIdbCache } from "./idb-cache";
import { wipeOutbox } from "./outbox";
import { wipeEncryptionKey } from "./crypto";

export async function wipeAllClientData(userId: string): Promise<void> {
  await Promise.all([wipeIdbCache(userId), wipeOutbox(userId), wipeEncryptionKey(userId)]);
}
