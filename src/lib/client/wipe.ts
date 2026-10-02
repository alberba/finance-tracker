/**
 * Full client-storage wipe (WP7) — logout must leave nothing recoverable
 * for the identity that just signed out: cached entities, the outbox, and
 * the non-extractable encryption key all live in separate IndexedDB
 * databases, so all three need deleting.
 */

import { wipeIdbCache } from "./idb-cache";
import { wipeOutbox } from "./outbox";
import { wipeEncryptionKey } from "./crypto";

const LEGACY_STORAGE_KEYS = [
  "finance-tracker-state-v1",
  "finance-tracker-server-version-v1",
  "finance-tracker-pending-v1",
  "finance-tracker-state-v1::demo",
  "finance-tracker-server-version-v1::demo",
  "finance-tracker-pending-v1::demo",
];

export function wipeLegacyClientData(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  for (const key of LEGACY_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

export async function wipeAllClientData(userId: string): Promise<void> {
  wipeLegacyClientData();
  await Promise.all([wipeIdbCache(userId), wipeOutbox(userId), wipeEncryptionKey(userId)]);
}
