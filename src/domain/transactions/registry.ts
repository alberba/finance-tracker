import type { Month } from '../../lib/month'
import { parseDecimal, round2 } from '../../lib/number'
import type { TransactionSort } from '../../scripts/transactions'
import type { Transaction, TransactionType } from '../../scripts/types'

type Dated = Pick<Transaction, 'date' | 'month'>

/**
 * The year whose month the movement counts in. A movement can count in a
 * neighbouring month (a payslip on the 28th counts next month), so a month
 * more than half a year away from the date's month belongs to the year next
 * to it.
 */
export function accountingYear(tx: Dated): number | null {
  const match = String(tx.date).match(/^(\d{4})-(\d{2})/)
  if (!match) return null
  const year = Number(match[1])
  const dateMonth = Number(match[2])
  const shift = Number(tx.month) - dateMonth
  if (shift < -6) return year + 1
  if (shift > 6) return year - 1
  return year
}

export interface MonthTotals {
  income: number
  expense: number
  saving: number
  investment: number
  /** Income minus expenses minus investment. */
  net: number
}

function inMonth(tx: Transaction, year: number, month: Month): boolean {
  return Number(tx.month) === month && accountingYear(tx) === year
}

/** What came in, went out and was invested in one month of a year. */
export function monthTotals(transactions: Transaction[], year: number, month: Month): MonthTotals {
  const totals = { income: 0, expense: 0, saving: 0, investment: 0 }
  transactions.forEach((tx) => {
    if (inMonth(tx, year, month)) totals[tx.type] += Number(tx.amount || 0)
  })
  const income = round2(totals.income)
  const expense = round2(totals.expense)
  const saving = round2(totals.saving)
  const investment = round2(totals.investment)
  // A saving moves money between cash accounts, so it does not reduce the net.
  return { income, expense, saving, investment, net: round2(income - expense - investment) }
}

/** What the registry toolbar narrows the year down to. Empty means no filter. */
export interface RegistryFilters {
  /** Matches the description or the category. */
  search: string
  types: string[]
  accountIds: string[]
  date: string
  amountMin: string
  amountMax: string
}

export interface MonthGroup {
  month: Month
  count: number
  /** Net of the movements shown: income minus expenses and investment. */
  net: number
  rows: Transaction[]
}

/**
 * The amount as it moves the net: income adds, expenses and investment subtract, and a saving
 * moves money between cash accounts so it leaves the net alone.
 */
export function signedAmount(tx: Pick<Transaction, 'type' | 'amount'>): number {
  const amount = Number(tx.amount || 0)
  if (tx.type === 'saving') return 0
  return tx.type === 'income' ? amount : -amount
}

function bound(value: string): number | null {
  const parsed = parseDecimal(value)
  return Number.isFinite(parsed) ? parsed : null
}

function matcher(filters: RegistryFilters): (tx: Transaction) => boolean {
  const search = filters.search.trim().toLowerCase()
  const min = bound(filters.amountMin)
  const max = bound(filters.amountMax)
  return (tx) => {
    const amount = Number(tx.amount || 0)
    if (filters.types.length && !filters.types.includes(tx.type)) return false
    if (filters.accountIds.length && !filters.accountIds.includes(tx.accountId)) return false
    if (filters.date && tx.date !== filters.date) return false
    if (min !== null && amount < min) return false
    if (max !== null && amount > max) return false
    if (!search) return true
    return [tx.description, tx.category].some((text) =>
      String(text || '')
        .toLowerCase()
        .includes(search),
    )
  }
}

function comparator(sort: TransactionSort): (a: Transaction, b: Transaction) => number {
  const direction = sort.direction === 'asc' ? 1 : -1
  if (sort.column === 'amount') {
    return (a, b) => (Number(a.amount || 0) - Number(b.amount || 0)) * direction
  }
  return (a, b) => String(a.date).localeCompare(String(b.date)) * direction
}

/** The year's movements that match the filters, grouped by month, newest month first. */
export function buildMonthGroups(
  transactions: Transaction[],
  year: number,
  filters: RegistryFilters,
  sort: TransactionSort,
): MonthGroup[] {
  const matches = matcher(filters)
  const byMonth = new Map<Month, Transaction[]>()
  transactions.forEach((tx) => {
    if (accountingYear(tx) !== year || !matches(tx)) return
    const month = tx.month
    byMonth.set(month, [...(byMonth.get(month) ?? []), tx])
  })
  return Array.from(byMonth, ([month, rows]) => ({
    month,
    count: rows.length,
    net: round2(rows.reduce((sum, tx) => sum + signedAmount(tx), 0)),
    rows: rows.sort(comparator(sort)),
  })).sort((a, b) => b.month - a.month)
}

/** Years the registry can show: those with movements plus the current one, newest first. */
export function registryYears(transactions: Transaction[], currentYear: number): number[] {
  const years = new Set<number>([currentYear])
  transactions.forEach((tx) => {
    const year = accountingYear(tx)
    if (year !== null) years.add(year)
  })
  return Array.from(years).sort((a, b) => b - a)
}

export interface CategoryShare {
  category: string
  amount: number
  /** Share of the type's month total, 0–100. */
  share: number
}

/** One type of a month split by category, largest first. */
export function categoryBreakdown(
  transactions: Transaction[],
  year: number,
  month: Month,
  type: TransactionType,
): CategoryShare[] {
  const byCategory = new Map<string, number>()
  transactions.forEach((tx) => {
    if (tx.type !== type || !inMonth(tx, year, month)) return
    const category = tx.category || 'Sin categoría'
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(tx.amount || 0))
  })
  const total = Array.from(byCategory.values()).reduce((sum, amount) => sum + amount, 0)
  return Array.from(byCategory, ([category, amount]) => ({
    category,
    amount: round2(amount),
    share: total > 0 ? (amount / total) * 100 : 0,
  })).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, 'es'))
}
