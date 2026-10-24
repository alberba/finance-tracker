/** `goals` repository (WP6) — savings/investment targets. */

import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { query } from '../database'
import { fromMinorUnits, toMinorUnits } from '../../lib/money'
import { goals } from '../schema'
import { clientIdentity, nowIso, versionGuard } from './shared'

export type GoalRow = Omit<typeof goals.$inferSelect, 'targetAmountMinor'> & {
  targetAmount: number
}

export interface CreateGoalInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string
  legacyId?: string | null
  key: string
  name: string
  targetYear?: number | null
  targetAmount: number
  currency: string
}

export interface UpdateGoalInput {
  name?: string
  targetYear?: number | null
  targetAmount?: number
  currency?: string
}

function toRow(row: typeof goals.$inferSelect): GoalRow {
  return { ...row, targetAmount: fromMinorUnits(row.targetAmountMinor, row.currency) }
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

export const create = (userId: string, input: CreateGoalInput) =>
  query(async (db): Promise<GoalRow> => {
    const now = nowIso()
    const [row] = await db
      .insert(goals)
      .values({
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        key: input.key,
        name: input.name,
        targetYear: input.targetYear ?? null,
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
    return yield* query(async (db): Promise<GoalRow | undefined> => {
      const [row] = await db
        .update(goals)
        .set({
          name: input.name ?? existing.name,
          targetYear: input.targetYear === undefined ? existing.targetYear : input.targetYear,
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
          targetAmountMinor: toMinorUnits(input.targetAmount, input.currency),
          currency: input.currency,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning()
    return rows.map(toRow)
  })
