import { ALL_MONTHS, monthFromDate, type Month } from '../../lib/month'
import {
  computeAccountBalance,
  computeInvestmentValue,
  computeLiabilityValue,
  getSnapshotValue,
  type Entity,
  type Snapshot,
  type Transaction,
} from '../../lib/finance-core'
import { formatMonthName } from '../../lib/format'
import { round2 } from '../../lib/number'
import type { SnapshotKind, State } from '../../scripts/types'

export interface SnapshotRowViewModel {
  id: string
  name: string
  opening: number
  calculated: number
  snapshot: number | null
}

export interface SnapshotGroupViewModel {
  kind: SnapshotKind
  title: string
  /** Singular and plural noun for the row count ("1 cuenta", "3 cuentas"). */
  unit: [string, string]
  rows: SnapshotRowViewModel[]
}

export interface WealthMonthViewModel {
  month: Month
  /** "Feb" */
  label: string
  /** "febrero" */
  name: string
  /** A snapshot was saved for the month. */
  saved: boolean
  /** Past or current month; later months of the current year are not yet. */
  available: boolean
}

export interface WealthHistoryRow {
  key: string
  kind: 'group' | 'item' | 'total'
  /** Group the row belongs to; none for the total. */
  group?: SnapshotKind
  label: string
  /** One value per month of `history.months`; debt reads negative. */
  values: number[]
}

export interface WealthViewModel {
  groups: SnapshotGroupViewModel[]
  months: WealthMonthViewModel[]
  history: { months: Month[]; rows: WealthHistoryRow[] }
}

export type SnapshotTotals = Record<SnapshotKind, number> & { net: number }

const GROUPS: Array<{ kind: SnapshotKind; title: string; unit: [string, string] }> = [
  { kind: 'accounts', title: 'Liquidez', unit: ['cuenta', 'cuentas'] },
  { kind: 'investments', title: 'Inversión', unit: ['activo', 'activos'] },
  { kind: 'liabilities', title: 'Deuda', unit: ['pasivo', 'pasivos'] },
]

/** Debt subtracts from the net worth. */
export const GROUP_SIGN: Record<SnapshotKind, 1 | -1> = {
  accounts: 1,
  investments: 1,
  liabilities: -1,
}

export function snapshotKey(kind: SnapshotKind, id: string): string {
  return `${kind}:${id}`
}

/**
 * A snapshot field as typed: empty means "use the calculated balance" (null),
 * Spanish decimals ("1.234,56") or a plain dot decimal; NaN when it is not a
 * number. Rounded to cents.
 */
export function parseSnapshotInput(text: string): number | null {
  let clean = String(text).replace(/[\s€]/g, '')
  if (!clean) return null
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.')
  const value = Number(clean)
  return Number.isFinite(value) ? round2(value) : Number.NaN
}

/** The field text for a stored snapshot value: comma decimals, no thousands dots. */
export function formatSnapshotInput(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',')
}

function visibleMonthLimit(year: number): Month {
  const now = new Date()
  return year === now.getFullYear() ? monthFromDate(now) : 12
}

function hasSnapshot(snapshot: Snapshot | undefined): boolean {
  if (!snapshot) return false
  return GROUPS.some(({ kind }) => Object.keys(snapshot[kind] ?? {}).length > 0)
}

export function buildWealthViewModel(state: State, month: Month): WealthViewModel {
  const accounts = state.accounts as Entity[]
  const investmentAssets = state.investmentAssets as Entity[]
  const liabilities = state.liabilities as Entity[]
  const transactions = state.transactions as Transaction[]
  const snapshots = state.snapshots as Record<string, Snapshot>

  const entities: Record<SnapshotKind, Entity[]> = {
    accounts,
    investments: investmentAssets,
    liabilities,
  }
  const balanceWith = (
    from: Record<string, Snapshot>,
  ): Record<SnapshotKind, (id: string, month: Month) => number> => ({
    accounts: (id, m) => computeAccountBalance(id, m, accounts, transactions, from),
    investments: (id, m) => computeInvestmentValue(id, m, investmentAssets, transactions, from),
    liabilities: (id, m) => computeLiabilityValue(id, m, liabilities, from),
  })
  const balance = balanceWith(snapshots)
  // The calculated balance of the month leaves its own snapshot out: it is what
  // the month reads once that snapshot is removed.
  const otherMonths = { ...snapshots }
  delete otherMonths[String(month)]
  const calculated = balanceWith(otherMonths)

  const groups: SnapshotGroupViewModel[] = GROUPS.map(({ kind, title, unit }) => ({
    kind,
    title,
    unit,
    rows: entities[kind].map((item) => ({
      id: item.id,
      name: item.name,
      opening: round2(item.openingBalance || 0),
      calculated: round2(calculated[kind](item.id, month)),
      snapshot: getSnapshotValue(snapshots, kind, month, item.id),
    })),
  }))

  const limit = visibleMonthLimit(state.year)
  const months: WealthMonthViewModel[] = ALL_MONTHS.map((entryMonth) => {
    const name = formatMonthName(entryMonth)
    return {
      month: entryMonth,
      label: name.slice(0, 3),
      name: name.toLowerCase(),
      saved: hasSnapshot(snapshots[String(entryMonth)]),
      available: entryMonth <= limit,
    }
  })

  const historyMonths = months.filter((entry) => entry.available).map((entry) => entry.month)
  const rows: WealthHistoryRow[] = []
  const total = historyMonths.map(() => 0)
  for (const { kind, title } of GROUPS) {
    const sign = GROUP_SIGN[kind]
    const items = entities[kind].map((item) => ({
      key: snapshotKey(kind, item.id),
      kind: 'item' as const,
      group: kind,
      label: item.name,
      values: historyMonths.map((m) => round2(sign * balance[kind](item.id, m))),
    }))
    const subtotal = historyMonths.map((_, i) =>
      round2(items.reduce((sum, item) => sum + item.values[i], 0)),
    )
    subtotal.forEach((value, i) => (total[i] += value))
    rows.push({ key: kind, kind: 'group', group: kind, label: title, values: subtotal }, ...items)
  }
  rows.push({ key: 'total', kind: 'total', label: 'Total', values: total.map(round2) })

  return { groups, months, history: { months: historyMonths, rows } }
}
