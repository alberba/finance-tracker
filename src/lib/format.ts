/**
 * Shared display formatters (es-ES). Every figure the UI prints goes through
 * here, so amounts, percentages and dates read the same on every screen.
 * Pure functions: the currency comes in as an argument, never from a store.
 */

/** Typographic minus sign, used for losses instead of the hyphen. */
export const MINUS = '−'
const NBSP = ' '
const MISSING = '—'

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const moneyFormatters = new Map<string, Intl.NumberFormat | null>()

function moneyFormatter(currency: string): Intl.NumberFormat | null {
  if (!moneyFormatters.has(currency)) {
    try {
      moneyFormatters.set(
        currency,
        new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 2 }),
      )
    } catch {
      moneyFormatters.set(currency, null)
    }
  }
  return moneyFormatters.get(currency) ?? null
}

function toNumber(value: unknown): number {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}

/** "15.850,00 €". Falls back to "12.00 XX" when the currency code is not valid. */
export function formatMoney(value: unknown, currency = 'EUR'): string {
  const code = currency.toUpperCase()
  const numeric = toNumber(value)
  const formatter = moneyFormatter(code)
  return formatter ? formatter.format(numeric) : `${numeric.toFixed(2)} ${code}`
}

/** A quote price in its own currency, keeping up to six decimals ("58.412,00 €", "0,000123 €"). */
export function formatQuotePrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      maximumFractionDigits: 6,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function sign(value: number): string {
  if (value > 0) return '+'
  if (value < 0) return MINUS
  return ''
}

/** "+374,59 €" / "−12,00 €": gains and losses read by sign, not only by color. */
export function formatSignedMoney(value: unknown, currency = 'EUR'): string {
  const numeric = Math.round(toNumber(value) * 100) / 100
  return `${sign(numeric)}${formatMoney(Math.abs(numeric), currency)}`
}

/** "3,50 %"; with `signed`, "+3,50 %" / "−1,20 %". Losses always carry the minus. */
export function formatPercent(
  value: unknown,
  { digits = 2, signed = false }: { digits?: number; signed?: boolean } = {},
): string {
  const factor = 10 ** digits
  const rounded = Math.round(toNumber(value) * factor) / factor
  const prefix = rounded < 0 || signed ? sign(rounded) : ''
  return `${prefix}${Math.abs(rounded).toFixed(digits).replace('.', ',')}${NBSP}%`
}

/** Splits a formatted amount into its whole part and the rest ("11.062" + ",68 €"). */
export function splitDecimals(formatted: string): { whole: string; rest: string } {
  const match = formatted.match(/^(.*?)(,\d+.*)$/)
  return match ? { whole: match[1], rest: match[2] } : { whole: formatted, rest: '' }
}

function parseIsoDate(value: string): Date | null {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

const shortDate = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const dayMonth = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const longDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' })

const weekdayDate = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** "15 jul 2026" from an ISO date. */
export function formatShortDate(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  return date ? shortDate.format(date) : MISSING
}

/** "27 sept" from an ISO date, for rows already grouped by month or year. */
export function formatDayMonth(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  return date ? dayMonth.format(date) : MISSING
}

/** "31 de julio de 2026" from an ISO date. */
export function formatLongDate(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  return date ? longDate.format(date) : MISSING
}

/** "Lunes, 28 de septiembre" from an ISO date. */
export function formatWeekdayDate(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return MISSING
  const text = weekdayDate.format(date)
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

/** "Vence hoy", "En 4 días", "Hace 8 días": how far a due date is from `today` (both ISO). */
export function formatDueLabel(isoDate: string, today: string): string {
  const date = parseIsoDate(isoDate)
  const from = parseIsoDate(today)
  if (!date || !from) return ''
  const days = Math.round((date.getTime() - from.getTime()) / 86_400_000)
  if (days === 0) return 'Vence hoy'
  if (days === 1) return 'Vence mañana'
  if (days === -1) return 'Hace 1 día'
  return days < 0 ? `Hace ${-days} días` : `En ${days} días`
}

/** "26/09, 10:42" from an instant (quote timestamps, last sync). */
export function formatStamp(instant: string, timeZone?: string): string {
  const date = new Date(instant)
  if (!instant || Number.isNaN(date.getTime())) return MISSING
  // Assembled from parts: ICU drops the month's leading zero in this pattern.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const pad = (value: string | undefined) => String(value ?? '').padStart(2, '0')
  return `${pad(parts.day)}/${pad(parts.month)}, ${pad(parts.hour)}:${pad(parts.minute)}`
}

/** "Julio" from a 0-based month index; empty when there is no such month. */
export function formatMonthName(month: number): string {
  const name = MONTH_NAMES[month]
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : ''
}

/** "Julio 2026" from a 0-based month index. */
export function formatMonthYear(month: number, year: number): string {
  const name = formatMonthName(month)
  return name ? `${name} ${year}` : String(year)
}

/** Short x-axis label: month names shrink to three letters, dates stay whole. */
export function formatAxisLabel(label: string | undefined): string {
  const text = label ?? ''
  return /^\p{L}+$/u.test(text) ? text.slice(0, 3) : text
}
