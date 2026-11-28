/**
 * WP5 — real D1 test tier.
 *
 * This tier applies the real `migrations-v2/*.sql` files against an
 * actual SQLite engine (`better-sqlite3`) — the same dialect D1 runs on —
 * and wraps it with the *same* Drizzle schema (`src/db/schema`) that
 * `src/db/client.ts#getDb` binds to the real D1 binding in production.
 * Repository tests (WP6) and API-route tests (WP4) should build their
 * fixtures on top of `createTestDb()` rather than hand-rolling SQL.
 *
 * `better-sqlite3` was chosen over `node:sqlite` for this tier because
 * Drizzle's bundled `node:sqlite` support is incomplete (its prepared
 * statements don't expose the `.raw()` accessor Drizzle's sqlite-core
 * dialect needs for `select` queries with a `fields` mapping), so the
 * full query builder — which WP6's repositories will rely on — does not
 * work end-to-end against it. `drizzle-orm/better-sqlite3` is a
 * first-class, fully-supported driver and gives an identical dialect
 * without that gap. `wrangler`'s `getPlatformProxy`/Miniflare was also
 * considered, but spinning up a Workers runtime per test file is far
 * slower and non-deterministic across parallel Vitest workers; a fresh
 * in-memory `better-sqlite3` database per test gives the same SQL engine
 * with instant, isolated setup/teardown.
 */

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "../../../src/db/schema";

const MIGRATIONS_DIR = resolve(process.cwd(), "migrations-v2");

/** Reads every `NNNN_*.sql` file in `migrations-v2/`, in order. */
function readMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"));
}

/**
 * drizzle-kit separates statements within a migration file with this
 * marker; `wrangler d1 migrations apply` splits on it internally, and so
 * does `tests/unit/schema-v2.test.ts` — mirrored here so both tiers stay
 * consistent with how the migration is actually replayed against D1.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export type TestDb = BetterSQLite3Database<typeof schema>;

export interface TestDatabase {
  /** Drizzle client, schema-typed exactly like production's `getDb(locals)`. */
  db: TestDb;
  /** Underlying better-sqlite3 handle, for raw `PRAGMA`/inspection needs. */
  sqlite: Database.Database;
  /** Closes the underlying connection; call in `afterEach`/`afterAll`. */
  close: () => void;
}

/** A statement the test database executed, with the values bound to it. */
export interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

/**
 * Records the statements a test database executes, so a test can assert on
 * how many queries reach a table and which ids they carry at the persistence
 * boundary, without spying on repository helpers. Pass `onStatement` to
 * `createTestDb`; call `clear()` after seeding to observe only the code under
 * test.
 */
export function createStatementRecorder() {
  let statements: ExecutedStatement[] = [];
  return {
    onStatement: (statement: ExecutedStatement) => {
      statements.push(statement);
    },
    clear: () => {
      statements = [];
    },
    /** The SELECT statements that read `table` since the last `clear()`. */
    selectsFrom: (table: string): ExecutedStatement[] =>
      statements.filter(
        ({ sql }) =>
          /^\s*select\b/i.test(sql) &&
          new RegExp(`\\bfrom\\s+["\`]?${table}["\`]?(\\s|$)`, "i").test(sql),
      ),
  };
}

/**
 * Spins up a fresh in-memory SQLite database with `migrations-v2/*.sql`
 * applied and foreign-key enforcement turned on (SQLite defaults it off,
 * unlike D1 which enforces it), ready for repository/API-route tests.
 */
export function createTestDb(
  options: { onStatement?: (statement: ExecutedStatement) => void } = {},
): TestDatabase {
  const sqlite = new Database(":memory:");
  const { onStatement } = options;
  if (onStatement) {
    // Observes every execution of a prepared statement (what Drizzle uses)
    // together with its bound values; the real statement still runs.
    const prepare = sqlite.prepare.bind(sqlite) as (source: string) => Database.Statement;
    (sqlite as { prepare: unknown }).prepare = (source: string) => {
      const statement = prepare(source);
      for (const method of ["run", "all", "get", "iterate"] as const) {
        const execute = (statement[method] as (...args: unknown[]) => unknown).bind(statement);
        (statement as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
          onStatement({ sql: source, params: args.flat(Infinity) });
          return execute(...args);
        };
      }
      return statement;
    };
  }
  sqlite.pragma("foreign_keys = ON");

  for (const migration of readMigrationFiles()) {
    for (const statement of splitStatements(migration)) {
      sqlite.exec(statement);
    }
  }

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
