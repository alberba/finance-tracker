import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FINANCE_TRACKER_SEED } from "../../data/seed";

const DB_FILE_PATH = process.env.FINANCE_TRACKER_DB_PATH || resolve(process.cwd(), ".data/finance-tracker.sqlite");
const DEFAULT_NAMESPACE = "default";

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) {
    return db;
  }

  mkdirSync(dirname(DB_FILE_PATH), { recursive: true });
  db = new DatabaseSync(DB_FILE_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return db;
}

function seedClone(): unknown {
  return JSON.parse(JSON.stringify(FINANCE_TRACKER_SEED));
}

function normalizeNamespace(value: string | null | undefined): string {
  const input = String(value || "").trim().toLowerCase();
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

function upsertState(namespace: string, value: unknown): void {
  const sql = `
    INSERT INTO app_state (id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at;
  `;
  const key = normalizeNamespace(namespace);
  getDb().prepare(sql).run(key, toPayload(value), new Date().toISOString());
}

export function loadStateFromSqlite(namespace?: string): unknown {
  const key = normalizeNamespace(namespace);
  const row = getDb().prepare("SELECT payload FROM app_state WHERE id = ? LIMIT 1").get(key) as
    | { payload?: string }
    | undefined;

  const parsed = row?.payload ? parsePayload(row.payload) : null;
  if (parsed !== null) {
    return parsed;
  }

  const seed = seedClone();
  upsertState(key, seed);
  return seed;
}

export function saveStateToSqlite(namespace: string | undefined, value: unknown): void {
  upsertState(normalizeNamespace(namespace), value);
}

export function resetStateInSqlite(namespace?: string): unknown {
  const key = normalizeNamespace(namespace);
  const seed = seedClone();
  upsertState(key, seed);
  return seed;
}
