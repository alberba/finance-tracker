/**
 * Shared display formatters (es-ES). Every figure the UI prints goes through
 * here, so amounts, percentages and dates read the same on every screen.
 * Pure functions: the currency comes in as an argument, never from a store.
 */

import { monthIndex, type Month } from './month'

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

/**
 * es-ES on its own leaves four-digit figures ungrouped ("1234,50") and signs losses with a
 * hyphen; every formatter here groups thousands and uses the typographic minus instead.
 */
const BASE_OPTIONS: Intl.NumberFormatOptions = { useGrouping: 'always', signDisplay: 'negative' }

const formatters = new Map<string, Intl.NumberFormat | null>()

function cachedFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat | null {
  const key = JSON.stringify(options)
  if (!formatters.has(key)) {
    try {
      formatters.set(key, new Intl.NumberFormat('es-ES', { ...BASE_OPTIONS, ...options }))
    } catch {
      formatters.set(key, null)
    }
  }
  return formatters.get(key) ?? null
}

function withMinus(text: string): string {
  return text.replace('-', MINUS)
}

function toNumber(value: unknown): number {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}

/** "1.234,5" with exactly `digits` decimals; losses carry "−". For counts, NAVs and units. */
export function formatNumber(value: unknown, digits = 0): string {
  const formatter = cachedFormatter({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  const numeric = toNumber(value)
  return formatter ? withMinus(formatter.format(numeric)) : String(numeric)
}

const DECIMAL_STRING = /^-?\d+(?:\.(\d+))?$/

/**
 * A quantity without trailing zeros: "0,00012345", "1.250". A number keeps up to eight
 * decimals; a decimal string (as Bitvavo sends them) keeps every digit it carries, so crypto
 * quantities lose no precision. `minDigits` pads prices and fees to cents ("0,10").
 */
export function formatDecimal(
  value: unknown,
  { minDigits = 0 }: { minDigits?: number } = {},
): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = text.match(DECIMAL_STRING)
  const maxDigits = Math.min(Math.max(match ? (match[1]?.length ?? 0) : 8, minDigits), 100)
  const formatter = cachedFormatter({
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  })
  // Intl formats a numeric string exactly, without going through a float.
  const input = match ? (text as Intl.StringNumericLiteral) : toNumber(value)
  return formatter ? withMinus(formatter.format(input)) : text
}

/** "15.850,00 €", "−1.234,50 €". Falls back to "12,00 XX" when the currency code is not valid. */
export function formatMoney(value: unknown, currency = 'EUR'): string {
  const code = currency.toUpperCase()
  const numeric = toNumber(value)
  const formatter = cachedFormatter({ style: 'currency', currency: code, maximumFractionDigits: 2 })
  return formatter ? withMinus(formatter.format(numeric)) : `${formatNumber(numeric, 2)} ${code}`
}

/** "1,2 mil €", "2,5 M €": chart axes, where the full amount would not fit. */
export function formatCompactMoney(value: unknown, currency = 'EUR'): string {
  const code = currency.toUpperCase()
  const formatter = cachedFormatter({
    style: 'currency',
    currency: code,
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
  return formatter ? withMinus(formatter.format(toNumber(value))) : formatMoney(value, code)
}

/** "18.420": rounded to whole units, thousands always grouped, for dense tables. */
export function formatWholeAmount(value: number): string {
  return formatNumber(Math.round(value))
}

/** A quote price in its own currency, keeping up to six decimals ("58.412,00 €", "0,000123 €"). */
export function formatQuotePrice(value: number, currency: string): string {
  const formatter = cachedFormatter({ style: 'currency', currency, maximumFractionDigits: 6 })
  return formatter ? withMinus(formatter.format(value)) : `${formatNumber(value, 2)} ${currency}`
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
  return `${prefix}${formatNumber(Math.abs(rounded), digits)}${NBSP}%`
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

type StampParts = Record<'day' | 'month' | 'hour' | 'minute', string>

function stampParts(instant: string, timeZone?: string): StampParts | null {
  const date = new Date(instant)
  if (!instant || Number.isNaN(date.getTime())) return null
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
  return {
    day: pad(parts.day),
    month: pad(parts.month),
    hour: pad(parts.hour),
    minute: pad(parts.minute),
  }
}

/** "26/09, 10:42" from an instant (quote timestamps, last sync). */
export function formatStamp(instant: string, timeZone?: string): string {
  const parts = stampParts(instant, timeZone)
  return parts ? `${parts.day}/${parts.month}, ${parts.hour}:${parts.minute}` : MISSING
}

/** "10:42" from an instant, when the day goes without saying. */
export function formatTime(instant: string, timeZone?: string): string {
  const parts = stampParts(instant, timeZone)
  return parts ? `${parts.hour}:${parts.minute}` : MISSING
}

/** "Julio" from a month (1-12); empty when there is no such month. */
export function formatMonthName(month: Month): string {
  const name = MONTH_NAMES[monthIndex(month)]
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : ''
}

/** "Julio 2026" from a month (1-12). */
export function formatMonthYear(month: Month, year: number): string {
  const name = formatMonthName(month)
  return name ? `${name} ${year}` : String(year)
}

/** Short x-axis label: month names shrink to three letters, dates stay whole. */
export function formatAxisLabel(label: string | undefined): string {
  const text = label ?? ''
  return /^\p{L}+$/u.test(text) ? text.slice(0, 3) : text
}
