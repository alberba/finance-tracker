/** `goals` repository (WP6) — savings/investment targets. */

import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { query } from '../database'
import { fromMinorUnits, toMinorUnits } from '../../lib/money'
import { categories, goals } from '../schema'
import {
  type Db,
  RejectedCommandError,
  clientIdentity,
  nowIso,
  versionGuard,
} from './shared'

export type GoalRow = Omit<
  typeof goals.$inferSelect,
  'targetAmountMinor' | 'monthlyAmountMinor'
> & {
  targetAmount: number
  monthlyAmount: number | null
}

export interface CreateGoalInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string
  legacyId?: string | null
  key: string
  /** The saving category a savings goal sums; absent on wealth and investment goals. */
  categoryId?: string | null
  name: string
  targetYear?: number | null
  /** A savings goal's deadline month (1-12) and planned monthly amount. */
  targetMonth?: number | null
  monthlyAmount?: number | null
  targetAmount: number
  currency: string
}

export interface UpdateGoalInput {
  categoryId?: string | null
  name?: string
  targetYear?: number | null
  targetMonth?: number | null
  monthlyAmount?: number | null
  targetAmount?: number
  currency?: string
}

function toRow({ monthlyAmountMinor, ...row }: typeof goals.$inferSelect): GoalRow {
  return {
    ...row,
    targetAmount: fromMinorUnits(row.targetAmountMinor, row.currency),
    monthlyAmount:
      monthlyAmountMinor === null ? null : fromMinorUnits(monthlyAmountMinor, row.currency),
  }
}

function monthlyMinor(amount: number | null | undefined, currency: string): number | null {
  return amount === null || amount === undefined ? null : toMinorUnits(amount, currency)
}

export const listByUser = (userId: string) =>
  query(async (db) => {
    const rows = await db.select().from(goals).where(eq(goals.userId, userId))
    return rows.map(toRow)
  })

export const get = (userId: string, id: string) =>
  query(async (db): Promise<GoalRow | undefined> => {
    const [row] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    return row ? toRow(row) : undefined
  })

/** A goal's category has to be one of the user's saving categories. */
async function assertSavingCategory(
  db: Db,
  userId: string,
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId) return
  const [category] = await db
    .select({ kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
  if (!category) {
    throw new RejectedCommandError('La categoría indicada no existe o no pertenece al usuario.')
  }
  if (category.kind !== 'saving') {
    throw new RejectedCommandError('Un objetivo de ahorro necesita una categoría de ahorro.')
  }
}

export const create = (userId: string, input: CreateGoalInput) =>
  query(async (db): Promise<GoalRow> => {
    await assertSavingCategory(db, userId, input.categoryId)
    const now = nowIso()
    const [row] = await db
      .insert(goals)
      .values({
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        key: input.key,
        categoryId: input.categoryId ?? null,
        name: input.name,
        targetYear: input.targetYear ?? null,
        targetMonth: input.targetMonth ?? null,
        monthlyAmountMinor: monthlyMinor(input.monthlyAmount, input.currency),
        targetAmountMinor: toMinorUnits(input.targetAmount, input.currency),
        currency: input.currency,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return toRow(row)
  })

export const update = (
  userId: string,
  id: string,
  input: UpdateGoalInput,
  expectedVersion?: number,
) =>
  Effect.gen(function* () {
    const existing = yield* get(userId, id)
    if (!existing) {
      return undefined
    }
    const nextCurrency = input.currency ?? existing.currency
    const nextTargetAmount = input.targetAmount ?? existing.targetAmount
    const nextMonthlyAmount =
      input.monthlyAmount === undefined ? existing.monthlyAmount : input.monthlyAmount
    return yield* query(async (db): Promise<GoalRow | undefined> => {
      await assertSavingCategory(db, userId, input.categoryId)
      const [row] = await db
        .update(goals)
        .set({
          categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
          name: input.name ?? existing.name,
          targetYear: input.targetYear === undefined ? existing.targetYear : input.targetYear,
          targetMonth: input.targetMonth === undefined ? existing.targetMonth : input.targetMonth,
          monthlyAmountMinor: monthlyMinor(nextMonthlyAmount, nextCurrency),
          targetAmountMinor: toMinorUnits(nextTargetAmount, nextCurrency),
          currency: nextCurrency,
          updatedAt: nowIso(),
          version: existing.version + 1,
        })
        .where(
          and(
            eq(goals.id, id),
            eq(goals.userId, userId),
            versionGuard(goals.version, expectedVersion),
          ),
        )
        .returning()
      return row ? toRow(row) : undefined
    })
  })

export const remove = (userId: string, id: string, expectedVersion?: number) =>
  Effect.gen(function* () {
    const existing = yield* get(userId, id)
    if (!existing) {
      return false
    }
    return yield* query(async (db) => {
      const deleted = await db
        .delete(goals)
        .where(
          and(
            eq(goals.id, id),
            eq(goals.userId, userId),
            versionGuard(goals.version, expectedVersion),
          ),
        )
        .returning({ id: goals.id })
      return deleted.length > 0
    })
  })

export const bulkInsert = (userId: string, inputs: CreateGoalInput[]) =>
  query(async (db): Promise<GoalRow[]> => {
    if (inputs.length === 0) {
      return []
    }
    const now = nowIso()
    const rows = await db
      .insert(goals)
      .values(
        inputs.map((input) => ({
          ...clientIdentity(input.id),
          userId,
          legacyId: input.legacyId ?? null,
          key: input.key,
          name: input.name,
          targetYear: input.targetYear ?? null,
          targetMonth: input.targetMonth ?? null,
          monthlyAmountMinor: monthlyMinor(input.monthlyAmount, input.currency),
          targetAmountMinor: toMinorUnits(input.targetAmount, input.currency),
          currency: input.currency,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning()
    return rows.map(toRow)
  })
