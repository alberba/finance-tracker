import type { SegmentedOption } from '../ui/SegmentedControl.vue'
import type { TransactionType } from '../../scripts/types'

/** Order and names of the three movement types, as the panel and filters show them. */
export const TYPE_OPTIONS: SegmentedOption<TransactionType>[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'investment', label: 'Inversión' },
]

export const TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  investment: 'Inversión',
}

/** Plural, for filters and breakdowns ("Gastos"). */
export const TYPE_PLURAL: Record<TransactionType, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
  investment: 'Inversión',
}

/** Tag of a row's type: a soft fill of its hue with AA text. */
export const TYPE_TAG: Record<TransactionType, string> = {
  expense: 'bg-expense/12 text-loss',
  income: 'bg-income/12 text-gain',
  investment: 'bg-invest/12 text-invest',
}

/** Dot color of each type; a token reference used as a data value. */
export const TYPE_DOT: Record<TransactionType, string> = {
  expense: 'var(--expense)',
  income: 'var(--income)',
  investment: 'var(--invest)',
}

const SERIES = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
  'var(--chart-series-6)',
  'var(--chart-series-7)',
  'var(--chart-series-8)',
  'var(--chart-series-9)',
  'var(--chart-series-10)',
]

/** One of the chart series colors, cycling; a token reference used as a data value. */
export function seriesColor(index: number): string {
  return SERIES[Math.max(index, 0) % SERIES.length]
}
