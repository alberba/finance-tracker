/**
 * Wealth snapshots + per-account snapshot balances repository (WP6).
 *
 * `snapshotBalances` has no `currency` sibling requirement of its own beyond
 * the column already declared on the table (each balance is money-boundary
 * converted independently, since accounts can carry different currencies).
 */

import { and, eq, inArray } from 'drizzle-orm'
import { lift } from '../database'
import { fromMinorUnits, toMinorUnits } from '../../lib/money'
import { snapshotBalances, wealthSnapshots } from '../schema'
import {
  type Db,
  assertOwnedReferences,
  chunkIds,
  clientIdentity,
  nowIso,
  versionGuard,
  MAX_SQL_VARIABLES_PER_STATEMENT,
} from './shared'

export type WealthSnapshotRow = typeof wealthSnapshots.$inferSelect
export type SnapshotBalanceRow = Omit<typeof snapshotBalances.$inferSelect, 'balanceMinor'> & {
  balance: number
}

export interface CreateWealthSnapshotInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string
  legacyId?: string | null
  snapshotDate: string
  year: number
  month: number
}

export interface CreateSnapshotBalanceInput {
  snapshotId: string
  accountId?: string | null
  balance: number
  currency: string
}

function toBalanceRow(row: typeof snapshotBalances.$inferSelect): SnapshotBalanceRow {
  return { ...row, balance: fromMinorUnits(row.balanceMinor, row.currency) }
}

// -- wealth_snapshots ----------------------------------------------------------

async function listByUserSql(db: Db, userId: string): Promise<WealthSnapshotRow[]> {
  return db.select().from(wealthSnapshots).where(eq(wealthSnapshots.userId, userId))
}

async function getSql(db: Db, userId: string, id: string): Promise<WealthSnapshotRow | undefined> {
  const [row] = await db
    .select()
    .from(wealthSnapshots)
    .where(and(eq(wealthSnapshots.id, id), eq(wealthSnapshots.userId, userId)))
  return row
}

async function createSql(
  db: Db,
  userId: string,
  input: CreateWealthSnapshotInput,
): Promise<WealthSnapshotRow> {
  const now = nowIso()
  const [row] = await db
    .insert(wealthSnapshots)
    .values({
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      snapshotDate: input.snapshotDate,
      year: input.year,
      month: input.month,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row
}

async function updateSql(
  db: Db,
  userId: string,
  id: string,
  input: Partial<CreateWealthSnapshotInput>,
  expectedVersion?: number,
): Promise<WealthSnapshotRow | undefined> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return undefined
  }
  const [row] = await db
    .update(wealthSnapshots)
    .set({
      snapshotDate: input.snapshotDate ?? existing.snapshotDate,
      year: input.year ?? existing.year,
      month: input.month ?? existing.month,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(
      and(
        eq(wealthSnapshots.id, id),
        eq(wealthSnapshots.userId, userId),
        versionGuard(wealthSnapshots.version, expectedVersion),
      ),
    )
    .returning()
  return row
}

async function removeSql(
  db: Db,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<boolean> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return false
  }
  const deleted = await db
    .delete(wealthSnapshots)
    .where(
      and(
        eq(wealthSnapshots.id, id),
        eq(wealthSnapshots.userId, userId),
        versionGuard(wealthSnapshots.version, expectedVersion),
      ),
    )
    .returning({ id: wealthSnapshots.id })
  return deleted.length > 0
}

async function bulkInsertSql(
  db: Db,
  userId: string,
  inputs: CreateWealthSnapshotInput[],
): Promise<WealthSnapshotRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  return db
    .insert(wealthSnapshots)
    .values(
      inputs.map((input) => ({
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        snapshotDate: input.snapshotDate,
        year: input.year,
        month: input.month,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning()
}

// -- snapshot_balances ----------------------------------------------------------

async function listBalancesBySnapshotSql(
  db: Db,
  userId: string,
  snapshotId: string,
): Promise<SnapshotBalanceRow[]> {
  const rows = await db
    .select()
    .from(snapshotBalances)
    .where(and(eq(snapshotBalances.userId, userId), eq(snapshotBalances.snapshotId, snapshotId)))
  return rows.map(toBalanceRow)
}

/**
 * Batched form of {@link listBalancesBySnapshot} for bootstrap assembly
 * (audit §5.1): one query for every snapshot's balances instead of one
 * query per snapshot.
 */
async function listBalancesBySnapshotsSql(
  db: Db,
  userId: string,
  snapshotIds: string[],
): Promise<Map<string, SnapshotBalanceRow[]>> {
  const bySnapshot = new Map<string, SnapshotBalanceRow[]>()
  if (snapshotIds.length === 0) {
    return bySnapshot
  }
  const rows: (typeof snapshotBalances.$inferSelect)[] = []
  for (const chunk of chunkIds(snapshotIds)) {
    rows.push(
      ...(await db
        .select()
        .from(snapshotBalances)
        .where(
          and(eq(snapshotBalances.userId, userId), inArray(snapshotBalances.snapshotId, chunk)),
        )),
    )
  }
  for (const row of rows) {
    const balance = toBalanceRow(row)
    const existing = bySnapshot.get(balance.snapshotId)
    if (existing) {
      existing.push(balance)
    } else {
      bySnapshot.set(balance.snapshotId, [balance])
    }
  }
  return bySnapshot
}

async function getBalanceSql(
  db: Db,
  userId: string,
  id: string,
): Promise<SnapshotBalanceRow | undefined> {
  const [row] = await db
    .select()
    .from(snapshotBalances)
    .where(and(eq(snapshotBalances.id, id), eq(snapshotBalances.userId, userId)))
  return row ? toBalanceRow(row) : undefined
}

async function createBalanceSql(
  db: Db,
  userId: string,
  input: CreateSnapshotBalanceInput,
): Promise<SnapshotBalanceRow> {
  await assertOwnedReferences(db, userId, {
    snapshotId: input.snapshotId,
    accountId: input.accountId,
  })
  const [row] = await db
    .insert(snapshotBalances)
    .values({
      userId,
      snapshotId: input.snapshotId,
      accountId: input.accountId ?? null,
      balanceMinor: toMinorUnits(input.balance, input.currency),
      currency: input.currency,
      createdAt: nowIso(),
    })
    .returning()
  return toBalanceRow(row)
}

async function removeBalanceSql(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getBalanceSql(db, userId, id)
  if (!existing) {
    return false
  }
  await db
    .delete(snapshotBalances)
    .where(and(eq(snapshotBalances.id, id), eq(snapshotBalances.userId, userId)))
  return true
}

/** Replaces every balance of a snapshot with `inputs`, atomically within the caller's transaction. */
async function replaceBalancesSql(
  db: Db,
  userId: string,
  snapshotId: string,
  inputs: Omit<CreateSnapshotBalanceInput, 'snapshotId'>[],
): Promise<SnapshotBalanceRow[]> {
  await db
    .delete(snapshotBalances)
    .where(and(eq(snapshotBalances.userId, userId), eq(snapshotBalances.snapshotId, snapshotId)))
  return bulkInsertBalancesSql(
    db,
    userId,
    inputs.map((input) => ({ ...input, snapshotId })),
  )
}

async function bulkInsertBalancesSql(
  db: Db,
  userId: string,
  inputs: CreateSnapshotBalanceInput[],
): Promise<SnapshotBalanceRow[]> {
  if (inputs.length === 0) {
    return []
  }
  for (const input of inputs) {
    await assertOwnedReferences(db, userId, {
      snapshotId: input.snapshotId,
      accountId: input.accountId,
    })
  }
  const now = nowIso()
  const rows: Array<typeof snapshotBalances.$inferSelect> = []
  // Each balance binds seven columns, including its generated id. Keep the
  // whole replacement in the caller's transaction while respecting D1's limit.
  const rowsPerStatement = Math.floor(MAX_SQL_VARIABLES_PER_STATEMENT / 7)
  for (let start = 0; start < inputs.length; start += rowsPerStatement) {
    rows.push(
      ...(await db
        .insert(snapshotBalances)
        .values(
          inputs.slice(start, start + rowsPerStatement).map((input) => ({
            userId,
            snapshotId: input.snapshotId,
            accountId: input.accountId ?? null,
            balanceMinor: toMinorUnits(input.balance, input.currency),
            currency: input.currency,
            createdAt: now,
          })),
        )
        .returning()),
    )
  }
  return rows.map(toBalanceRow)
}

export const listByUser = lift(listByUserSql)
export const get = lift(getSql)
export const create = lift(createSql)
export const update = lift(updateSql)
export const remove = lift(removeSql)
export const bulkInsert = lift(bulkInsertSql)
export const listBalancesBySnapshot = lift(listBalancesBySnapshotSql)
export const listBalancesBySnapshots = lift(listBalancesBySnapshotsSql)
export const getBalance = lift(getBalanceSql)
export const createBalance = lift(createBalanceSql)
export const removeBalance = lift(removeBalanceSql)
export const replaceBalances = lift(replaceBalancesSql)
export const bulkInsertBalances = lift(bulkInsertBalancesSql)
