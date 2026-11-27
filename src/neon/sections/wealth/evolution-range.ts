import { accountingYear } from '../../../domain/transactions/registry'
import { getWealthByMonth } from '../../../lib/finance-core'
import { ALL_MONTHS, type Month } from '../../../lib/month'
import type { State, Transaction } from '../../../scripts/types'
import type { EvolutionPoint } from './view-model'

// The ranges of «Evolución del patrimonio»: the months it draws, which can go
// back into earlier years (their balances come from their own snapshots and
// movements, as the Dashboard's chart does), and how each range is named.

export type EvolutionRange = '3m' | '6m' | 'ytd' | '1y' | '2y' | '3y' | '5y'

export const EVOLUTION_RANGES: ReadonlyArray<{
  value: EvolutionRange
  short: string
  /** Its name written out, for screen readers. */
  label: string
  /** The change over the range, as its figure is labelled. */
  since: string
  /** How the title names it, after the year for «ytd». */
  title: string
}> = [
  { value: '3m', short: '3M', label: 'Últimos 3 meses', since: 'En 3 meses', title: '3 meses' },
  { value: '6m', short: '6M', label: 'Últimos 6 meses', since: 'En 6 meses', title: '6 meses' },
  { value: 'ytd', short: 'YTD', label: 'En lo que va de año', since: 'Desde enero', title: '' },
  { value: '1y', short: '1Y', label: 'Último año', since: 'En 1 año', title: '1 año' },
  { value: '2y', short: '2Y', label: 'Últimos 2 años', since: 'En 2 años', title: '2 años' },
  { value: '3y', short: '3Y', label: 'Últimos 3 años', since: 'En 3 años', title: '3 años' },
  { value: '5y', short: '5Y', label: 'Últimos 5 años', since: 'En 5 años', title: '5 años' },
]

const MONTHS_IN: Record<Exclude<EvolutionRange, 'ytd'>, number> = {
  '3m': 3,
  '6m': 6,
  '1y': 12,
  '2y': 24,
  '3y': 36,
  '5y': 60,
}

export interface TimelinePoint {
  year: number
  month: Month
  value: number
  /** The month has no balances saved yet. */
  open: boolean
}

/**
 * The net worth month by month: the earlier years with data, from their first
 * month with any, then the current year as its own chart reads it.
 */
export function wealthTimeline(
  state: State,
  current: EvolutionPoint[],
  year: number,
): TimelinePoint[] {
  const years = new Map<number, Transaction[]>()
  for (const tx of state.transactions) {
    const txYear = accountingYear(tx)
    if (txYear === null || txYear >= year) continue
    const list = years.get(txYear)
    if (list) list.push(tx)
    else years.set(txYear, [tx])
  }
  const pastYears = new Set([
    ...years.keys(),
    ...Object.keys(state.historicalSnapshots ?? {})
      .map(Number)
      .filter((past) => past < year),
  ])
  const first = Math.min(year, ...pastYears)

  const past: TimelinePoint[] = []
  for (let pastYear = first; pastYear < year; pastYear++) {
    const transactions = years.get(pastYear) ?? []
    const snapshots = state.historicalSnapshots?.[pastYear] ?? {}
    for (const month of ALL_MONTHS) {
      const { net } = getWealthByMonth(
        month,
        state.accounts,
        state.investmentAssets,
        state.liabilities,
        transactions,
        snapshots,
        state.instruments,
      )
      past.push({ year: pastYear, month, value: net, open: false })
    }
  }
  // Leading empty months say nothing: the line starts with the first balance.
  const start = past.findIndex((point) => Math.abs(point.value) > 0.005)
  return [
    ...(start === -1 ? [] : past.slice(start)),
    ...current.map((point) => ({ year, month: point.month, value: point.value, open: point.open })),
  ]
}

/** How many months of the timeline a range draws, ending at its newest. */
function windowSize(timeline: TimelinePoint[], range: EvolutionRange, year: number): number {
  if (range === 'ytd') return timeline.filter((point) => point.year === year).length
  return MONTHS_IN[range]
}

/** The months a range draws, and the month before them, its starting point. */
export function rangeWindow(
  timeline: TimelinePoint[],
  range: EvolutionRange,
  year: number,
): { points: TimelinePoint[]; base: TimelinePoint | null } {
  const size = Math.min(windowSize(timeline, range, year), timeline.length)
  const from = timeline.length - size
  return { points: timeline.slice(from), base: from > 0 ? timeline[from - 1] : null }
}

/**
 * The ranges worth offering: a longer one only when it draws more months than
 * any before it (the year so far included), so they never repeat the same line.
 * The year so far and three months are always there.
 */
export function availableRanges(timeline: TimelinePoint[], year: number): Set<EvolutionRange> {
  const available = new Set<EvolutionRange>()
  let shown = 0
  for (const { value } of EVOLUTION_RANGES) {
    const size = Math.min(windowSize(timeline, value, year), timeline.length)
    if (value === 'ytd' || value === '3m' || size > shown) available.add(value)
    shown = Math.max(shown, size)
  }
  return available
}
