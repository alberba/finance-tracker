import { getWealthByMonth } from '../../lib/finance-core'
import { formatLongDate, formatShortDate } from '../../lib/format'
import { asMonth } from '../../lib/month'
import { round2 } from '../../lib/number'
import type { State, Transaction, TransactionType } from '../../scripts/types'
import { hasTypeRestriction, registryMatcher, type RegistryFilters } from '../transactions/registry'
import type { MonthlyReportPeriod } from './period'

/** What a report reads: movements, account names and what the position is built from. */
export type MonthlyReportState = Pick<
  State,
  'currency' | 'accounts' | 'investmentAssets' | 'liabilities' | 'snapshots' | 'transactions'
>

/** How many of the period's latest movements the report lists. */
export const REPORT_MOVEMENT_LIMIT = 20

const TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Ingresos',
  expense: 'Gastos',
  saving: 'Ahorros',
  investment: 'Inversión',
}

export interface MonthlyReportSummary {
  income: number
  expense: number
  /** Income minus expenses; saving and investment are shown beside it, not taken from it. */
  net: number
  saving: number
  investment: number
}

export interface MonthlyReportCategoryRow {
  category: string
  count: number
  amount: number
  /** Share of the type's total, 0–100. */
  share: number
}

export interface MonthlyReportMovementRow {
  id: string
  date: string
  description: string
  category: string
  /** The account, or «origin → destination» for a saving. */
  account: string
  type: TransactionType
  /** Always positive; `direction` says how it moves the money. */
  amount: number
  /** Income comes in, expenses and investment go out, a saving moves between accounts. */
  direction: 'in' | 'out' | 'none'
}

export interface MonthlyReportPosition {
  /** The ISO date the position is as of: the day the report is generated. */
  asOf: string
  cash: number
  investment: number
  liabilities: number
  net: number
}

export interface MonthlyReportViewModel {
  periodLabel: string
  generatedLabel: string
  currency: string
  /** The movements filters narrowing the report, as short phrases; empty when none does. */
  appliedFilters: string[]
  summary: MonthlyReportSummary
  expenseCategories: MonthlyReportCategoryRow[]
  incomeCategories: MonthlyReportCategoryRow[]
  movements: MonthlyReportMovementRow[]
  /** Movements in the period, listed or not. */
  movementCount: number
  /** Says how many movements the list leaves out; empty when it shows them all. */
  movementsNote: string
  position: MonthlyReportPosition
  hasMovements: boolean
}

function datePart(tx: Transaction): string {
  return String(tx.date).slice(0, 10)
}

/** The movements a report covers, in the order of `transactions`: date in the period, filters passed. */
export function selectReportTransactions(input: {
  transactions: Transaction[]
  period: MonthlyReportPeriod
  filters: RegistryFilters
}): Transaction[] {
  const matches = registryMatcher(input.filters)
  return input.transactions.filter((tx) => {
    const date = datePart(tx)
    return date >= input.period.from && date <= input.period.to && matches(tx)
  })
}

function categoryRows(
  transactions: Transaction[],
  type: TransactionType,
): MonthlyReportCategoryRow[] {
  const byCategory = new Map<string, { count: number; amount: number }>()
  transactions.forEach((tx) => {
    if (tx.type !== type) return
    const category = tx.category?.trim() || 'Sin categoría'
    const row = byCategory.get(category) ?? { count: 0, amount: 0 }
    row.count += 1
    row.amount += Number(tx.amount || 0)
    byCategory.set(category, row)
  })
  const rows = Array.from(byCategory, ([category, row]) => ({ category, ...row })).filter(
    (row) => row.amount > 0,
  )
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return rows
    .map((row) => ({
      category: row.category,
      count: row.count,
      amount: round2(row.amount),
      share: total > 0 ? (row.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, 'es'))
}

function total(transactions: Transaction[], type: TransactionType): number {
  return round2(
    transactions.reduce((sum, tx) => (tx.type === type ? sum + Number(tx.amount || 0) : sum), 0),
  )
}

function describeFilters(filters: RegistryFilters, accountName: (id: string) => string): string[] {
  const described: string[] = []
  if (hasTypeRestriction(filters.types)) {
    described.push(
      filters.types.map((type) => TYPE_LABEL[type as TransactionType] ?? type).join(', '),
    )
  }
  if (filters.accountIds.length) {
    described.push(`Cuenta: ${filters.accountIds.map(accountName).join(', ')}`)
  }
  const search = filters.search.trim()
  if (search) described.push(`Búsqueda: «${search}»`)
  return described
}

function movementsNote(left: number): string {
  if (left <= 0) return ''
  return left === 1
    ? 'y 1 movimiento más no se muestra'
    : `y ${left} movimientos más no se muestran`
}

/**
 * Everything the report shows for a period: the movements whose date falls in it (the accounting
 * month does not count here) that pass the registry's search, type and account filters, plus the
 * current position, which no filter narrows. Pure: it never changes `state`.
 */
export function buildMonthlyReportViewModel(input: {
  state: MonthlyReportState
  period: MonthlyReportPeriod
  filters: RegistryFilters
  today: string
}): MonthlyReportViewModel {
  const { state, period, filters, today } = input
  const accountName = (id: string): string =>
    state.accounts.find((account) => account.id === id)?.name ?? id
  const inPeriod = selectReportTransactions({ transactions: state.transactions, period, filters })

  const income = total(inPeriod, 'income')
  const expense = total(inPeriod, 'expense')
  const sorted = [...inPeriod].sort(
    (a, b) => datePart(b).localeCompare(datePart(a)) || b.id.localeCompare(a.id),
  )
  const movements = sorted.slice(0, REPORT_MOVEMENT_LIMIT).map<MonthlyReportMovementRow>((tx) => ({
    id: tx.id,
    date: datePart(tx),
    description: tx.description,
    category: tx.category?.trim() || 'Sin categoría',
    account:
      tx.type === 'saving' && tx.destinationAccountId
        ? `${accountName(tx.accountId)} → ${accountName(tx.destinationAccountId)}`
        : accountName(tx.accountId),
    type: tx.type,
    amount: Number(tx.amount || 0),
    direction: tx.type === 'saving' ? 'none' : tx.type === 'income' ? 'in' : 'out',
  }))

  const month = asMonth(Number(today.slice(5, 7))) ?? 12
  const wealth = getWealthByMonth(
    month,
    state.accounts,
    state.investmentAssets,
    state.liabilities,
    state.transactions,
    state.snapshots,
  )

  return {
    periodLabel: `${formatShortDate(period.from)} – ${formatShortDate(period.to)}`,
    generatedLabel: formatLongDate(today),
    currency: state.currency || 'EUR',
    appliedFilters: describeFilters(filters, accountName),
    summary: {
      income,
      expense,
      net: round2(income - expense),
      saving: total(inPeriod, 'saving'),
      investment: total(inPeriod, 'investment'),
    },
    expenseCategories: categoryRows(inPeriod, 'expense'),
    incomeCategories: categoryRows(inPeriod, 'income'),
    movements,
    movementCount: inPeriod.length,
    movementsNote: movementsNote(inPeriod.length - movements.length),
    position: {
      asOf: today,
      cash: wealth.liquidity,
      investment: wealth.investment,
      liabilities: wealth.liabilities,
      net: wealth.net,
    },
    hasMovements: inPeriod.length > 0,
  }
}
