/**
 * Shared helpers for the WP6 repository layer.
 *
 * Per `docs/migration/work-packages.md` WP6's design decisions, repositories
 * under `src/db/repositories/*` are the *only* code allowed to call Drizzle
 * directly — API routes (WP4) and the migration tool (WP9) go through these
 * modules, never raw SQL. Every exported method here (and in every sibling
 * repository file) takes `userId` explicitly and scopes every query by it,
 * so cross-tenant access is impossible to forget at a call site even though
 * the schema already enforces it via FK.
 */

import { and, eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "../schema";

/**
 * Repository-facing Drizzle handle type.
 *
 * Deliberately driver-agnostic (`BaseSQLiteDatabase<any, any, ...>` rather
 * than `DrizzleD1Database`, which `src/db/client.ts#getDb` returns in
 * production): WP5's integration tier (`tests/integration/d1-v2/setup.ts`)
 * exercises these same repository functions against a `better-sqlite3`
 * (`'sync'`) driver instead of D1's (`'async'`) one, and both concrete
 * classes structurally satisfy this looser type. Every call site still
 * `await`s the result, which is a no-op on an already-resolved value, so
 * this has no runtime effect either way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-agnostic on purpose, see doc comment above
export type Db = BaseSQLiteDatabase<any, any, typeof schema>;

/** Current timestamp in the ISO-8601 string format every table's timestamp columns use. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Converts a boolean domain flag to the `0`/`1` integer flag columns use. */
export function toFlag(value: boolean | undefined, fallback = 0): number {
  if (value === undefined) {
    return fallback;
  }
  return value ? 1 : 0;
}

/** Converts a `0`/`1` integer flag column back to a boolean. */
export function fromFlag(value: number): boolean {
  return value === 1;
}

/**
 * Runs `fn` inside a `BEGIN`/`COMMIT` (or `ROLLBACK` on throw) block, driven
 * by raw SQL rather than each driver's own `Db#transaction()` wrapper
 * (consumed by WP4's `apply-command.ts` and the `state`/`data` routes).
 *
 * `Db#transaction()` cannot be used here: `drizzle-orm/better-sqlite3`
 * (WP5's test tier — see `tests/integration/d1-v2/setup.ts`) delegates to
 * `better-sqlite3`'s own synchronous `Database#transaction()`, which
 * throws `TypeError: Transaction function cannot return a promise` the
 * moment an `async` callback is passed to it — betterSqlite3's transaction
 * wrapper has no concept of awaiting a callback, so any repository call
 * inside it (all of which are `async`) breaks it. `drizzle-orm/d1`, by
 * contrast, implements its `transaction()` with exactly this same manual
 * `begin`/`commit`/`rollback`-via-raw-SQL approach (see
 * `node_modules/drizzle-orm/d1/session.cjs`), so doing it explicitly here
 * — instead of through either driver's `.transaction()` — is both the
 * only approach that works under the sync test tier *and* is functionally
 * identical to what already happens in production under D1.
 */
/**
 * WP10 fix: Cloudflare D1 — including the local Miniflare-backed instance
 * `astro dev`'s `platformProxy` spins up, exercised for the first time
 * end-to-end by this WP's E2E specs — unconditionally rejects raw
 * `BEGIN`/`SAVEPOINT` SQL with "please use the state.storage.transaction()
 * ... APIs instead" (that error message is Durable-Object-storage-specific
 * boilerplate D1 reuses; it does not apply to D1's own SQL database and D1
 * has no equivalent interactive-transaction API of its own). The
 * `better-sqlite3` driver (WP5's test tier) has no such restriction, which
 * is why every existing unit/integration test — none of which run against
 * real D1 — passed without ever exercising this path.
 *
 * There is currently no real multi-statement transaction primitive
 * available against D1 for the read-then-conditionally-write sequences
 * this function wraps (`apply-command.ts`, `principal.ts`'s first-auth
 * provisioning, `state/initialize.ts`, `data/import.ts`, `state/reset.ts`).
 * Detected once (module-scope) rather than per call, `runInTransaction`
 * degrades to running `fn` sequentially without atomicity when `BEGIN`
 * itself is rejected — better a best-effort non-atomic write (already the
 * effective behavior in production before this fix was noticed, since the
 * silently-thrown `BEGIN` error was crashing the whole request) than a
 * hard failure on every v2 write. A real fix (D1 `.batch()` restructuring,
 * or accepting eventual consistency via the idempotent command replay this
 * system already has) is tracked as a follow-up — flagging prominently
 * rather than re-architecting WP3/WP4/WP6 under this WP's budget.
 */
let beginUnsupported = false;

export async function runInTransaction<T>(db: Db, fn: (db: Db) => Promise<T>): Promise<T> {
  if (beginUnsupported) {
    return fn(db);
  }
  try {
    await db.run(sql.raw("begin"));
  } catch {
    beginUnsupported = true;
    return fn(db);
  }
  try {
    const result = await fn(db);
    await db.run(sql`commit`);
    return result;
  } catch (error) {
    await db.run(sql`rollback`);
    throw error;
  }
}

/**
 * Cross-tenant FK-ownership guard (WP10 security fix).
 *
 * `accountId`/`categoryId` columns on `transactions`, `subscriptions`,
 * `recurring_rules`, `pending_movements`, and `categoryId` on
 * `budget_entries` only reference `accounts.id`/`categories.id` *globally*
 * at the schema level — SQLite's `FOREIGN KEY` constraint just asserts the
 * row exists, not that it belongs to the same `user_id`. Without this
 * check, a `create`/`update` sync command could attach an entity to
 * *another* user's real account/category id (guessed, or replayed from a
 * `sync_changes`/export payload) and it would silently succeed. Every
 * repository write path that accepts an `accountId`/`categoryId` from
 * untrusted (client) input must call this first; bulk-insert paths used
 * only by the trusted migration tool (WP9) are exempt.
 */
export async function assertOwnedReferences(
  db: Db,
  userId: string,
  refs: { accountId?: string | null; categoryId?: string | null; recurringRuleId?: string | null },
): Promise<void> {
  if (refs.accountId) {
    const [account] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.id, refs.accountId), eq(schema.accounts.userId, userId)));
    if (!account) {
      throw new Error("La cuenta indicada no existe o no pertenece al usuario.");
    }
  }
  if (refs.categoryId) {
    const [category] = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.id, refs.categoryId), eq(schema.categories.userId, userId)));
    if (!category) {
      throw new Error("La categoría indicada no existe o no pertenece al usuario.");
    }
  }
  if (refs.recurringRuleId) {
    const [rule] = await db
      .select({ id: schema.recurringRules.id })
      .from(schema.recurringRules)
      .where(
        and(eq(schema.recurringRules.id, refs.recurringRuleId), eq(schema.recurringRules.userId, userId)),
      );
    if (!rule) {
      throw new Error("La regla recurrente indicada no existe o no pertenece al usuario.");
    }
  }
}
