import { formatMoney, formatMonthName, formatWholeAmount } from '../../../lib/format'
import type { Month } from '../../../lib/month'
import { snapshotKey, type WealthViewModel } from '../../../domain/wealth/view-model'
import type { SnapshotKind } from '../../../scripts/types'
import type { AccountFilter } from './wealth-screens'
import { GROUP_TITLE, holdings, monthTable, monthTotals } from './view-model'

// What only the mobile composition of Patrimonio (#436) reads in another
// shape: the cover's accounts as a grid with a filter, and «Cada mes» of
// «Balance por meses». Both are cut from the same shared view-model the
// desktop composition reads.

export const ACCOUNT_FILTERS: { value: AccountFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'accounts', label: GROUP_TITLE.accounts },
  { value: 'investments', label: GROUP_TITLE.investments },
  { value: 'liabilities', label: GROUP_TITLE.liabilities },
]

export interface MobileTile {
  id: string
  kind: SnapshotKind
  name: string
  /** In whole euros: «1.966 €»; debt reads negative. */
  value: string
  /** Nothing in it: the figure goes muted. */
  empty: boolean
  /**
   * What it moved since the month before, «+40 €» or «Sin cambios»; null in the
   * first month. Only a big move takes colour: at least 50 € and 5 % of what it
   * had.
   */
  change: { text: string; tone: 'gain' | 'loss' | 'muted' } | null
  aria: string
}

export interface MobileGroup {
  kind: SnapshotKind
  title: string
  /** The group total in whole euros; debt reads negative. */
  total: string
  tiles: MobileTile[]
}

const LOUD_AMOUNT = 50
const LOUD_SHARE = 0.05

function wholeEuros(amount: number): string {
  return `${amount < 0 ? '−' : ''}${formatWholeAmount(Math.abs(amount))}\u00a0€`
}

function monthChange(before: number | undefined, now: number): MobileTile['change'] {
  if (before === undefined) return null
  const moved = Math.round(now - before)
  if (moved === 0) return { text: 'Sin cambios', tone: 'muted' }
  const loud = Math.abs(moved) >= LOUD_AMOUNT && Math.abs(moved) >= LOUD_SHARE * Math.abs(before)
  return {
    text: `${moved > 0 ? '+' : '−'}${formatWholeAmount(Math.abs(moved))}\u00a0€`,
    tone: loud ? (moved > 0 ? 'gain' : 'loss') : 'muted',
  }
}

/**
 * The cover's accounts as a grid, group by group with its total, or only the
 * group that was picked. A group without accounts is left out. Each tile carries its move since the month before.
 */
export function mobileAccountGroups(
  view: WealthViewModel,
  month: Month,
  filter: AccountFilter,
): MobileGroup[] {
  const index = view.history.months.indexOf(month)
  return holdings(view, month)
    .filter((group) => group.rows.length > 0 && (filter === 'all' || group.kind === filter))
    .map((group) => ({
      kind: group.kind,
      title: group.title,
      total: wholeEuros(group.rows.reduce((sum, row) => sum + row.amount, 0)),
      tiles: group.rows.map((row) => {
        const history = view.history.rows.find(
          (entry) => entry.key === snapshotKey(row.kind, row.id),
        )
        const change =
          index > 0 && history
            ? monthChange(history.values[index - 1], history.values[index])
            : null
        const value = wholeEuros(row.amount)
        return {
          id: row.id,
          kind: row.kind,
          name: row.name,
          value,
          empty: row.empty,
          change,
          aria: `${row.name}: ${value}${change ? `, ${change.text.toLowerCase()} este mes` : ''}. Ver mes a mes`,
        }
      }),
    }))
}

export interface MonthEntry {
  month: Month
  /** «Octubre». */
  label: string
  /** The net worth at its close, to the cent. */
  net: string
  closed: boolean
  /** «Cerrado · Efectivo 46.540 · Inversión 101.780 · Pasivos 0». */
  summary: string
  aria: string
}

/** «Cada mes»: every month of the year so far, the latest first. */
export function monthHistory(view: WealthViewModel): MonthEntry[] {
  return monthTable(view)
    .months.map(({ month, closed }) => {
      const totals = monthTotals(view, month)
      const label = formatMonthName(month)
      const net = formatMoney(totals.net)
      const state = closed ? 'Cerrado' : 'Sin cerrar'
      return {
        month,
        label,
        net,
        closed,
        summary: [
          state,
          `${GROUP_TITLE.accounts} ${formatWholeAmount(totals.accounts)}`,
          `${GROUP_TITLE.investments} ${formatWholeAmount(totals.investments)}`,
          `${GROUP_TITLE.liabilities} ${formatWholeAmount(totals.liabilities)}`,
        ].join(' · '),
        aria: `${label}, ${state.toLowerCase()}: ${net}`,
      }
    })
    .reverse()
}
