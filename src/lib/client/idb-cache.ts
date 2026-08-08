/**
 * IndexedDB-backed local cache (WP7), keyed per authenticated identity.
 *
 * Replaces the `localStorage` whole-blob cache (`src/scripts/state.ts`) for
 * the v2 sync path: one database per `userId`, one object store per
 * `SyncEntityType` (see `src/lib/server/sync/command-schemas.ts`, imported
 * here read-only so the entity list can never drift from the server
 * contract), plus a small `__meta` store for the sync revision cursor and
 * the `user_settings` singleton.
 *
 * This module is intentionally dumb storage — no network calls, no
 * conflict logic. `src/stores/sync.ts` owns the sync loop and decides what
 * goes in/out of here.
 */

import { SYNC_ENTITY_TYPES, type SyncEntityType } from "../server/sync/command-schemas";

const DB_VERSION = 1;
const META_STORE = "__meta";
const REVISION_KEY = "revision";
const SETTINGS_KEY = "settings";

export interface CachedEntity {
  id: string;
  [key: string]: unknown;
}

function dbNameFor(userId: string): string {
  return `finance-tracker-cache-v2:${userId}`;
}

/** Opens (creating/upgrading if needed) the per-user cache database. */
export function openIdbCache(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbNameFor(userId), DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const entityType of SYNC_ENTITY_TYPES) {
        if (!db.objectStoreNames.contains(entityType)) {
          db.createObjectStore(entityType, { keyPath: "id" });
        }
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la caché IndexedDB."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Fallo en operación IndexedDB."));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Fallo en transacción IndexedDB."));
    tx.onabort = () => reject(tx.error ?? new Error("Transacción IndexedDB abortada."));
  });
}

/** Returns every cached record for one entity type. */
export async function getAllEntities<T extends CachedEntity = CachedEntity>(
  db: IDBDatabase,
  entityType: SyncEntityType,
): Promise<T[]> {
  const tx = db.transaction(entityType, "readonly");
  const store = tx.objectStore(entityType);
  const result = await requestToPromise(store.getAll() as IDBRequest<T[]>);
  await txDone(tx);
  return result;
}

/** Returns one cached record by id, or `undefined` if absent. */
export async function getEntity<T extends CachedEntity = CachedEntity>(
  db: IDBDatabase,
  entityType: SyncEntityType,
  id: string,
): Promise<T | undefined> {
  const tx = db.transaction(entityType, "readonly");
  const store = tx.objectStore(entityType);
  const result = await requestToPromise(store.get(id) as IDBRequest<T | undefined>);
  await txDone(tx);
  return result;
}

/** Upserts one record. */
export async function putEntity(
  db: IDBDatabase,
  entityType: SyncEntityType,
  entity: CachedEntity,
): Promise<void> {
  const tx = db.transaction(entityType, "readwrite");
  tx.objectStore(entityType).put(entity);
  await txDone(tx);
}

/** Upserts many records for one entity type in a single transaction. */
export async function putEntities(
  db: IDBDatabase,
  entityType: SyncEntityType,
  entities: CachedEntity[],
): Promise<void> {
  const tx = db.transaction(entityType, "readwrite");
  const store = tx.objectStore(entityType);
  for (const entity of entities) {
    store.put(entity);
  }
  await txDone(tx);
}

/** Replaces every cached record for one entity type (bootstrap/full refresh). */
export async function replaceEntities(
  db: IDBDatabase,
  entityType: SyncEntityType,
  entities: CachedEntity[],
): Promise<void> {
  const tx = db.transaction(entityType, "readwrite");
  const store = tx.objectStore(entityType);
  store.clear();
  for (const entity of entities) {
    store.put(entity);
  }
  await txDone(tx);
}

/** Removes one record by id. No-op if absent. */
export async function removeEntity(db: IDBDatabase, entityType: SyncEntityType, id: string): Promise<void> {
  const tx = db.transaction(entityType, "readwrite");
  tx.objectStore(entityType).delete(id);
  await txDone(tx);
}

/** Clears every record for one entity type. */
export async function clearEntityStore(db: IDBDatabase, entityType: SyncEntityType): Promise<void> {
  const tx = db.transaction(entityType, "readwrite");
  tx.objectStore(entityType).clear();
  await txDone(tx);
}

/** Reads the last-applied `/api/changes` revision cursor, defaulting to 0. */
export async function getRevision(db: IDBDatabase): Promise<number> {
  const tx = db.transaction(META_STORE, "readonly");
  const row = await requestToPromise(
    tx.objectStore(META_STORE).get(REVISION_KEY) as IDBRequest<{ key: string; value: number } | undefined>,
  );
  await txDone(tx);
  return row?.value ?? 0;
}

/** Persists the sync revision cursor. */
export async function setRevision(db: IDBDatabase, revision: number): Promise<void> {
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ key: REVISION_KEY, value: revision });
  await txDone(tx);
}

/** Reads the cached `user_settings` singleton, or `null` if never bootstrapped. */
export async function getCachedSettings<T = unknown>(db: IDBDatabase): Promise<T | null> {
  const tx = db.transaction(META_STORE, "readonly");
  const row = await requestToPromise(
    tx.objectStore(META_STORE).get(SETTINGS_KEY) as IDBRequest<{ key: string; value: T } | undefined>,
  );
  await txDone(tx);
  return row?.value ?? null;
}

/** Persists the `user_settings` singleton. */
export async function setCachedSettings<T = unknown>(db: IDBDatabase, settings: T): Promise<void> {
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ key: SETTINGS_KEY, value: settings });
  await txDone(tx);
}

/** Deletes the entire per-user cache database (logout / "empezar de cero"). */
export function wipeIdbCache(userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbNameFor(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("No se pudo borrar la caché IndexedDB."));
    // Some browsers fire onblocked instead of onsuccess if a connection is
    // still open elsewhere (e.g. another tab) — resolve anyway, best-effort.
    request.onblocked = () => resolve();
  });
}

export { SYNC_ENTITY_TYPES };
export type { SyncEntityType };
