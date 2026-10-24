import type { SegmentedOption } from '../ui/SegmentedControl.vue'
import type { TransactionType } from '../../scripts/types'

export const TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  saving: 'Ahorro',
  investment: 'Inversión',
}

/** The movement types in the order the panels and the bulk bar offer them. */
export const TYPE_OPTIONS: SegmentedOption<TransactionType>[] = (
  ['expense', 'income', 'saving', 'investment'] as const
).map((value) => ({ value, label: TYPE_LABEL[value] }))

/**
 * Category names as select options, keeping the one already chosen when it is
 * no longer in the list (a renamed or deleted category on an old movement).
 */
export function categorySelectOptions(names: string[], current: string) {
  const list = current && !names.includes(current) ? [current, ...names] : names
  return list.map((name) => ({ value: name, label: name }))
}

/** Plural, for filters and breakdowns ("Gastos"). */
export const TYPE_PLURAL: Record<TransactionType, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
  saving: 'Ahorros',
  investment: 'Inversión',
}

/** Tag of a row's type: a soft fill of its hue with AA text. */
export const TYPE_TAG: Record<TransactionType, string> = {
  expense: 'bg-expense/12 text-loss',
  income: 'bg-income/12 text-gain',
  saving: 'bg-saving/12 text-saving',
  investment: 'bg-invest/12 text-invest',
}

/** Dot color of each type; a token reference used as a data value. */
export const TYPE_DOT: Record<TransactionType, string> = {
  expense: 'var(--expense)',
  income: 'var(--income)',
  saving: 'var(--saving)',
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
