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

import { and, eq, sql, is } from 'drizzle-orm'
import { DrizzleD1Database } from 'drizzle-orm/d1'
import { interactiveTransaction, type TransactionBinding } from '../transaction-capability'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from '../schema'

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
export type Db = BaseSQLiteDatabase<any, any, typeof schema>

/** Current timestamp in the ISO-8601 string format every table's timestamp columns use. */
export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Maximum number of bound parameters a single D1 statement accepts.
 *
 * FINANCE-TRACKER-7: `GET /api/bootstrap` returned a 500 with
 * `D1_ERROR: too many SQL variables` because its batch loaders handed every
 * id of the user's dataset to one `inArray(...)`, and SQLite/D1 rejects a
 * statement that binds more parameters than this ceiling. The batch loaders
 * are the ones that build those lists, so the fix belongs to this layer:
 * every unbounded `inArray` here must go through {@link chunkIds} instead of
 * passing the whole id list to a single query.
 */
export const MAX_SQL_VARIABLES_PER_STATEMENT = 50

/**
 * Splits `ids` into order-preserving chunks of at most `size` entries, so
 * each chunk can be passed to its own `inArray(...)`.
 *
 * Never returns an empty chunk array for non-empty input (that guarantee is
 * what lets callers accumulate rows in a loop without an extra
 * empty-input branch), and returns `[]` for empty input so the caller's own
 * early return stays the only empty-input path.
 */
export function chunkIds(
  ids: readonly string[],
  size: number = MAX_SQL_VARIABLES_PER_STATEMENT,
): string[][] {
  const chunks: string[][] = []
  for (let start = 0; start < ids.length; start += size) {
    chunks.push(ids.slice(start, start + size))
  }
  return chunks
}

/**
 * `WHERE` condition for the optimistic-concurrency guard, or `undefined` when
 * the caller has no version to pin.
 *
 * Every `update`/`remove` in this layer repeats the same ternary; keeping it
 * here means the guard has one definition instead of twenty-six copies.
 */
export function versionGuard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each table's version column is a different integer column type
  column: any,
  expectedVersion?: number,
) {
  return expectedVersion === undefined ? undefined : eq(column, expectedVersion)
}

/**
 * Identity the client minted for a new entity (ADR 0001), ready to spread into
 * an insert's values.
 *
 * Optional because the two writers differ: the client always sends one for an
 * entity it creates (the identity is its primary key from the first instant),
 * while imported entities may rely on the server-side UUIDv7 default for `id`
 * and remain reconcilable by their `legacyId`.
 */
export function clientIdentity(id: string | undefined): { id?: string } {
  return id ? { id } : {}
}

/** Converts a boolean domain flag to the `0`/`1` integer flag columns use. */
export function toFlag(value: boolean | undefined, fallback = 0): number {
  if (value === undefined) {
    return fallback
  }
  return value ? 1 : 0
}

/** Converts a `0`/`1` integer flag column back to a boolean. */
export function fromFlag(value: number): boolean {
  return value === 1
}

/**
 * Canonical form for an email before it is stored in or matched against
 * `users.email`.
 *
 * `users.email` is a plain `text ... unique` column, and SQLite compares text
 * case-sensitively, so `Owner@Example.com` and `owner@example.com` are two
 * different rows and two different lookups. Identity providers do not
 * guarantee any particular casing, and the cutover feeds the same address in
 * from three unrelated places — the `--legacy-owner-email` migration flag, the
 * `LEGACY_OWNER_EMAIL` variable, and the JWT's `email` claim. Normalizing at
 * every read and write is what keeps those three agreeing.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Local bindings own the connection across async callbacks. D1 explicitly
 * retains sequential, best-effort writes; a failed BEGIN never selects it.
 * Native SQLite test handles serialize manual transactions by connection;
 * production local reads and writes must use the owned binding.
 */
const nativeTransactions = new WeakMap<object, Promise<unknown>>()

export async function runInTransaction<T>(db: Db, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = ('$client' in db ? db.$client : undefined) as TransactionBinding | undefined
  if (client?.[interactiveTransaction]) {
    return client[interactiveTransaction](() => fn(db))
  }
  if (is(db, DrizzleD1Database)) return fn(db)
  const connection = client ?? db
  const previous = nativeTransactions.get(connection) ?? Promise.resolve()
  const result = previous.then(() => runNativeTransaction(db, fn))
  nativeTransactions.set(
    connection,
    result.catch(() => {}),
  )
  return result
}

async function runNativeTransaction<T>(db: Db, fn: (db: Db) => Promise<T>): Promise<T> {
  await db.run(sql.raw('begin'))
  try {
    const result = await fn(db)
    await db.run(sql`commit`)
    return result
  } catch (error) {
    await db.run(sql`rollback`)
    throw error
  }
}

/**
 * A write that can never succeed as submitted (dangling/foreign reference,
 * entity still in use). `applyOneCommand` turns it into a terminal
 * `rejected` outcome instead of a 500 the client would retry forever.
 */
export class RejectedCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RejectedCommandError'
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
  refs: {
    accountId?: string | null
    categoryId?: string | null
    recurringRuleId?: string | null
    snapshotId?: string | null
    contributionId?: string | null
  },
): Promise<void> {
  if (refs.accountId) {
    const [account] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.id, refs.accountId), eq(schema.accounts.userId, userId)))
    if (!account) {
      throw new RejectedCommandError('La cuenta indicada no existe o no pertenece al usuario.')
    }
  }
  if (refs.categoryId) {
    const [category] = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.id, refs.categoryId), eq(schema.categories.userId, userId)))
    if (!category) {
      throw new RejectedCommandError('La categoría indicada no existe o no pertenece al usuario.')
    }
  }
  if (refs.recurringRuleId) {
    const [rule] = await db
      .select({ id: schema.recurringRules.id })
      .from(schema.recurringRules)
      .where(
        and(
          eq(schema.recurringRules.id, refs.recurringRuleId),
          eq(schema.recurringRules.userId, userId),
        ),
      )
    if (!rule) {
      throw new RejectedCommandError(
        'La regla recurrente indicada no existe o no pertenece al usuario.',
      )
    }
  }
  if (refs.snapshotId) {
    const [snapshot] = await db
      .select({ id: schema.wealthSnapshots.id })
      .from(schema.wealthSnapshots)
      .where(
        and(
          eq(schema.wealthSnapshots.id, refs.snapshotId),
          eq(schema.wealthSnapshots.userId, userId),
        ),
      )
    if (!snapshot) {
      throw new RejectedCommandError('La instantánea indicada no existe o no pertenece al usuario.')
    }
  }
  if (refs.contributionId) {
    const [contribution] = await db
      .select({ id: schema.contributions.id })
      .from(schema.contributions)
      .where(
        and(
          eq(schema.contributions.id, refs.contributionId),
          eq(schema.contributions.userId, userId),
        ),
      )
    if (!contribution) {
      throw new RejectedCommandError('La aportación indicada no existe o no pertenece al usuario.')
    }
  }
}
