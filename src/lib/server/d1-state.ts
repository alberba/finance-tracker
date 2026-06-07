import { FINANCE_TRACKER_SEED } from "../../data/seed";

const DEFAULT_NAMESPACE = "default";
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_state (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

type StateRow = {
  payload?: string;
};

export type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  first: () => Promise<unknown>;
  run: () => Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike;
};

function seedClone(): unknown {
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

async function upsertState(
  db: D1DatabaseLike,
  namespace: string,
  value: unknown,
): Promise<void> {
  const sql = `
    INSERT INTO app_state (id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at;
  `;
  await db
    .prepare(sql)
    .bind(
      normalizeNamespace(namespace),
      toPayload(value),
      new Date().toISOString(),
    )
    .run();
}

export async function loadStateFromD1(
  db: D1DatabaseLike,
  namespace?: string,
): Promise<unknown> {
  await ensureSchema(db);
  const key = normalizeNamespace(namespace);
  const row = (await db
    .prepare("SELECT payload FROM app_state WHERE id = ? LIMIT 1")
    .bind(key)
    .first()) as StateRow | null;

  const parsed = row?.payload ? parsePayload(row.payload) : null;
  if (parsed !== null) {
    return parsed;
  }

  const seed = seedClone();
  await upsertState(db, key, seed);
  return seed;
}

export async function saveStateToD1(
  db: D1DatabaseLike,
  namespace: string | undefined,
  value: unknown,
): Promise<void> {
  await ensureSchema(db);
  await upsertState(db, normalizeNamespace(namespace), value);
}

export async function resetStateInD1(
  db: D1DatabaseLike,
  namespace?: string,
): Promise<unknown> {
  await ensureSchema(db);
  const key = normalizeNamespace(namespace);
  const seed = seedClone();
  await upsertState(db, key, seed);
  return seed;
}
