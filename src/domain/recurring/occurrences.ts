import type { RecurringFrequency, RecurringRule } from '../../scripts/types'

const MAX_OCCURRENCES_PER_RULE = 3660

export function todayISO(date = new Date()): string {
  return formatDate(date)
}

export function buildOccurrenceKey(ruleId: string, occurrenceDate: string): string {
  return `${ruleId}:${occurrenceDate}`
}

export function nextOccurrenceDate(
  rule: Pick<RecurringRule, 'frequency' | 'interval' | 'startDate'>,
  occurrenceDate: string,
): string {
  const date = parseDate(occurrenceDate)
  const interval = Math.max(1, Math.floor(rule.interval || 1))
  // Monthly/yearly rules keep the day of `startDate` as their anchor. Deriving
  // it from the previous occurrence would turn 31 Jan into 28 Feb and then keep
  // 28 Mar instead of returning to 31 Mar.
  const anchorDay = isValidDate(rule.startDate) ? parseDate(rule.startDate).getUTCDate() : undefined

  switch (rule.frequency) {
    case 'daily':
      return formatDate(addDays(date, interval))
    case 'weekly':
      return formatDate(addDays(date, interval * 7))
    case 'monthly':
      return formatDate(addMonths(date, interval, anchorDay))
    case 'monthEnd':
      return formatDate(lastDayOfMonth(addMonths(date, interval)))
    case 'yearly':
      return formatDate(addYears(date, interval, anchorDay))
  }
}

export function getDueOccurrences(rule: RecurringRule, today: string): string[] {
  if (!rule.active || !isValidDate(rule.startDate)) return []

  const lastProcessedDate = rule.lastExecutionDate || null
  let occurrenceDate = normalizeFirstOccurrenceDate(rule, rule.nextOccurrenceDate || rule.startDate)
  // Editing a rule can leave an old `nextOccurrenceDate` before the new
  // `startDate`; never generate occurrences before the rule starts.
  if (occurrenceDate < rule.startDate) {
    occurrenceDate = normalizeFirstOccurrenceDate(rule, rule.startDate)
  }
  if (lastProcessedDate && occurrenceDate <= lastProcessedDate) {
    occurrenceDate = nextOccurrenceDate(rule, lastProcessedDate)
  }

  const due: string[] = []
  const safeToday = formatDate(parseDate(today))
  while (occurrenceDate <= safeToday && due.length < MAX_OCCURRENCES_PER_RULE) {
    if (!rule.endDate || occurrenceDate <= rule.endDate) {
      due.push(occurrenceDate)
    }
    const next = nextOccurrenceDate(rule, occurrenceDate)
    if (next <= occurrenceDate) break
    occurrenceDate = next
  }

  return due
}

export function getNextRuleDate(rule: RecurringRule, today: string): string | null {
  const due = getDueOccurrences(rule, today)
  if (due.length > 0) {
    return nextOccurrenceDate(rule, due[due.length - 1])
  }

  const candidate = normalizeFirstOccurrenceDate(
    rule,
    rule.nextOccurrenceDate && rule.nextOccurrenceDate >= rule.startDate
      ? rule.nextOccurrenceDate
      : rule.startDate,
  )
  if (rule.endDate && candidate > rule.endDate) return null
  return candidate > today ? candidate : nextOccurrenceDate(rule, today)
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

function parseDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? new Date('2000-01-01T00:00:00Z') : parsed
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function addMonths(date: Date, months: number, anchorDay = date.getUTCDate()): Date {
  const targetMonth = date.getUTCMonth() + months
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(anchorDay, lastDay)))
}

function addYears(date: Date, years: number, anchorDay = date.getUTCDate()): Date {
  const year = date.getUTCFullYear() + years
  const month = date.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)))
}

function lastDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function normalizeFirstOccurrenceDate(rule: RecurringRule, date: string): string {
  if (rule.frequency !== 'monthEnd') return date
  return formatDate(lastDayOfMonth(parseDate(date)))
}

/** "Cada 3 meses": the unit of a frequency with an interval above one. */
const INTERVAL_UNIT: Record<RecurringFrequency, string> = {
  daily: 'días',
  weekly: 'semanas',
  monthly: 'meses',
  monthEnd: 'fines de mes',
  yearly: 'años',
}

/** A rule's frequency with its interval: "Mensual", "Cada 2 meses". */
export function frequencyText(rule: { frequency: RecurringFrequency; interval?: number }): string {
  const interval = Math.max(1, Math.floor(rule.interval || 1))
  return interval === 1
    ? frequencyLabel(rule.frequency)
    : `Cada ${interval} ${INTERVAL_UNIT[rule.frequency]}`
}

export function frequencyLabel(frequency: RecurringFrequency): string {
  return {
    daily: 'Diaria',
    weekly: 'Semanal',
    monthly: 'Mensual',
    monthEnd: 'Fin de mes',
    yearly: 'Anual',
  }[frequency]
}
