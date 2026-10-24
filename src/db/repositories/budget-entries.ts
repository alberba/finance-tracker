/** `budget_entries` repository (WP6) — one category's planned amount for a (year, month). */

import { and, eq } from 'drizzle-orm'
import { lift } from '../database'
import { fromMinorUnits, toMinorUnits } from '../../lib/money'
import { budgetEntries } from '../schema'
import { type Db, assertOwnedReferences, clientIdentity, nowIso, versionGuard } from './shared'

export type BudgetEntryRow = Omit<typeof budgetEntries.$inferSelect, 'amountMinor'> & {
  amount: number
}

export interface CreateBudgetEntryInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string
  legacyId?: string | null
  categoryId: string
  year: number
  month: number
  amount: number
  currency: string
}

export interface UpdateBudgetEntryInput {
  amount?: number
  currency?: string
}

function toRow(row: typeof budgetEntries.$inferSelect): BudgetEntryRow {
  return { ...row, amount: fromMinorUnits(row.amountMinor, row.currency) }
}

async function listByUserSql(db: Db, userId: string): Promise<BudgetEntryRow[]> {
  const rows = await db.select().from(budgetEntries).where(eq(budgetEntries.userId, userId))
  return rows.map(toRow)
}

async function getSql(db: Db, userId: string, id: string): Promise<BudgetEntryRow | undefined> {
  const [row] = await db
    .select()
    .from(budgetEntries)
    .where(and(eq(budgetEntries.id, id), eq(budgetEntries.userId, userId)))
  return row ? toRow(row) : undefined
}

async function createSql(
  db: Db,
  userId: string,
  input: CreateBudgetEntryInput,
): Promise<BudgetEntryRow> {
  await assertOwnedReferences(db, userId, { categoryId: input.categoryId })
  const now = nowIso()
  const [row] = await db
    .insert(budgetEntries)
    .values({
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      categoryId: input.categoryId,
      year: input.year,
      month: input.month,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return toRow(row)
}

async function updateSql(
  db: Db,
  userId: string,
  id: string,
  input: UpdateBudgetEntryInput,
  expectedVersion?: number,
): Promise<BudgetEntryRow | undefined> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return undefined
  }
  const nextCurrency = input.currency ?? existing.currency
  const nextAmount = input.amount ?? existing.amount
  const [row] = await db
    .update(budgetEntries)
    .set({
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(
      and(
        eq(budgetEntries.id, id),
        eq(budgetEntries.userId, userId),
        versionGuard(budgetEntries.version, expectedVersion),
      ),
    )
    .returning()
  return row ? toRow(row) : undefined
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
    .delete(budgetEntries)
    .where(
      and(
        eq(budgetEntries.id, id),
        eq(budgetEntries.userId, userId),
        versionGuard(budgetEntries.version, expectedVersion),
      ),
    )
    .returning({ id: budgetEntries.id })
  return deleted.length > 0
}

async function bulkInsertSql(
  db: Db,
  userId: string,
  inputs: CreateBudgetEntryInput[],
): Promise<BudgetEntryRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  const rows = await db
    .insert(budgetEntries)
    .values(
      inputs.map((input) => ({
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        categoryId: input.categoryId,
        year: input.year,
        month: input.month,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning()
  return rows.map(toRow)
}

export const listByUser = lift(listByUserSql)
export const get = lift(getSql)
export const create = lift(createSql)
export const update = lift(updateSql)
export const remove = lift(removeSql)
export const bulkInsert = lift(bulkInsertSql)
