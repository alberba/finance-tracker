import type { BudgetRow, BudgetViewModel } from '../../../domain/budget/view-model'
import { formatMoney, formatMonthName, formatSignedMoney } from '../../../lib/format'
import { ALL_MONTHS, asMonth, atMonth, type Month } from '../../../lib/month'
import { round2 } from '../../../lib/number'
import type { Transaction } from '../../../scripts/types'

// «Este mes», the cover of the new Presupuesto (artboard «Presupuesto · 2560 px»,
// #433): what is left of each expense budget this month and at what pace, the
// month's spending day by day against the month before, and one category month
// by month. Pure functions over the shared budget view-model.

/** The month the cover talks about and how far into it we are. */
export interface MonthPosition {
  year: number
  month: Month
  /** Day of the month reached: the last one for a past year, 0 for a future one. */
  day: number
  days: number
}

/** The month in progress of the budget's year, clamped to the year for a past or future one. */
export function monthPosition(view: BudgetViewModel, now: Date): MonthPosition {
  const { year, currentMonth } = view
  const month = asMonth(Math.min(Math.max(currentMonth, 1), 12)) ?? 1
  const days = daysIn(year, month)
  const day = currentMonth > 12 ? days : currentMonth < 1 ? 0 : Math.min(now.getDate(), days)
  return { year, month, day, days }
}

export function daysIn(year: number, month: Month): number {
  return new Date(year, month, 0).getDate()
}

/** «Octubre 2026 · día 10 de 31». */
export function monthKicker(position: MonthPosition): string {
  return `${formatMonthName(position.month)} ${position.year} · día ${position.day} de ${position.days}`
}

export type CategoryStatus = 'over' | 'spent' | 'ahead' | 'slack' | 'on-pace'

export const STATUS_LABEL: Record<CategoryStatus, string> = {
  over: 'Pasado',
  spent: 'Agotado',
  ahead: 'Por encima del ritmo',
  slack: 'Holgado',
  'on-pace': 'A ritmo',
}

/** Statuses that are bad news, painted in --color-loss. */
export function isWarning(status: CategoryStatus): boolean {
  return status === 'over' || status === 'spent' || status === 'ahead'
}

/**
 * How a category is doing: over or out of budget, or its pace against an even
 * spread of the budget over the month (more than 15 % off reads as ahead or slack).
 */
export function categoryStatus(
  plan: number,
  spent: number,
  day: number,
  days: number,
): CategoryStatus {
  const left = plan - spent
  if (left < -0.005) return 'over'
  if (left < 0.005) return 'spent'
  const expected = (plan * day) / days
  const pace = expected > 0 ? spent / expected : 0
  if (pace > 1.15) return 'ahead'
  if (pace < 0.85) return 'slack'
  return 'on-pace'
}

export interface MonthCategory {
  category: string
  plan: number
  spent: number
  /** Budget minus spending; negative once over. */
  left: number
  status: CategoryStatus
  /** Spent share of the budget, capped at 100 (percent). */
  fill: number
  /** Where an even pace would be today (percent of the month). */
  tick: number
}

/** Expense categories with a budget this month, in the order of the categories list. */
export function monthCategories(rows: BudgetRow[], position: MonthPosition): MonthCategory[] {
  return rows.flatMap((row) => {
    const cell = atMonth(row.cells, position.month)
    if (cell.planned <= 0) return []
    const spent = cell.actual ?? 0
    return [
      {
        category: row.category,
        plan: cell.planned,
        spent,
        left: round2(cell.planned - spent),
        status: categoryStatus(cell.planned, spent, position.day, position.days),
        fill: round1(Math.min(spent / cell.planned, 1) * 100),
        tick: round1((position.day / position.days) * 100),
      },
    ]
  })
}

/** Expense categories that have spending this month but no budget. */
export function unbudgetedCategories(rows: BudgetRow[], position: MonthPosition): string[] {
  return rows
    .filter((row) => {
      const cell = atMonth(row.cells, position.month)
      return cell.planned <= 0 && (cell.actual ?? 0) > 0.005
    })
    .map((row) => row.category)
}

export interface MonthHero {
  /** What is still free across the budgets not yet exhausted. */
  free: number
  spent: number
  planned: number
  daysLeft: number
  /** Free money per remaining day and per week; null once the month is over. */
  perDay: number | null
  perWeek: number | null
}

export function monthHero(categories: MonthCategory[], position: MonthPosition): MonthHero {
  const free = round2(categories.reduce((sum, c) => sum + Math.max(c.left, 0), 0))
  const daysLeft = position.days - position.day
  const perDay = daysLeft > 0 ? round2(free / daysLeft) : null
  return {
    free,
    spent: round2(categories.reduce((sum, c) => sum + c.spent, 0)),
    planned: round2(categories.reduce((sum, c) => sum + c.plan, 0)),
    daysLeft,
    perDay,
    perWeek: perDay === null ? null : round2((free / daysLeft) * 7),
  }
}

/** «21 días», «1 día». */
export function daysText(days: number): string {
  return `${days} ${days === 1 ? 'día' : 'días'}`
}

/** Running total of the expenses of a month, one value per day up to `upTo`. */
export function dailyCumulative(
  transactions: readonly Transaction[],
  year: number,
  month: Month,
  upTo: number,
): number[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const daily = Array<number>(upTo).fill(0)
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date?.startsWith(prefix)) continue
    const day = Number(tx.date.slice(8, 10))
    if (day >= 1 && day <= upTo) daily[day - 1] += Number(tx.amount) || 0
  }
  let total = 0
  return daily.map((value) => (total = round2(total + value)))
}

export interface ChartPoint {
  /** 0–300 across the month, 0–100 down the height (SVG viewBox 300×100). */
  x: number
  y: number
}

export interface SpendChart {
  monthName: string
  total: number
  /** The month before, when there is one in the year. */
  previous: { name: string; atDay: number; total: number; points: ChartPoint[] } | null
  points: ChartPoint[]
  /** Spending minus the month before's at the same day; null without a month before. */
  delta: number | null
  /** Today across the month (percent) and each line's height there (percent). */
  todayLeft: number
  todayBottom: number
  previousBottom: number | null
  ticks: { day: number; left: number; today: boolean }[]
}

export function spendChart(
  transactions: readonly Transaction[],
  position: MonthPosition,
): SpendChart {
  const { year, month, day, days } = position
  const current = dailyCumulative(transactions, year, month, day)
  const before = month > 1 ? asMonth(month - 1) : null
  const beforeDays = before ? daysIn(year, before) : 0
  const previous = before ? dailyCumulative(transactions, year, before, beforeDays) : []
  const total = current.at(-1) ?? 0
  const previousAtDay = previous.length ? (previous[Math.min(day, beforeDays) - 1] ?? 0) : 0
  // One scale for both months, so the longer one still fits.
  const span = Math.max(days, beforeDays) - 1 || 1
  const yMax = Math.max(previous.at(-1) ?? 0, total, 1) * 1.08
  const point = (value: number, index: number): ChartPoint => ({
    x: round2((index / span) * 300),
    y: round2(100 - (value / yMax) * 100),
  })
  const pct = (value: number) => round2((value / yMax) * 100)
  const todayLeft = round2((Math.max(day - 1, 0) / span) * 100)
  return {
    monthName: formatMonthName(month).toLowerCase(),
    total,
    previous: before
      ? {
          name: formatMonthName(before).toLowerCase(),
          atDay: previousAtDay,
          total: previous.at(-1) ?? 0,
          points: previous.map(point),
        }
      : null,
    points: current.map(point),
    delta: before && day > 0 ? round2(total - previousAtDay) : null,
    todayLeft,
    todayBottom: pct(total),
    previousBottom: before && day > 0 ? pct(previousAtDay) : null,
    ticks: [1, 10, 20, 30]
      .filter((tick) => tick <= days)
      .map((tick) => ({ day: tick, left: round2(((tick - 1) / span) * 100), today: tick === day })),
  }
}

/** «+120,35 € más que septiembre a día 10». */
export function deltaText(delta: number, previousName: string, day: number): string {
  if (Math.abs(delta) < 0.005) return `Lo mismo que ${previousName} a día ${day}`
  return `${formatSignedMoney(delta)} ${delta > 0 ? 'más' : 'menos'} que ${previousName} a día ${day}`
}

export function chartLabel(chart: SpendChart, day: number): string {
  const now = `${chart.monthName} ${formatMoney(chart.total)} a día ${day}`
  if (!chart.previous) return `Gasto acumulado día a día: ${now}`
  return (
    `Gasto acumulado día a día: ${now}, ${chart.previous.name} ` +
    `${formatMoney(chart.previous.atDay)} a la misma fecha y ${formatMoney(chart.previous.total)} en total`
  )
}

export function polyline(points: ChartPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}

/** The card's accessible name: «Súper: 185,20 € libres. Ver mes a mes». */
export function categoryAria(category: MonthCategory): string {
  const left =
    category.left < 0
      ? `${formatMoney(-category.left)} por encima`
      : `${formatMoney(category.left)} libres`
  return `${category.category}: ${left}. Ver mes a mes`
}

// ---- One category, month by month ---------------------------------------

export interface DetailBar {
  month: Month
  /** Height as a percent of the chart; 0 for a month still to come. */
  height: number
  kind: 'over' | 'current' | 'normal' | 'empty'
}

export interface DetailRow {
  month: Month
  name: string
  sub: string
  value: number
  dev: string
  over: boolean
}

export interface CategoryDetail {
  category: string
  /** The current month's budget, drawn as the dashed line. */
  plan: number
  planLine: number
  average: number | null
  closedCount: number
  overCount: number
  yearToDate: number
  reading: string
  bars: DetailBar[]
  rows: DetailRow[]
}

export function categoryDetail(row: BudgetRow, position: MonthPosition): CategoryDetail {
  const plan = atMonth(row.cells, position.month).planned
  const closed = row.cells.filter((cell) => cell.status === 'closed')
  const overCount = closed.filter((cell) => (cell.actual ?? 0) > cell.planned + 0.005).length
  const closedTotal = closed.reduce((sum, cell) => sum + (cell.actual ?? 0), 0)
  const shown = row.cells.filter((cell) => cell.actual !== null)
  const yearToDate = round2(shown.reduce((sum, cell) => sum + (cell.actual ?? 0), 0))
  const max =
    Math.max(plan, ...shown.map((cell) => cell.actual ?? 0), ...closed.map((c) => c.planned), 1) *
    1.1
  const pct = (value: number) => round1((value / max) * 100)
  return {
    category: row.category,
    plan,
    planLine: pct(plan),
    average: closed.length ? round2(closedTotal / closed.length) : null,
    closedCount: closed.length,
    overCount,
    yearToDate,
    reading: detailReading(overCount, closed.length),
    bars: ALL_MONTHS.map((month) => {
      const cell = atMonth(row.cells, month)
      if (cell.actual === null) return { month, height: 0, kind: 'empty' }
      const kind =
        cell.status === 'current'
          ? 'current'
          : cell.actual > cell.planned + 0.005
            ? 'over'
            : 'normal'
      return { month, height: pct(cell.actual), kind }
    }),
    rows: shown
      .map((cell): DetailRow => {
        const value = cell.actual ?? 0
        const current = cell.status === 'current'
        const diff = round2(value - cell.planned)
        return {
          month: cell.month,
          name: formatMonthName(cell.month),
          sub: current
            ? `en curso · día ${position.day} de ${position.days}`
            : `de ${formatMoney(cell.planned)}`,
          value,
          dev: current
            ? diff > 0.005
              ? `${formatMoney(diff)} por encima`
              : `quedan ${formatMoney(-diff)}`
            : Math.abs(diff) < 0.005
              ? 'justo'
              : diff > 0
                ? `+${formatMoney(diff)} de más`
                : `${formatMoney(-diff)} por debajo`,
          over: !current && diff > 0.005,
        }
      })
      .reverse(),
  }
}

export function detailReading(over: number, closed: number): string {
  if (!closed) return ''
  if (over === 0) return 'No se ha pasado ningún mes.'
  if (over === 1) return 'Se pasó un mes.'
  return `Se pasó ${over} de ${closed} meses; quizá el presupuesto se queda corto.`
}

/** «Media ene–sep»: the closed months the average spans. */
export function averageLabel(closedCount: number): string {
  if (closedCount <= 1) return closedCount ? 'Media de enero' : 'Media'
  const last = asMonth(closedCount) ?? 12
  return `Media ene–${formatMonthName(last).slice(0, 3).toLowerCase()}`
}

/** «E», «F»… under the bars. */
export const MONTH_INITIALS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
