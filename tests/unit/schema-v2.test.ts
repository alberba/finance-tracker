import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * WP1 acceptance criterion: every v2 table has a `user_id` column and money
 * columns use `INTEGER` (minimal unit), never `REAL`. Runs the generated
 * `migrations-v2/0001_init_v2.sql` against a real in-memory SQLite engine
 * (via Node's built-in `node:sqlite`) and inspects `PRAGMA table_info`,
 * mirroring the `node:sqlite`-based pattern used by local database tooling.
 */

const MIGRATION_PATH = resolve(process.cwd(), "migrations-v2/0001_init_v2.sql");

/**
 * Tables intentionally without a `user_id` column: `users` itself (its `id`
 * IS the user identity — see `src/db/schema/users.ts`), and the two global
 * market-data reference tables (`src/db/schema/market.ts`).
 */
const TABLES_WITHOUT_USER_ID = new Set(["users", "market_instruments", "market_quotes"]);

/** Columns ending in these suffixes must be `INTEGER` minor units, never `REAL`. */
const MONEY_COLUMN_SUFFIXES = ["_minor"];

type ColumnInfo = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
};

let db: DatabaseSync;
let tableNames: string[];

beforeAll(() => {
  db = new DatabaseSync(":memory:");
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  // The generated migration uses drizzle-kit's `--> statement-breakpoint`
  // marker between statements; `node:sqlite` executes one statement at a
  // time via `exec`, so split on it the same way `wrangler d1 migrations`
  // does internally.
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    db.exec(statement);
  }

  tableNames = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((row) => row.name);
});

function columnsOf(table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

describe("v2 schema — migrations-v2/0001_init_v2.sql", () => {
  it("gives every table (except declared global reference tables) a user_id column", () => {
    for (const table of tableNames) {
      const columns = columnsOf(table);
      const userIdColumn = columns.find((c) => c.name === "user_id");
      if (TABLES_WITHOUT_USER_ID.has(table)) {
        expect(
          userIdColumn,
          `${table} is a declared global table and should NOT have user_id`,
        ).toBeUndefined();
      } else {
        expect(userIdColumn, `${table} is missing a user_id column`).toBeDefined();
        expect(userIdColumn?.notnull).toBe(1);
      }
    }
  });

  it("never stores money as REAL — every *_minor column is INTEGER", () => {
    let checkedAtLeastOne = false;
    for (const table of tableNames) {
      const columns = columnsOf(table);
      for (const column of columns) {
        if (MONEY_COLUMN_SUFFIXES.some((suffix) => column.name.endsWith(suffix))) {
          checkedAtLeastOne = true;
          expect(
            column.type.toUpperCase(),
            `${table}.${column.name} must be INTEGER, not ${column.type}`,
          ).toBe("INTEGER");
        }
      }
    }
    expect(checkedAtLeastOne).toBe(true);
  });

  it("pairs every money column with a sibling currency TEXT column", () => {
    for (const table of tableNames) {
      const columns = columnsOf(table);
      const hasMoney = columns.some((c) => c.name.endsWith("_minor"));
      if (!hasMoney) continue;
      const currencyColumn = columns.find((c) => c.name === "currency");
      expect(
        currencyColumn,
        `${table} has a money column but no sibling currency column`,
      ).toBeDefined();
      expect(currencyColumn?.type.toUpperCase()).toBe("TEXT");
    }
  });

  it("gives every table a TEXT primary key (UUIDv7 style, never autoincrement)", () => {
    for (const table of tableNames) {
      const columns = columnsOf(table);
      const pkColumns = columns.filter((c) => c.pk > 0);
      expect(pkColumns.length, `${table} has no primary key`).toBeGreaterThan(0);
      for (const pkColumn of pkColumns) {
        expect(pkColumn.type.toUpperCase()).toBe("TEXT");
      }
    }
  });
});
