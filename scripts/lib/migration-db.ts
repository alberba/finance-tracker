/**
 * I/O adapters for the WP9 migration tooling: opening/creating the local v2
 * staging SQLite database, reading the v1 source (local SQLite file, a raw
 * JSON export, or `wrangler d1 execute --remote`), and — for the "remote D1
 * later" path — dumping the migrated user's v2 rows as SQL statements that
 * `wrangler d1 execute finance-tracker-db-v2 --remote --file=<path>` can
 * apply, mirroring the existing `scripts/export-sqlite-to-d1.mjs` convention
 * of generating SQL for wrangler rather than talking to D1's HTTP API
 * directly (no Workers runtime is available from a plain Node script).
 */

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import * as schema from "../../src/db/schema";

const MIGRATIONS_DIR = resolve(process.cwd(), "migrations-v2");

function readMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"));
}

/** Mirrors `tests/integration/d1-v2/setup.ts`'s statement splitting. */
function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export type V2Db = BetterSQLite3Database<typeof schema>;

export interface LocalV2Database {
  db: V2Db;
  sqlite: Database.Database;
  close: () => void;
}

/**
 * Opens (creating + migrating if new) a persistent local v2 SQLite file.
 * This is the actual write target for every migration run — "remote D1"
 * support (`--remote-sql-out`) dumps the resulting rows from this file
 * rather than writing to D1 directly (see module doc comment).
 */
export function openLocalV2Db(path: string): LocalV2Database {
  const isNew = !existsSync(path);
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  if (isNew) {
    for (const migration of readMigrationFiles()) {
      for (const statement of splitStatements(migration)) {
        sqlite.exec(statement);
      }
    }
  }
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

/** Reads `app_state.<namespace>`, falling back to `app_state.current` (per WP9's plan). */
export function readV1StateFromLocalSqlite(path: string, namespace = "default"): unknown {
  const db = new DatabaseSync(path);
  try {
    const primary = db.prepare("SELECT payload FROM app_state WHERE id = ? LIMIT 1").get(namespace) as
      | { payload?: string }
      | undefined;
    const row =
      primary?.payload != null
        ? primary
        : (db.prepare("SELECT payload FROM app_state WHERE id = ? LIMIT 1").get("current") as
            | { payload?: string }
            | undefined);
    if (row?.payload == null) {
      throw new Error(`No app_state row found for '${namespace}' or 'current' in ${path}.`);
    }
    return JSON.parse(row.payload);
  } finally {
    db.close();
  }
}

export function readV1StateFromJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Shells out to `wrangler d1 execute <db> --remote --json`, mirroring the local-sqlite read path. */
export function readV1StateFromWranglerRemote(dbName: string, namespace = "default"): unknown {
  const run = (id: string) =>
    execFileSync(
      "wrangler",
      ["d1", "execute", dbName, "--remote", "--json", "--command", `SELECT payload FROM app_state WHERE id = '${id}' LIMIT 1`],
      { encoding: "utf8" },
    );
  const parseResult = (raw: string): string | undefined => {
    const parsed = JSON.parse(raw) as Array<{ results?: Array<{ payload?: string }> }>;
    return parsed[0]?.results?.[0]?.payload;
  };
  const primary = parseResult(run(namespace));
  const payload = primary ?? parseResult(run("current"));
  if (payload == null) {
    throw new Error(`No app_state row found for '${namespace}' or 'current' in remote D1 '${dbName}'.`);
  }
  return JSON.parse(payload);
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Dumps every row belonging to `userId` (plus any global market reference
 * rows it points to) across every v2 table, as idempotent
 * `INSERT ... ON CONFLICT(id) DO NOTHING` statements — ready for
 * `wrangler d1 execute finance-tracker-db-v2 --remote --file=<out>`.
 */
export function dumpUserRowsAsSql(
  sqlite: Database.Database,
  userId: string,
  outPath: string,
  replaceExistingUserData = false,
): void {
  const userScopedTables = [
    "users",
    "accounts",
    "categories",
    "twr_liquidity_accounts",
    "transactions",
    "investment_trade_details",
    "subscriptions",
    "recurring_rules",
    "pending_movements",
    "budget_entries",
    "goals",
    "wealth_snapshots",
    "snapshot_balances",
    "contributions",
    "contribution_allocations",
    "user_instruments",
    "integration_credentials",
    "stockevents_symbol_mappings",
  ];

  const statements: string[] = [
    "-- Generated by scripts/migrate-v1-to-v2.ts (--remote-sql-out).",
    "-- Apply with: wrangler d1 execute finance-tracker-db-v2 --remote --file=<this file>",
    "",
  ];

  if (replaceExistingUserData) {
    const userIdSql = sqlLiteral(userId);
    const deleteOrder = [
      "contribution_allocations", "snapshot_balances", "investment_trade_details",
      "pending_movements", "recurring_rules", "subscriptions", "budget_entries", "goals",
      "transactions", "twr_liquidity_accounts", "stockevents_symbol_mappings",
      "user_instruments", "contributions", "wealth_snapshots", "categories", "accounts",
      "sync_changes", "sync_commands", "audit_events", "user_revisions",
    ];
    statements.push("-- Replace only this user's financial/read-model data; identity and credentials survive.");
    for (const table of deleteOrder) statements.push(`DELETE FROM ${table} WHERE user_id = ${userIdSql};`);
    statements.push("");
  }

  const instrumentIds = new Set<string>();

  for (const table of userScopedTables) {
    const ownerColumn = table === "users" ? "id" : "user_id";
    const rows = sqlite.prepare(`SELECT * FROM ${table} WHERE ${ownerColumn} = ?`).all(userId) as Array<Record<string, unknown>>;
    for (const row of rows) {
      if (table === "user_instruments" && row.instrument_id) {
        instrumentIds.add(String(row.instrument_id));
      }
      statements.push(...insertStatement(table, row));
    }
  }

  if (instrumentIds.size > 0) {
    const placeholders = Array.from(instrumentIds)
      .map((id) => sqlLiteral(id))
      .join(", ");
    const instrumentRows = sqlite
      .prepare(`SELECT * FROM market_instruments WHERE id IN (${placeholders})`)
      .all() as Array<Record<string, unknown>>;
    for (const row of instrumentRows) {
      statements.push(...insertStatement("market_instruments", row));
    }
    const quoteRows = sqlite
      .prepare(`SELECT * FROM market_quotes WHERE instrument_id IN (${placeholders})`)
      .all() as Array<Record<string, unknown>>;
    for (const row of quoteRows) {
      statements.push(...insertStatement("market_quotes", row));
    }
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${statements.join("\n")}\n`, "utf8");
}

function insertStatement(table: string, row: Record<string, unknown>): string[] {
  const columns = Object.keys(row);
  const values = columns.map((c) => sqlLiteral(row[c]));
  return [
    `INSERT INTO ${table} (${columns.join(", ")})`,
    `VALUES (${values.join(", ")})`,
    "ON CONFLICT(id) DO NOTHING;",
    "",
  ];
}
