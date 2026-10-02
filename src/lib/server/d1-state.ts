import { FINANCE_TRACKER_SEED } from "../../data/seed";
import { buildDemoSeed } from "../../data/demo-seed";

const DEFAULT_NAMESPACE = "default";
/** El namespace `demo` se siembra con datos sintéticos, nunca con el seed real. */
const DEMO_NAMESPACE = "demo";
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_state (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
  );
`;

type StateRow = {
  payload?: string;
  updated_at?: string;
  version?: number;
};

export type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  first: () => Promise<unknown>;
  run: () => Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike;
};

/** A point-in-time view of the stored state plus its concurrency metadata. */
export interface StateSnapshot {
  state: unknown;
  version: number;
  updatedAt: string | null;
}

/**
 * Result of a write attempt. `ok: false` means the caller's `baseVersion` no
 * longer matches the server, so the write was rejected to avoid clobbering a
 * change made by another device; `current` carries the latest server snapshot.
 */
export type SaveOutcome =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; conflict: true; current: StateSnapshot };

function seedClone(namespace: string = DEFAULT_NAMESPACE): unknown {
  if (namespace === DEMO_NAMESPACE) {
    return buildDemoSeed();
  }
  return JSON.parse(JSON.stringify(FINANCE_TRACKER_SEED));
}

function normalizeNamespace(value: string | null | undefined): string {
  const input = String(value || "")
    .trim()
    .toLowerCase();
  if (!input) {
    return DEFAULT_NAMESPACE;
  }

  const safe = input.replace(/[^a-z0-9_-]/g, "").slice(0, 64);
  return safe || DEFAULT_NAMESPACE;
}

function toPayload(value: unknown): string {
  return JSON.stringify(value);
}

function parsePayload(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function ensureSchema(db: D1DatabaseLike): Promise<void> {
  await db.prepare(CREATE_TABLE_SQL).run();
}

async function readRow(
  db: D1DatabaseLike,
  key: string,
): Promise<StateRow | null> {
  return (await db
    .prepare("SELECT payload, updated_at, version FROM app_state WHERE id = ? LIMIT 1")
    .bind(key)
    .first()) as StateRow | null;
}

async function writeRow(
  db: D1DatabaseLike,
  key: string,
  value: unknown,
  version: number,
  updatedAt: string,
): Promise<void> {
  const sql = `
    INSERT INTO app_state (id, payload, updated_at, version)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      version = excluded.version;
  `;
  await db.prepare(sql).bind(key, toPayload(value), updatedAt, version).run();
}

export async function loadStateFromD1(
  db: D1DatabaseLike,
  namespace?: string,
): Promise<StateSnapshot> {
  await ensureSchema(db);
  const key = normalizeNamespace(namespace);
  const row = await readRow(db, key);

  const parsed = row?.payload ? parsePayload(row.payload) : null;
  if (parsed !== null) {
    return {
      state: parsed,
      version: Number(row?.version ?? 0),
      updatedAt: row?.updated_at ?? null,
    };
  }

  // No usable row yet: seed it so first-time clients get a consistent baseline.
  const seed = seedClone(key);
  const updatedAt = new Date().toISOString();
  await writeRow(db, key, seed, 1, updatedAt);
  return { state: seed, version: 1, updatedAt };
}

/**
 * Persists `value` under `namespace`. When `baseVersion` is a number it is
 * compared against the current server version: a mismatch rejects the write as
 * a conflict. Pass `undefined` to force-overwrite (first write, imports, reset).
 */
export async function saveStateToD1(
  db: D1DatabaseLike,
  namespace: string | undefined,
  value: unknown,
  baseVersion?: number,
): Promise<SaveOutcome> {
  await ensureSchema(db);
  const key = normalizeNamespace(namespace);
  const row = await readRow(db, key);
  const currentVersion = row ? Number(row.version ?? 0) : null;

  if (
    typeof baseVersion === "number" &&
    currentVersion !== null &&
    baseVersion !== currentVersion
  ) {
    const parsed = row?.payload ? parsePayload(row.payload) : null;
    return {
      ok: false,
      conflict: true,
      current: {
        state: parsed ?? seedClone(key),
        version: currentVersion,
        updatedAt: row?.updated_at ?? null,
      },
    };
  }

  const nextVersion = (currentVersion ?? 0) + 1;
  const updatedAt = new Date().toISOString();
  await writeRow(db, key, value, nextVersion, updatedAt);
  return { ok: true, version: nextVersion, updatedAt };
}

export async function resetStateInD1(
  db: D1DatabaseLike,
  namespace?: string,
): Promise<StateSnapshot> {
  await ensureSchema(db);
  const key = normalizeNamespace(namespace);
  const row = await readRow(db, key);
  const nextVersion = (row ? Number(row.version ?? 0) : 0) + 1;
  const seed = seedClone(key);
  const updatedAt = new Date().toISOString();
  // Remove the row and let the next GET lazily seed it. This keeps reset
  // independent from the large-payload write path and avoids repeatedly
  // replacing the same blob during E2E setup.
  await db.prepare("DELETE FROM app_state WHERE id = ?").bind(key).run();
  return { state: seed, version: nextVersion, updatedAt };
}
