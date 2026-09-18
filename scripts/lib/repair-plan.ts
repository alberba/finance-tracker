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
import type Database from 'better-sqlite3'
import { writeFileSync } from 'node:fs'
import {
  accounts,
  budgetEntries,
  categories,
  contributions,
  goals,
  pendingMovements,
  recurringRules,
  snapshotBalances,
  stockeventsSymbolMappings,
  subscriptions,
  transactions,
  twrLiquidityAccounts,
  userInstruments,
  wealthSnapshots,
} from '../../src/db/schema'
import { nowIso, runInTransaction, type Db } from '../../src/db/repositories/shared'
import { uuidv7 } from '../../src/lib/server/uuidv7'

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

/**
 * One row whose migration correlation id collides with another row's.
 *
 * The row is renamed, never deleted: v1 already keyed contributions by an id
 * that was not unique (two March entries shared `contrib-snapshot-2026-3`) and
 * the v1→v2 migration copied both rows with that same derived value. They are
 * distinct records, and the correlation id is only a reconciliation key
 * (ADR 0001), so moving one aside keeps the data and lets the closing UNIQUE
 * on `(user_id, legacy_id)` hold.
 */
export interface CorrelationIdRepair {
  table: string
  rowId: string
  fromLegacyId: string
  toLegacyId: string
}

/** Every change the eventual write step may apply, in deterministic order. */
export interface RepairPlan {
  categoryMerges: CategoryMerge[]
  accountKindCorrections: AccountKindCorrection[]
  budgetRestorations: BudgetCellRepair[]
  snapshotRestorations: SnapshotRepair[]
  correlationIdFixes: CorrelationIdRepair[]
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

/**
 * Reads the correlation id of every row in every table that carries one, so
 * `correlationIdFixes` can find the colliding groups from data alone.
 */
async function correlationIdRows(
  db: Db,
  userId: string,
): Promise<Array<{ table: string; rows: Array<{ id: string; legacyId: string | null }> }>> {
  const [
    accountRows,
    categoryRows,
    liquidityRows,
    transactionRows,
    subscriptionRows,
    ruleRows,
    pendingRows,
    budgetRows,
    goalRows,
    snapshotRows,
    contributionRows,
    mappingRows,
  ] = await Promise.all([
    db.select({ id: accounts.id, legacyId: accounts.legacyId }).from(accounts).where(eq(accounts.userId, userId)),
    db.select({ id: categories.id, legacyId: categories.legacyId }).from(categories).where(eq(categories.userId, userId)),
    db
      .select({ id: twrLiquidityAccounts.id, legacyId: twrLiquidityAccounts.legacyId })
      .from(twrLiquidityAccounts)
      .where(eq(twrLiquidityAccounts.userId, userId)),
    db.select({ id: transactions.id, legacyId: transactions.legacyId }).from(transactions).where(eq(transactions.userId, userId)),
    db.select({ id: subscriptions.id, legacyId: subscriptions.legacyId }).from(subscriptions).where(eq(subscriptions.userId, userId)),
    db.select({ id: recurringRules.id, legacyId: recurringRules.legacyId }).from(recurringRules).where(eq(recurringRules.userId, userId)),
    db.select({ id: pendingMovements.id, legacyId: pendingMovements.legacyId }).from(pendingMovements).where(eq(pendingMovements.userId, userId)),
    db.select({ id: budgetEntries.id, legacyId: budgetEntries.legacyId }).from(budgetEntries).where(eq(budgetEntries.userId, userId)),
    db.select({ id: goals.id, legacyId: goals.legacyId }).from(goals).where(eq(goals.userId, userId)),
    db.select({ id: wealthSnapshots.id, legacyId: wealthSnapshots.legacyId }).from(wealthSnapshots).where(eq(wealthSnapshots.userId, userId)),
    db.select({ id: contributions.id, legacyId: contributions.legacyId }).from(contributions).where(eq(contributions.userId, userId)),
    db
      .select({ id: stockeventsSymbolMappings.id, legacyId: stockeventsSymbolMappings.legacyId })
      .from(stockeventsSymbolMappings)
      .where(eq(stockeventsSymbolMappings.userId, userId)),
  ])

  return [
    { table: 'accounts', rows: accountRows },
    { table: 'categories', rows: categoryRows },
    { table: 'twr_liquidity_accounts', rows: liquidityRows },
    { table: 'transactions', rows: transactionRows },
    { table: 'subscriptions', rows: subscriptionRows },
    { table: 'recurring_rules', rows: ruleRows },
    { table: 'pending_movements', rows: pendingRows },
    { table: 'budget_entries', rows: budgetRows },
    { table: 'goals', rows: goalRows },
    { table: 'wealth_snapshots', rows: snapshotRows },
    { table: 'contributions', rows: contributionRows },
    { table: 'stockevents_symbol_mappings', rows: mappingRows },
  ]
}

/**
 * Rows sharing a correlation id within one table, the earliest keeping it.
 * Deterministic in both table and id order, so the same database always yields
 * the same plan and the same renames.
 */
function correlationIdFixes(
  sources: Array<{ table: string; rows: Array<{ id: string; legacyId: string | null }> }>,
): CorrelationIdRepair[] {
  const fixes: CorrelationIdRepair[] = []

  for (const { table, rows } of sources) {
    const groups = new Map<string, string[]>()
    const taken = new Set<string>()
    for (const row of rows) {
      if (!row.legacyId) continue
      taken.add(row.legacyId)
      const group = groups.get(row.legacyId)
      if (group) group.push(row.id)
      else groups.set(row.legacyId, [row.id])
    }

    for (const legacyId of Array.from(groups.keys()).sort()) {
      // UUIDv7 ids sort by creation time, so the earliest row keeps the id the
      // migration derived and the later ones move aside.
      const ids = (groups.get(legacyId) ?? []).slice().sort()
      for (const rowId of ids.slice(1)) {
        let candidate = `${legacyId}@2`
        for (let suffix = 2; taken.has(candidate); suffix += 1) {
          candidate = `${legacyId}@${suffix + 1}`
        }
        taken.add(candidate)
        fixes.push({ table, rowId, fromLegacyId: legacyId, toLegacyId: candidate })
      }
    }
  }

  return fixes
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
      const candidates = rows.filter(
        (row) =>
          canonicalCategoryId(categoriesRows, row.categoryId) === category.id &&
          row.year === cell.year &&
          row.month === cell.month,
      )
      // A duplicate category's cell maps to the canonical id too, but the
      // category merge deletes it when the canonical row already has a cell for
      // the same (year, month). Prefer the row that survives so the planned
      // update cannot be silently dropped.
      const existing = candidates.find((row) => row.categoryId === category.id) ?? candidates[0]
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
  const [categoryRows, accountRows, budgetRows, snapshotRows, balanceRows, correlationRows] =
    await Promise.all([
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(accounts).where(eq(accounts.userId, userId)),
      db.select().from(budgetEntries).where(eq(budgetEntries.userId, userId)),
      db.select().from(wealthSnapshots).where(eq(wealthSnapshots.userId, userId)),
      db.select().from(snapshotBalances).where(eq(snapshotBalances.userId, userId)),
      correlationIdRows(db, userId),
    ])

  const merges = await categoryMerges(db, userId, categoryRows)
  const mergedAway = new Set(merges.map((merge) => merge.duplicateCategoryId))

  return {
    categoryMerges: merges,
    accountKindCorrections: accountKindCorrections(accountRows),
    budgetRestorations: budgetRestorations(budgetRows, categoryRows, backup.budgetCells),
    snapshotRestorations: snapshotRestorations(
      snapshotRows,
      balanceRows,
      accountRows,
      backup.snapshots,
    ),
    // A row the merge deletes needs no rename, and renaming it first would be
    // a change the plan then undoes.
    correlationIdFixes: correlationIdFixes(correlationRows).filter(
      (fix) => !mergedAway.has(fix.rowId),
    ),
  }
}

const REPAIR_BACKUP_ERROR =
  'Se exige un export de respaldo válido antes de ejecutar la reparación.'

function isRepairBackupBudgetCell(value: unknown): value is RepairBackupBudgetCell {
  if (!value || typeof value !== 'object') {
    return false
  }
  const cell = value as Record<string, unknown>
  return (
    typeof cell.categoryName === 'string' &&
    typeof cell.categoryKind === 'string' &&
    typeof cell.year === 'number' &&
    typeof cell.month === 'number' &&
    typeof cell.amountMinor === 'number' &&
    typeof cell.currency === 'string'
  )
}

function isRepairBackupSnapshotBalance(value: unknown): value is RepairBackupSnapshotBalance {
  if (!value || typeof value !== 'object') {
    return false
  }
  const balance = value as Record<string, unknown>
  return (
    (balance.accountLegacyId === null || typeof balance.accountLegacyId === 'string') &&
    typeof balance.balanceMinor === 'number' &&
    typeof balance.currency === 'string'
  )
}

function isRepairBackupSnapshot(value: unknown): value is RepairBackupSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }
  const snapshot = value as Record<string, unknown>
  return (
    typeof snapshot.year === 'number' &&
    typeof snapshot.month === 'number' &&
    typeof snapshot.snapshotDate === 'string' &&
    Array.isArray(snapshot.balances) &&
    snapshot.balances.every(isRepairBackupSnapshotBalance)
  )
}

/**
 * Validates and converts an external backup input into a typed RepairBackup.
 * Supports both direct RepairBackup JSON and legacy v1 State JSON exports.
 */
export function loadRepairBackup(data: unknown): RepairBackup {
  if (!data || typeof data !== 'object') {
    throw new Error(REPAIR_BACKUP_ERROR)
  }

  const obj = data as Record<string, unknown>

  if (Array.isArray(obj.budgetCells) && Array.isArray(obj.snapshots)) {
    if (
      !obj.budgetCells.every(isRepairBackupBudgetCell) ||
      !obj.snapshots.every(isRepairBackupSnapshot)
    ) {
      throw new Error(REPAIR_BACKUP_ERROR)
    }
    return {
      budgetCells: obj.budgetCells,
      snapshots: obj.snapshots,
    }
  }

  if ('budget' in obj && typeof obj.budget === 'object' && obj.budget !== null) {
    const year = typeof obj.year === 'number' ? obj.year : new Date().getFullYear()
    const currency = typeof obj.currency === 'string' ? obj.currency : 'EUR'
    const budgetObj = obj.budget as Record<string, Record<string, unknown[]>>
    const budgetCells: RepairBackupBudgetCell[] = []
    const kinds = ['income', 'expense', 'investment'] as const

    for (const kind of kinds) {
      const group = budgetObj[kind] || {}
      for (const [categoryName, monthly] of Object.entries(group)) {
        if (!Array.isArray(monthly)) continue
        for (let m = 0; m < monthly.length && m < 12; m++) {
          const amount = monthly[m]
          if (typeof amount === 'number' && Number.isFinite(amount)) {
            budgetCells.push({
              categoryName,
              categoryKind: kind,
              year,
              month: m + 1,
              amountMinor: Math.round(amount * 100),
              currency,
            })
          }
        }
      }
    }

    const snapshots: RepairBackupSnapshot[] = []
    if ('snapshots' in obj && typeof obj.snapshots === 'object' && obj.snapshots !== null) {
      const snapshotsObj = obj.snapshots as Record<
        string,
        {
          month?: number
          accounts?: Record<string, number>
          investments?: Record<string, number>
          liabilities?: Record<string, number>
        }
      >

      for (const [key, raw] of Object.entries(snapshotsObj)) {
        if (!raw) continue
        const monthNum = typeof raw.month === 'number' ? raw.month + 1 : Number(key)
        const pad2 = (n: number) => String(n).padStart(2, '0')
        const snapshotDate = `${year}-${pad2(monthNum)}-01`
        const balances: RepairBackupSnapshotBalance[] = []

        const addBalances = (group?: Record<string, number>) => {
          if (!group) return
          for (const [accId, val] of Object.entries(group)) {
            if (typeof val === 'number') {
              balances.push({
                accountLegacyId: accId,
                balanceMinor: Math.round(val * 100),
                currency,
              })
            }
          }
        }

        addBalances(raw.accounts)
        addBalances(raw.investments)
        addBalances(raw.liabilities)

        snapshots.push({
          year,
          month: monthNum,
          snapshotDate,
          balances,
        })
      }
    }

    return { budgetCells, snapshots }
  }

  throw new Error(REPAIR_BACKUP_ERROR)
}

export interface FormatRepairPlanOptions {
  simulation?: boolean
}

/**
 * Formats a RepairPlan into a human-readable simulation report.
 */
export function formatRepairPlan(plan: RepairPlan, options?: FormatRepairPlanOptions): string {
  const lines: string[] = []

  if (options?.simulation) {
    lines.push('======================================================================')
    lines.push('  [SIMULACIÓN] PLAN DE REPARACIÓN DE DATOS CORROMPIDOS (SOLO LECTURA)')
    lines.push('  Ningún cambio ha sido escrito en la base de datos.')
    lines.push('======================================================================')
  } else {
    lines.push('======================================================================')
    lines.push('  PLAN DE REPARACIÓN DE DATOS CORROMPIDOS')
    lines.push('======================================================================')
  }

  // 1. Categories
  lines.push('')
  lines.push(`1. Fusión de categorías duplicadas (${plan.categoryMerges.length}):`)
  if (plan.categoryMerges.length === 0) {
    lines.push('   Ninguna categoría duplicada detectada.')
  } else {
    for (const merge of plan.categoryMerges) {
      lines.push(
        `   • "${merge.name}" (${merge.kind}): duplicado ${merge.duplicateCategoryId} -> migrada ${merge.canonicalCategoryId}`,
      )
      lines.push(`     Referencias a repuntar (${merge.references.length}):`)
      for (const ref of merge.references) {
        lines.push(`       - ${ref.table}.${ref.column} (fila id: ${ref.rowId})`)
      }
    }
  }

  // 2. Accounts
  lines.push('')
  lines.push(`2. Corrección de cuentas con tipo erróneo (${plan.accountKindCorrections.length}):`)
  if (plan.accountKindCorrections.length === 0) {
    lines.push('   Ninguna cuenta con tipo erróneo detectada.')
  } else {
    for (const acc of plan.accountKindCorrections) {
      lines.push(`   • "${acc.name}" (${acc.accountId}): tipo "${acc.fromKind}" -> "${acc.toKind}"`)
    }
  }

  // 3. Budget cells
  lines.push('')
  lines.push(`3. Restauración de celdas de presupuesto (${plan.budgetRestorations.length}):`)
  if (plan.budgetRestorations.length === 0) {
    lines.push('   Ninguna celda de presupuesto pendiente de restauración.')
  } else {
    for (const cell of plan.budgetRestorations) {
      const formattedMonth = String(cell.month).padStart(2, '0')
      const amount = (cell.amountMinor / 100).toFixed(2)
      lines.push(
        `   • [${cell.action.toUpperCase()}] Categoría ${cell.categoryId}, ${cell.year}-${formattedMonth}: ${amount} ${cell.currency} (motivo: ${cell.reason})`,
      )
    }
  }

  // 4. Wealth snapshots
  lines.push('')
  lines.push(`4. Restauración de snapshots de patrimonio (${plan.snapshotRestorations.length}):`)
  if (plan.snapshotRestorations.length === 0) {
    lines.push('   Ningún snapshot pendiente de restauración.')
  } else {
    for (const snapshot of plan.snapshotRestorations) {
      const formattedMonth = String(snapshot.month).padStart(2, '0')
      lines.push(
        `   • [${snapshot.action.toUpperCase()}] Snapshot fecha ${snapshot.snapshotDate} (${snapshot.year}-${formattedMonth}): ${snapshot.balances.length} saldo(s) (motivo: ${snapshot.reason})`,
      )
    }
  }

  // 5. Correlation id collisions
  lines.push('')
  lines.push(`5. Colisiones de clave de correlación (${plan.correlationIdFixes.length}):`)
  if (plan.correlationIdFixes.length === 0) {
    lines.push('   Ninguna colisión detectada.')
  } else {
    for (const fix of plan.correlationIdFixes) {
      lines.push(
        `   • ${fix.table}: fila ${fix.rowId} -> "${fix.toLegacyId}" (antes "${fix.fromLegacyId}")`,
      )
    }
  }

  lines.push('')
  lines.push('----------------------------------------------------------------------')
  lines.push(
    `Total acciones: ${plan.categoryMerges.length} fusiones, ${plan.accountKindCorrections.length} correcciones de cuenta, ${plan.budgetRestorations.length} restauraciones de presupuesto, ${plan.snapshotRestorations.length} restauraciones de snapshot, ${plan.correlationIdFixes.length} renombrados de correlación.`,
  )
  lines.push('----------------------------------------------------------------------')

  return lines.join('\n')
}

export interface RepairExecutionReport {
  categoryMerges: number
  referencesRepointed: number
  accountsCorrected: number
  budgetEntriesUpdated: number
  budgetEntriesInserted: number
  snapshotsUpdated: number
  snapshotsInserted: number
  correlationIdsRenamed: number
}

/**
 * The tables the repair can touch, parents before children. The order is load
 * bearing on both ends: the emitted SQL deletes in reverse (a child row cannot
 * outlive the parent it points at) and inserts in this order, so applying it
 * with `wrangler d1 execute --remote` never trips a foreign key.
 */
const REPAIR_TABLE_ORDER = [
  'accounts',
  'categories',
  'wealth_snapshots',
  'contributions',
  'twr_liquidity_accounts',
  'transactions',
  'recurring_rules',
  'pending_movements',
  'subscriptions',
  'budget_entries',
  'goals',
  'snapshot_balances',
  'contribution_allocations',
  'user_instruments',
  'stockevents_symbol_mappings',
] as const

/** Which of those tables the plan actually writes to. */
function affectedTables(plan: RepairPlan): string[] {
  const touched = new Set<string>()
  for (const fix of plan.correlationIdFixes) touched.add(fix.table)
  if (plan.categoryMerges.length > 0) {
    touched.add('categories')
    for (const merge of plan.categoryMerges) {
      for (const reference of merge.references) touched.add(reference.table)
    }
  }
  if (plan.accountKindCorrections.length > 0) touched.add('accounts')
  if (plan.budgetRestorations.length > 0) touched.add('budget_entries')
  if (plan.snapshotRestorations.length > 0) {
    touched.add('wealth_snapshots')
    touched.add('snapshot_balances')
  }
  return REPAIR_TABLE_ORDER.filter((table) => touched.has(table))
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Writes the repaired state of every table the plan touched as SQL for
 * `wrangler d1 execute finance-tracker-db-v2 --remote --file=<out>`.
 *
 * The repair itself only writes to a local copy of production (no Workers
 * runtime is available from a plain Node script), so this is the step that
 * carries the result back. It replaces whole tables per user rather than
 * replaying each change, which keeps it exact: the local copy *is* the
 * intended end state. It deliberately leaves `sync_changes`, `sync_commands`,
 * `audit_events` and `user_revisions` alone — deleting the change log or the
 * revision cursor would make every other device miss the repair.
 */
export function writeRemoteRepairSql(
  sqlite: Database.Database,
  userId: string,
  plan: RepairPlan,
  outPath: string,
): string[] {
  const tables = affectedTables(plan)
  const userIdSql = sqlLiteral(userId)
  const statements: string[] = []

  for (const table of [...tables].reverse()) {
    statements.push(`DELETE FROM ${table} WHERE user_id = ${userIdSql};`)
  }
  for (const table of tables) {
    const rows = sqlite
      .prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY id`)
      .all(userId) as Array<Record<string, unknown>>
    for (const row of rows) {
      const columns = Object.keys(row)
      statements.push(
        `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns
          .map((column) => sqlLiteral(row[column]))
          .join(', ')});`,
      )
    }
  }

  const file = [
    '-- Generado por scripts/repair-corrupted-data.ts (--remote-sql-out).',
    '-- Aplicar con: wrangler d1 execute finance-tracker-db-v2 --remote --file=<este fichero>',
    '',
    ...statements,
    '',
  ].join('\n')
  writeFileSync(outPath, file, 'utf8')
  return tables
}

async function insertSnapshotBalances(
  db: Db,
  userId: string,
  snapshotId: string,
  balances: readonly SnapshotBalanceRepair[],
  now: string,
): Promise<void> {
  for (const balance of balances) {
    await db.insert(snapshotBalances).values({
      id: uuidv7(),
      userId,
      snapshotId,
      accountId: balance.accountId,
      balanceMinor: balance.balanceMinor,
      currency: balance.currency,
      createdAt: now,
    })
  }
}

/**
 * Applies the repair plan inside a transaction.
 */
export async function applyRepairPlan(
  db: Db,
  userId: string,
  plan: RepairPlan,
): Promise<RepairExecutionReport> {
  return runInTransaction(db, async () => {
    let referencesRepointed = 0
    let categoryMerges = 0
    let accountsCorrected = 0
    let budgetEntriesUpdated = 0
    let budgetEntriesInserted = 0
    let snapshotsUpdated = 0
    let snapshotsInserted = 0
    let correlationIdsRenamed = 0

    const now = nowIso()

    // 1. Repoint references and remove duplicate categories
    for (const merge of plan.categoryMerges) {
      for (const ref of merge.references) {
        if (ref.table === 'transactions') {
          await db
            .update(transactions)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(and(eq(transactions.userId, userId), eq(transactions.id, ref.rowId)))
        } else if (ref.table === 'pending_movements') {
          await db
            .update(pendingMovements)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(and(eq(pendingMovements.userId, userId), eq(pendingMovements.id, ref.rowId)))
        } else if (ref.table === 'recurring_rules') {
          await db
            .update(recurringRules)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(and(eq(recurringRules.userId, userId), eq(recurringRules.id, ref.rowId)))
        } else if (ref.table === 'subscriptions') {
          await db
            .update(subscriptions)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(and(eq(subscriptions.userId, userId), eq(subscriptions.id, ref.rowId)))
        } else if (ref.table === 'budget_entries') {
          const [entry] = await db
            .select({ year: budgetEntries.year, month: budgetEntries.month })
            .from(budgetEntries)
            .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.id, ref.rowId)))
          if (entry) {
            const [conflict] = await db
              .select({ id: budgetEntries.id })
              .from(budgetEntries)
              .where(
                and(
                  eq(budgetEntries.userId, userId),
                  eq(budgetEntries.categoryId, merge.canonicalCategoryId),
                  eq(budgetEntries.year, entry.year),
                  eq(budgetEntries.month, entry.month),
                ),
              )
            if (conflict) {
              // The canonical category already owns a cell for this (year,
              // month); dropping the duplicate's row is not a reference that
              // gets repointed.
              await db
                .delete(budgetEntries)
                .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.id, ref.rowId)))
              continue
            }
          }
          await db
            .update(budgetEntries)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.id, ref.rowId)))
        } else if (ref.table === 'user_instruments') {
          await db
            .update(userInstruments)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(and(eq(userInstruments.userId, userId), eq(userInstruments.id, ref.rowId)))
        } else if (ref.table === 'stockevents_symbol_mappings') {
          await db
            .update(stockeventsSymbolMappings)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(
              and(
                eq(stockeventsSymbolMappings.userId, userId),
                eq(stockeventsSymbolMappings.id, ref.rowId),
              ),
            )
        }
        referencesRepointed++
      }

      await db
        .delete(categories)
        .where(and(eq(categories.userId, userId), eq(categories.id, merge.duplicateCategoryId)))
      categoryMerges++
    }

    // 2. Correct account kinds
    for (const correction of plan.accountKindCorrections) {
      await db
        .update(accounts)
        .set({ kind: correction.toKind, updatedAt: now })
        .where(and(eq(accounts.userId, userId), eq(accounts.id, correction.accountId)))
      accountsCorrected++
    }

    // 3. Restore budget cells
    for (const cell of plan.budgetRestorations) {
      if (cell.action === 'update') {
        const updated = cell.budgetEntryId
          ? await db
              .update(budgetEntries)
              .set({ amountMinor: cell.amountMinor, currency: cell.currency, updatedAt: now })
              .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.id, cell.budgetEntryId)))
              .returning({ id: budgetEntries.id })
          : await db
              .update(budgetEntries)
              .set({ amountMinor: cell.amountMinor, currency: cell.currency, updatedAt: now })
              .where(
                and(
                  eq(budgetEntries.userId, userId),
                  eq(budgetEntries.categoryId, cell.categoryId),
                  eq(budgetEntries.year, cell.year),
                  eq(budgetEntries.month, cell.month),
                ),
              )
              .returning({ id: budgetEntries.id })
        if (updated.length === 0) {
          throw new Error(
            `No se pudo restaurar la celda de presupuesto ${cell.categoryId} ${cell.year}-${cell.month}: la fila planificada ya no existe.`,
          )
        }
        budgetEntriesUpdated += updated.length
      } else if (cell.action === 'insert') {
        await db.insert(budgetEntries).values({
          id: uuidv7(),
          userId,
          categoryId: cell.categoryId,
          year: cell.year,
          month: cell.month,
          amountMinor: cell.amountMinor,
          currency: cell.currency,
          createdAt: now,
          updatedAt: now,
          version: 1,
        })
        budgetEntriesInserted++
      }
    }

    // 4. Restore snapshots
    for (const snapshot of plan.snapshotRestorations) {
      if (snapshot.action === 'insert') {
        const snapshotId = uuidv7()
        await db.insert(wealthSnapshots).values({
          id: snapshotId,
          userId,
          snapshotDate: snapshot.snapshotDate,
          year: snapshot.year,
          month: snapshot.month,
          createdAt: now,
          updatedAt: now,
          version: 1,
        })
        await insertSnapshotBalances(db, userId, snapshotId, snapshot.balances, now)
        snapshotsInserted++
      } else if (snapshot.action === 'update') {
        const snapshotId = snapshot.snapshotId!
        await db
          .update(wealthSnapshots)
          .set({ snapshotDate: snapshot.snapshotDate, updatedAt: now })
          .where(and(eq(wealthSnapshots.userId, userId), eq(wealthSnapshots.id, snapshotId)))

        await db
          .delete(snapshotBalances)
          .where(
            and(
              eq(snapshotBalances.userId, userId),
              eq(snapshotBalances.snapshotId, snapshotId),
            ),
          )

        await insertSnapshotBalances(db, userId, snapshotId, snapshot.balances, now)
        snapshotsUpdated++
      }
    }

    // 5. Move colliding correlation ids aside, so the closing UNIQUE on
    // `(user_id, legacy_id)` can hold without deleting a real row.
    for (const fix of plan.correlationIdFixes) {
      const changes = { legacyId: fix.toLegacyId, updatedAt: now }
      if (fix.table === 'accounts') {
        await db
          .update(accounts)
          .set(changes)
          .where(and(eq(accounts.userId, userId), eq(accounts.id, fix.rowId)))
      } else if (fix.table === 'categories') {
        await db
          .update(categories)
          .set(changes)
          .where(and(eq(categories.userId, userId), eq(categories.id, fix.rowId)))
      } else if (fix.table === 'twr_liquidity_accounts') {
        await db
          .update(twrLiquidityAccounts)
          .set(changes)
          .where(
            and(
              eq(twrLiquidityAccounts.userId, userId),
              eq(twrLiquidityAccounts.id, fix.rowId),
            ),
          )
      } else if (fix.table === 'transactions') {
        await db
          .update(transactions)
          .set(changes)
          .where(and(eq(transactions.userId, userId), eq(transactions.id, fix.rowId)))
      } else if (fix.table === 'subscriptions') {
        await db
          .update(subscriptions)
          .set(changes)
          .where(and(eq(subscriptions.userId, userId), eq(subscriptions.id, fix.rowId)))
      } else if (fix.table === 'recurring_rules') {
        await db
          .update(recurringRules)
          .set(changes)
          .where(and(eq(recurringRules.userId, userId), eq(recurringRules.id, fix.rowId)))
      } else if (fix.table === 'pending_movements') {
        await db
          .update(pendingMovements)
          .set(changes)
          .where(and(eq(pendingMovements.userId, userId), eq(pendingMovements.id, fix.rowId)))
      } else if (fix.table === 'budget_entries') {
        await db
          .update(budgetEntries)
          .set(changes)
          .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.id, fix.rowId)))
      } else if (fix.table === 'goals') {
        await db
          .update(goals)
          .set(changes)
          .where(and(eq(goals.userId, userId), eq(goals.id, fix.rowId)))
      } else if (fix.table === 'wealth_snapshots') {
        await db
          .update(wealthSnapshots)
          .set(changes)
          .where(and(eq(wealthSnapshots.userId, userId), eq(wealthSnapshots.id, fix.rowId)))
      } else if (fix.table === 'contributions') {
        await db
          .update(contributions)
          .set(changes)
          .where(and(eq(contributions.userId, userId), eq(contributions.id, fix.rowId)))
      } else if (fix.table === 'stockevents_symbol_mappings') {
        await db
          .update(stockeventsSymbolMappings)
          .set(changes)
          .where(
            and(
              eq(stockeventsSymbolMappings.userId, userId),
              eq(stockeventsSymbolMappings.id, fix.rowId),
            ),
          )
      } else {
        throw new Error(`Tabla desconocida en el plan de reparación: ${fix.table}`)
      }
      correlationIdsRenamed++
    }

    return {
      categoryMerges,
      referencesRepointed,
      accountsCorrected,
      budgetEntriesUpdated,
      budgetEntriesInserted,
      snapshotsUpdated,
      snapshotsInserted,
      correlationIdsRenamed,
    }
  })
}
