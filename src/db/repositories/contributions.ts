/**
 * Contributions + contribution-allocations repository (WP6).
 *
 * `contributions.portfolioValueMinor`/`flowMinor` are derived TWR metrics
 * stored in the same row's `currency`'s minimal unit (see
 * `src/db/schema/wealth.ts`) — converted at this boundary exactly like
 * `amountMinor`, just without their own separate currency column.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { lift } from '../database'
import { fromMinorUnits, toMinorUnits } from '../../lib/money'
import { contributionAllocations, contributions } from '../schema'
import {
  type Db,
  assertOwnedReferences,
  chunkIds,
  clientIdentity,
  nowIso,
  versionGuard,
} from './shared'

export type ContributionRow = Omit<
  typeof contributions.$inferSelect,
  'amountMinor' | 'portfolioValueMinor' | 'flowMinor'
> & {
  amount: number
  portfolioValue: number | null
  flow: number | null
}
export type ContributionAllocationRow = Omit<
  typeof contributionAllocations.$inferSelect,
  'amountMinor'
> & { amount: number }

export interface CreateContributionInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string
  legacyId?: string | null
  date: string
  amount: number
  currency: string
  portfolioDate?: string | null
  portfolioValue?: number | null
  flow?: number | null
}

export interface UpdateContributionInput {
  date?: string
  amount?: number
  currency?: string
  portfolioDate?: string | null
  portfolioValue?: number | null
  flow?: number | null
}

export interface CreateContributionAllocationInput {
  contributionId: string
  accountId?: string | null
  amount: number
  currency: string
}

function toRow(row: typeof contributions.$inferSelect): ContributionRow {
  return {
    ...row,
    amount: fromMinorUnits(row.amountMinor, row.currency),
    portfolioValue:
      row.portfolioValueMinor === null
        ? null
        : fromMinorUnits(row.portfolioValueMinor, row.currency),
    flow: row.flowMinor === null ? null : fromMinorUnits(row.flowMinor, row.currency),
  }
}

function toAllocationRow(
  row: typeof contributionAllocations.$inferSelect,
): ContributionAllocationRow {
  return { ...row, amount: fromMinorUnits(row.amountMinor, row.currency) }
}

// -- contributions ----------------------------------------------------------

async function listByUserSql(db: Db, userId: string): Promise<ContributionRow[]> {
  const rows = await db.select().from(contributions).where(eq(contributions.userId, userId))
  return rows.map(toRow)
}

async function getSql(db: Db, userId: string, id: string): Promise<ContributionRow | undefined> {
  const [row] = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.id, id), eq(contributions.userId, userId)))
  return row ? toRow(row) : undefined
}

async function createSql(
  db: Db,
  userId: string,
  input: CreateContributionInput,
): Promise<ContributionRow> {
  const now = nowIso()
  const [row] = await db
    .insert(contributions)
    .values({
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      date: input.date,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      portfolioDate: input.portfolioDate ?? null,
      portfolioValueMinor:
        input.portfolioValue == null ? null : toMinorUnits(input.portfolioValue, input.currency),
      flowMinor: input.flow == null ? null : toMinorUnits(input.flow, input.currency),
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
  input: UpdateContributionInput,
  expectedVersion?: number,
): Promise<ContributionRow | undefined> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return undefined
  }
  const nextCurrency = input.currency ?? existing.currency
  const nextAmount = input.amount ?? existing.amount
  const nextPortfolioValue =
    input.portfolioValue !== undefined ? input.portfolioValue : existing.portfolioValue
  const nextFlow = input.flow !== undefined ? input.flow : existing.flow
  const [row] = await db
    .update(contributions)
    .set({
      date: input.date ?? existing.date,
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      portfolioDate:
        input.portfolioDate === undefined ? existing.portfolioDate : input.portfolioDate,
      portfolioValueMinor:
        nextPortfolioValue == null ? null : toMinorUnits(nextPortfolioValue, nextCurrency),
      flowMinor: nextFlow == null ? null : toMinorUnits(nextFlow, nextCurrency),
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(
      and(
        eq(contributions.id, id),
        eq(contributions.userId, userId),
        versionGuard(contributions.version, expectedVersion),
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
    .delete(contributions)
    .where(
      and(
        eq(contributions.id, id),
        eq(contributions.userId, userId),
        versionGuard(contributions.version, expectedVersion),
      ),
    )
    .returning({ id: contributions.id })
  return deleted.length > 0
}

async function bulkInsertSql(
  db: Db,
  userId: string,
  inputs: CreateContributionInput[],
): Promise<ContributionRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  const rows = await db
    .insert(contributions)
    .values(
      inputs.map((input) => ({
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        date: input.date,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        portfolioDate: input.portfolioDate ?? null,
        portfolioValueMinor:
          input.portfolioValue == null ? null : toMinorUnits(input.portfolioValue, input.currency),
        flowMinor: input.flow == null ? null : toMinorUnits(input.flow, input.currency),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning()
  return rows.map(toRow)
}

// -- contribution_allocations -------------------------------------------------

async function listAllocationsByContributionSql(
  db: Db,
  userId: string,
  contributionId: string,
): Promise<ContributionAllocationRow[]> {
  const rows = await db
    .select()
    .from(contributionAllocations)
    .where(
      and(
        eq(contributionAllocations.userId, userId),
        eq(contributionAllocations.contributionId, contributionId),
      ),
    )
  return rows.map(toAllocationRow)
}

/**
 * Batched form of {@link listAllocationsByContribution} for bootstrap
 * assembly (audit §5.1): one query for every contribution's allocations
 * instead of one query per contribution.
 */
async function listAllocationsByContributionsSql(
  db: Db,
  userId: string,
  contributionIds: string[],
): Promise<Map<string, ContributionAllocationRow[]>> {
  const byContribution = new Map<string, ContributionAllocationRow[]>()
  if (contributionIds.length === 0) {
    return byContribution
  }
  const rows: (typeof contributionAllocations.$inferSelect)[] = []
  for (const chunk of chunkIds(contributionIds)) {
    rows.push(
      ...(await db
        .select()
        .from(contributionAllocations)
        .where(
          and(
            eq(contributionAllocations.userId, userId),
            inArray(contributionAllocations.contributionId, chunk),
          ),
        )),
    )
  }
  for (const row of rows) {
    const allocation = toAllocationRow(row)
    const existing = byContribution.get(allocation.contributionId)
    if (existing) {
      existing.push(allocation)
    } else {
      byContribution.set(allocation.contributionId, [allocation])
    }
  }
  return byContribution
}

async function getAllocationSql(
  db: Db,
  userId: string,
  id: string,
): Promise<ContributionAllocationRow | undefined> {
  const [row] = await db
    .select()
    .from(contributionAllocations)
    .where(and(eq(contributionAllocations.id, id), eq(contributionAllocations.userId, userId)))
  return row ? toAllocationRow(row) : undefined
}

async function createAllocationSql(
  db: Db,
  userId: string,
  input: CreateContributionAllocationInput,
): Promise<ContributionAllocationRow> {
  await assertOwnedReferences(db, userId, {
    contributionId: input.contributionId,
    accountId: input.accountId,
  })
  const [row] = await db
    .insert(contributionAllocations)
    .values({
      userId,
      contributionId: input.contributionId,
      accountId: input.accountId ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      createdAt: nowIso(),
    })
    .returning()
  return toAllocationRow(row)
}

async function removeAllocationSql(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getAllocationSql(db, userId, id)
  if (!existing) {
    return false
  }
  await db
    .delete(contributionAllocations)
    .where(and(eq(contributionAllocations.id, id), eq(contributionAllocations.userId, userId)))
  return true
}

async function bulkInsertAllocationsSql(
  db: Db,
  userId: string,
  inputs: CreateContributionAllocationInput[],
): Promise<ContributionAllocationRow[]> {
  if (inputs.length === 0) {
    return []
  }
  for (const input of inputs) {
    await assertOwnedReferences(db, userId, {
      contributionId: input.contributionId,
      accountId: input.accountId,
    })
  }
  const now = nowIso()
  const rows = await db
    .insert(contributionAllocations)
    .values(
      inputs.map((input) => ({
        userId,
        contributionId: input.contributionId,
        accountId: input.accountId ?? null,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        createdAt: now,
      })),
    )
    .returning()
  return rows.map(toAllocationRow)
}

/** Replaces how a contribution's flow splits across accounts, atomically with the contribution. */
async function replaceAllocationsSql(
  db: Db,
  userId: string,
  contributionId: string,
  inputs: Omit<CreateContributionAllocationInput, 'contributionId'>[],
): Promise<ContributionAllocationRow[]> {
  await db
    .delete(contributionAllocations)
    .where(
      and(
        eq(contributionAllocations.userId, userId),
        eq(contributionAllocations.contributionId, contributionId),
      ),
    )
  return bulkInsertAllocationsSql(
    db,
    userId,
    inputs.map((input) => ({ ...input, contributionId })),
  )
}

export const listByUser = lift(listByUserSql)
export const get = lift(getSql)
export const create = lift(createSql)
export const update = lift(updateSql)
export const remove = lift(removeSql)
export const bulkInsert = lift(bulkInsertSql)
export const listAllocationsByContribution = lift(listAllocationsByContributionSql)
export const listAllocationsByContributions = lift(listAllocationsByContributionsSql)
export const getAllocation = lift(getAllocationSql)
export const createAllocation = lift(createAllocationSql)
export const removeAllocation = lift(removeAllocationSql)
export const bulkInsertAllocations = lift(bulkInsertAllocationsSql)
export const replaceAllocations = lift(replaceAllocationsSql)
