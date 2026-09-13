/**
 * Read-only planning for the v2 data repair.
 *
 * The repair is intentionally split into two steps: this module only reads
 * the affected rows and returns a value describing the changes, while the
 * operator-facing script (issue #148) is responsible for showing the plan,
 * checking that a backup exists, and applying it after explicit approval.
 * Keeping the planner free of writes makes a dry run safe to exercise against
 * a copy of production data.
 */

import { and, eq } from 'drizzle-orm'
import {
  accounts,
  budgetEntries,
  categories,
  pendingMovements,
  recurringRules,
  snapshotBalances,
  stockeventsSymbolMappings,
  subscriptions,
  transactions,
  userInstruments,
  wealthSnapshots,
} from '../../src/db/schema'
import type { Db } from '../../src/db/repositories/shared'

/** A budget cell from the clean export used as the repair source of truth. */
export interface RepairBackupBudgetCell {
  categoryName: string
  categoryKind: string
  year: number
  /** Calendar month, canonicalized to 1–12. */
  month: number
  amountMinor: number
  currency: string
}

/** One per-account balance from a clean wealth-snapshot export. */
export interface RepairBackupSnapshotBalance {
  /** The account's v1 legacy id; the planner resolves it to the v2 row id. */
  accountLegacyId: string | null
  balanceMinor: number
  currency: string
}

/** A wealth snapshot from the clean export used as the repair source of truth. */
export interface RepairBackupSnapshot {
  year: number
  /** Calendar month, canonicalized to 1–12. */
  month: number
  snapshotDate: string
  balances: readonly RepairBackupSnapshotBalance[]
}

/** The source data required by the read-only planner. */
export interface RepairBackup {
  budgetCells: readonly RepairBackupBudgetCell[]
  snapshots: readonly RepairBackupSnapshot[]
}

export interface CategoryReference {
  table: string
  column: string
  rowId: string
}

export interface CategoryMerge {
  /** The derived-id row that should be removed after references are repointed. */
  duplicateCategoryId: string
  /** The migrated row that preserves the historical references. */
  canonicalCategoryId: string
  name: string
  kind: string
  references: CategoryReference[]
}

export interface AccountKindCorrection {
  accountId: string
  name: string
  fromKind: string
  toKind: 'cash'
}

export type RepairAction = 'insert' | 'update'
export type RepairReason = 'missing' | 'overwritten'

export interface BudgetCellRepair {
  action: RepairAction
  budgetEntryId?: string
  categoryId: string
  year: number
  month: number
  amountMinor: number
  currency: string
  reason: RepairReason
}

export interface SnapshotBalanceRepair {
  accountId: string | null
  balanceMinor: number
  currency: string
}

export interface SnapshotRepair {
  action: RepairAction
  snapshotId?: string
  snapshotDate: string
  year: number
  month: number
  balances: SnapshotBalanceRepair[]
  reason: RepairReason
}

/** Every change the eventual write step may apply, in deterministic order. */
export interface RepairPlan {
  categoryMerges: CategoryMerge[]
  accountKindCorrections: AccountKindCorrection[]
  budgetRestorations: BudgetCellRepair[]
  snapshotRestorations: SnapshotRepair[]
}

const VALID_ACCOUNT_KINDS = new Set(['cash', 'investment', 'liability'])

/**
 * Find the row created by the v1 migration for a duplicate category group.
 *
 * The migration keeps the v1 category name as `legacy_id`, while the old
 * client sync path generated `${kind}:${name}`. Requiring both forms avoids
 * merging two intentionally similarly-named, newly-created categories when
 * there is no evidence that one of the rows came from v1.
 */
function findCanonicalCategory(
  rows: Array<typeof categories.$inferSelect>,
  name: string,
): typeof categories.$inferSelect | undefined {
  return rows.find((row) => row.legacyId === name)
}

async function categoryReferences(
  db: Db,
  userId: string,
  categoryId: string,
): Promise<CategoryReference[]> {
  const references: CategoryReference[] = []

  const transactionRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, categoryId)))
  references.push(
    ...transactionRows.map((row) => ({
      table: 'transactions',
      column: 'categoryId',
      rowId: row.id,
    })),
  )

  const pendingRows = await db
    .select({ id: pendingMovements.id })
    .from(pendingMovements)
    .where(and(eq(pendingMovements.userId, userId), eq(pendingMovements.categoryId, categoryId)))
  references.push(
    ...pendingRows.map((row) => ({
      table: 'pending_movements',
      column: 'categoryId',
      rowId: row.id,
    })),
  )

  const recurringRows = await db
    .select({ id: recurringRules.id })
    .from(recurringRules)
    .where(and(eq(recurringRules.userId, userId), eq(recurringRules.categoryId, categoryId)))
  references.push(
    ...recurringRows.map((row) => ({
      table: 'recurring_rules',
      column: 'categoryId',
      rowId: row.id,
    })),
  )

  const subscriptionRows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.categoryId, categoryId)))
  references.push(
    ...subscriptionRows.map((row) => ({
      table: 'subscriptions',
      column: 'categoryId',
      rowId: row.id,
    })),
  )

  const budgetRows = await db
    .select({ id: budgetEntries.id })
    .from(budgetEntries)
    .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.categoryId, categoryId)))
  references.push(
    ...budgetRows.map((row) => ({
      table: 'budget_entries',
      column: 'categoryId',
      rowId: row.id,
    })),
  )

  const instrumentRows = await db
    .select({ id: userInstruments.id })
    .from(userInstruments)
    .where(and(eq(userInstruments.userId, userId), eq(userInstruments.categoryId, categoryId)))
  references.push(
    ...instrumentRows.map((row) => ({
      table: 'user_instruments',
      column: 'categoryId',
      rowId: row.id,
    })),
  )

  const stockeventsRows = await db
    .select({ id: stockeventsSymbolMappings.id })
    .from(stockeventsSymbolMappings)
    .where(
      and(
        eq(stockeventsSymbolMappings.userId, userId),
        eq(stockeventsSymbolMappings.categoryId, categoryId),
      ),
    )
  references.push(
    ...stockeventsRows.map((row) => ({
      table: 'stockevents_symbol_mappings',
      column: 'categoryId',
      rowId: row.id,
    })),
  )

  return references.sort((left, right) =>
    `${left.table}:${left.rowId}`.localeCompare(`${right.table}:${right.rowId}`),
  )
}

function categoryMerges(
  db: Db,
  userId: string,
  rows: Array<typeof categories.$inferSelect>,
): Promise<CategoryMerge[]> {
  const groups = new Map<string, Array<typeof categories.$inferSelect>>()
  for (const row of rows) {
    const key = `${row.kind}\u0000${row.name}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  return Promise.all(
    Array.from(groups.values())
      .sort((left, right) =>
        `${left[0]?.kind}:${left[0]?.name}`.localeCompare(`${right[0]?.kind}:${right[0]?.name}`),
      )
      .flatMap((group) => {
        const first = group[0]
        if (!first || group.length < 2) {
          return []
        }
        const derivedLegacyId = `${first.kind}:${first.name}`
        const canonical = findCanonicalCategory(group, first.name)
        const duplicates = group
          .filter((row) => row.id !== canonical?.id && row.legacyId === derivedLegacyId)
          .sort((left, right) => left.id.localeCompare(right.id))
        if (!canonical || duplicates.length === 0) {
          return []
        }
        return duplicates.map(async (duplicate) => ({
          duplicateCategoryId: duplicate.id,
          canonicalCategoryId: canonical.id,
          name: duplicate.name,
          kind: duplicate.kind,
          references: await categoryReferences(db, userId, duplicate.id),
        }))
      }),
  )
}

function accountKindCorrections(
  rows: Array<typeof accounts.$inferSelect>,
): AccountKindCorrection[] {
  return rows
    .filter((row) => !VALID_ACCOUNT_KINDS.has(row.kind))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => ({
      accountId: row.id,
      name: row.name,
      fromKind: row.kind,
      // The only invalid kind emitted by the pre-v2 UI was `checking`; it
      // represented a normal cash account and is the documented production
      // corruption this plan repairs.
      toKind: 'cash' as const,
    }))
}

function backupCategory(
  rows: Array<typeof categories.$inferSelect>,
  name: string,
  kind: string,
): typeof categories.$inferSelect | undefined {
  const candidates = rows.filter((row) => row.name === name && row.kind === kind)
  return (
    findCanonicalCategory(candidates, name) ??
    candidates.find((row) => row.legacyId === `${kind}:${name}`)
  )
}

function canonicalCategoryId(
  rows: Array<typeof categories.$inferSelect>,
  categoryId: string,
): string {
  const row = rows.find((candidate) => candidate.id === categoryId)
  if (!row) {
    return categoryId
  }
  return (
    findCanonicalCategory(
      rows.filter((candidate) => candidate.name === row.name && candidate.kind === row.kind),
      row.name,
    )?.id ?? categoryId
  )
}

function budgetRestorations(
  rows: Array<typeof budgetEntries.$inferSelect>,
  categoriesRows: Array<typeof categories.$inferSelect>,
  backup: readonly RepairBackupBudgetCell[],
): BudgetCellRepair[] {
  return backup
    .slice()
    .sort(
      (left, right) =>
        left.year - right.year ||
        left.month - right.month ||
        left.categoryName.localeCompare(right.categoryName),
    )
    .flatMap((cell) => {
      const category = backupCategory(categoriesRows, cell.categoryName, cell.categoryKind)
      if (!category) {
        return []
      }
      const existing = rows.find(
        (row) =>
          canonicalCategoryId(categoriesRows, row.categoryId) === category.id &&
          row.year === cell.year &&
          row.month === cell.month,
      )
      if (
        existing &&
        existing.amountMinor === cell.amountMinor &&
        existing.currency === cell.currency
      ) {
        return []
      }
      return [
        {
          action: existing ? ('update' as const) : ('insert' as const),
          ...(existing ? { budgetEntryId: existing.id } : {}),
          categoryId: category.id,
          year: cell.year,
          month: cell.month,
          amountMinor: cell.amountMinor,
          currency: cell.currency,
          reason: existing ? ('overwritten' as const) : ('missing' as const),
        },
      ]
    })
}

function snapshotBalancesMatch(
  actual: Array<typeof snapshotBalances.$inferSelect>,
  expected: SnapshotBalanceRepair[],
): boolean {
  if (actual.length !== expected.length) {
    return false
  }
  return expected.every((balance) =>
    actual.some(
      (row) =>
        row.accountId === balance.accountId &&
        row.balanceMinor === balance.balanceMinor &&
        row.currency === balance.currency,
    ),
  )
}

function snapshotRestorations(
  rows: Array<typeof wealthSnapshots.$inferSelect>,
  balances: Array<typeof snapshotBalances.$inferSelect>,
  accountRows: Array<typeof accounts.$inferSelect>,
  backup: readonly RepairBackupSnapshot[],
): SnapshotRepair[] {
  const accountIdByLegacyId = new Map(
    accountRows.filter((row) => row.legacyId).map((row) => [row.legacyId as string, row.id]),
  )

  return backup
    .slice()
    .sort((left, right) => left.year - right.year || left.month - right.month)
    .flatMap((snapshot) => {
      const expectedBalances = snapshot.balances.map((balance) => ({
        accountId: balance.accountLegacyId
          ? (accountIdByLegacyId.get(balance.accountLegacyId) ?? null)
          : null,
        balanceMinor: balance.balanceMinor,
        currency: balance.currency,
      }))
      const existing = rows.find(
        (row) => row.year === snapshot.year && row.month === snapshot.month,
      )
      if (
        existing &&
        existing.snapshotDate === snapshot.snapshotDate &&
        snapshotBalancesMatch(
          balances.filter((row) => row.snapshotId === existing.id),
          expectedBalances,
        )
      ) {
        return []
      }
      return [
        {
          action: existing ? ('update' as const) : ('insert' as const),
          ...(existing ? { snapshotId: existing.id } : {}),
          snapshotDate: snapshot.snapshotDate,
          year: snapshot.year,
          month: snapshot.month,
          balances: expectedBalances,
          reason: existing ? ('overwritten' as const) : ('missing' as const),
        },
      ]
    })
}

/**
 * Builds a complete, deterministic repair plan without issuing any writes.
 * The planner deliberately receives the backup as an argument so a caller
 * cannot accidentally repair from a mutable live export or an implicit path.
 */
export async function buildRepairPlan(
  db: Db,
  userId: string,
  backup: RepairBackup,
): Promise<RepairPlan> {
  const [categoryRows, accountRows, budgetRows, snapshotRows, balanceRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db.select().from(budgetEntries).where(eq(budgetEntries.userId, userId)),
    db.select().from(wealthSnapshots).where(eq(wealthSnapshots.userId, userId)),
    db.select().from(snapshotBalances).where(eq(snapshotBalances.userId, userId)),
  ])

  return {
    categoryMerges: await categoryMerges(db, userId, categoryRows),
    accountKindCorrections: accountKindCorrections(accountRows),
    budgetRestorations: budgetRestorations(budgetRows, categoryRows, backup.budgetCells),
    snapshotRestorations: snapshotRestorations(
      snapshotRows,
      balanceRows,
      accountRows,
      backup.snapshots,
    ),
  }
}
