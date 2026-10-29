/** A report's date range as ISO `YYYY-MM-DD`, both ends included. */
export interface MonthlyReportPeriod {
  from: string
  to: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** The whole calendar month before the one `today` falls in: the period a report opens with. */
export function previousMonthPeriod(today: string): MonthlyReportPeriod {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const first = new Date(Date.UTC(year, month - 2, 1))
  const last = new Date(Date.UTC(year, month - 1, 0))
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

/** Why the period cannot be reported, or null when it can. */
export function periodError(period: MonthlyReportPeriod, today: string): string | null {
  if (!isRealDate(period.from) || !isRealDate(period.to)) return 'Indica las dos fechas.'
  if (period.from > period.to) return 'La fecha «Desde» no puede ser posterior a «Hasta».'
  if (period.to > today) return '«Hasta» no puede ser una fecha futura.'
  return null
}
