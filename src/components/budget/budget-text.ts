import { formatMonthName, formatWholeAmount } from '../../lib/format'
import type { BudgetType } from '../../scripts/types'

export const TYPE_LABEL: Record<BudgetType, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
  investment: 'Inversión',
}

/** "Queda por gastar", "Falta por ingresar"… */
export const REMAINING_LABEL: Record<BudgetType, string> = {
  expense: 'Queda por gastar',
  income: 'Falta por ingresar',
  investment: 'Queda por invertir',
}

/** What the figure on top of a year-grid cell is. */
export const PAST_LABEL: Record<BudgetType, string> = {
  expense: 'Gastado',
  income: 'Ingresado',
  investment: 'Invertido',
}

/** "septiembre" from a 0-based month index. */
export function monthName(month: number): string {
  return formatMonthName(month).toLowerCase()
}

/** "Sep" from a 0-based month index. */
export function shortMonth(month: number): string {
  const name = monthName(month)
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1, 3)}` : ''
}

/** "+1.245" / "−320" / "0": a whole deviation, read by its sign. */
export function formatSignedWhole(value: number): string {
  const rounded = Math.round(value)
  return rounded > 0 ? `+${formatWholeAmount(rounded)}` : formatWholeAmount(rounded)
}

/**
 * Until when the accumulated deviation runs: "hasta sep." ("hasta septiembre"
 * with `long`), or none without closed months.
 */
export function deviationSpan(currentMonth: number, { long = false } = {}): string {
  if (currentMonth <= 0) return ''
  if (currentMonth >= 12) return 'en el año'
  const name = monthName(currentMonth - 1)
  return `hasta ${long ? name : `${name.slice(0, 3)}.`}`
}
