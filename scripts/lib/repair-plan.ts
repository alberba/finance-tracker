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

/**
 * Validates and converts an external backup input into a typed RepairBackup.
 * Supports both direct RepairBackup JSON and legacy v1 State JSON exports.
 */
export function loadRepairBackup(data: unknown): RepairBackup {
  if (!data || typeof data !== 'object') {
    throw new Error('Se exige un export de respaldo válido antes de ejecutar la reparación.')
  }

  const obj = data as Record<string, unknown>

  if (Array.isArray(obj.budgetCells) && Array.isArray(obj.snapshots)) {
    return {
      budgetCells: obj.budgetCells as RepairBackupBudgetCell[],
      snapshots: obj.snapshots as RepairBackupSnapshot[],
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
          if (typeof amount === 'number' && amount > 0) {
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

  throw new Error('Se exige un export de respaldo válido antes de ejecutar la reparación.')
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

  lines.push('')
  lines.push('----------------------------------------------------------------------')
  lines.push(
    `Total acciones: ${plan.categoryMerges.length} fusiones, ${plan.accountKindCorrections.length} correcciones de cuenta, ${plan.budgetRestorations.length} restauraciones de presupuesto, ${plan.snapshotRestorations.length} restauraciones de snapshot.`,
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
          await db
            .update(budgetEntries)
            .set({ categoryId: merge.canonicalCategoryId, updatedAt: now })
            .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.id, ref.rowId)))
        } else if (ref.table === 'user_instruments') {
          await db
            .update(userInstruments)
            .set({ categoryId: merge.canonicalCategoryId })
            .where(and(eq(userInstruments.userId, userId), eq(userInstruments.id, ref.rowId)))
        } else if (ref.table === 'stockevents_symbol_mappings') {
          await db
            .update(stockeventsSymbolMappings)
            .set({ categoryId: merge.canonicalCategoryId })
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
        if (cell.budgetEntryId) {
          await db
            .update(budgetEntries)
            .set({ amountMinor: cell.amountMinor, currency: cell.currency, updatedAt: now })
            .where(and(eq(budgetEntries.userId, userId), eq(budgetEntries.id, cell.budgetEntryId)))
        } else {
          await db
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
        }
        budgetEntriesUpdated++
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
        for (const balance of snapshot.balances) {
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

        for (const balance of snapshot.balances) {
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
        snapshotsUpdated++
      }
    }

    return {
      categoryMerges,
      referencesRepointed,
      accountsCorrected,
      budgetEntriesUpdated,
      budgetEntriesInserted,
      snapshotsUpdated,
      snapshotsInserted,
    }
  })
}

