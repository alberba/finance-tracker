import { formatMoney, formatMonthName, formatWholeAmount } from '../../../lib/format'
import type { Month } from '../../../lib/month'
import type { WealthViewModel } from '../../../domain/wealth/view-model'
import type { SnapshotKind } from '../../../scripts/types'
import type { AccountFilter } from './wealth-screens'
import { GROUP_TITLE, holdings, monthTable, monthTotals } from './view-model'

// What only the mobile composition of Patrimonio (#436) reads in another
// shape: the cover's accounts as one list with a filter, and «Cada mes» of
// «Balance por meses». Both are cut from the same shared view-model the
// desktop composition reads.

export const ACCOUNT_FILTERS: { value: AccountFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'accounts', label: GROUP_TITLE.accounts },
  { value: 'investments', label: GROUP_TITLE.investments },
  { value: 'liabilities', label: GROUP_TITLE.liabilities },
]

export interface MobileAccount {
  id: string
  kind: SnapshotKind
  name: string
  /** The first letter, in the circle before the name. */
  initial: string
  /** «Efectivo · 28 %»: its group and what it weighs in it. */
  note: string
  /** In whole euros, as the artboard writes the list: «1.966 €». */
  value: string
  /** Nothing in it: the figure goes muted. */
  empty: boolean
}

/** «Cuentas» of the cover: every account, asset and debt, or those of one group. */
export function mobileAccounts(
  view: WealthViewModel,
  month: Month,
  filter: AccountFilter,
): MobileAccount[] {
  return holdings(view, month)
    .filter((group) => filter === 'all' || group.kind === filter)
    .flatMap((group) =>
      group.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        initial: row.name.trim().charAt(0).toUpperCase(),
        note: `${group.title} · ${row.share}`,
        value: `${row.amount < 0 ? '−' : ''}${formatWholeAmount(Math.abs(row.amount))}\u00a0€`,
        empty: row.empty,
      })),
    )
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
