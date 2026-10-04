import type { Tone } from '../../components/ui/tone'
import { decorateCategoryLabel } from '../../scripts/category-emoji'
import { MONTHS, type BudgetType, type State } from '../../scripts/types'
import { round2 } from '../../scripts/utils'
import { getCategoriesForType } from '../transactions/categories'

/** How many months the table shows at once. */
export type BudgetRange = 3 | 6 | 12

/** A closed month is judged; the current one is under way; a planned one has not started. */
export type BudgetMonthStatus = 'closed' | 'current' | 'planned'

export interface BudgetCell {
  month: number
  status: BudgetMonthStatus
  planned: number
  /** What was recorded; null for a month still to come. */
  actual: number | null
  /** Actual minus planned, only once the month is closed. */
  diff: number | null
  /** Whether the deviation is good or bad news; null when there is none to judge. */
  tone: Tone | null
}

export interface BudgetLine {
  cells: BudgetCell[]
  plannedTotal: number
  actualTotal: number
  /** Deviation accumulated over the closed months. */
  diffToDate: number
  tone: Tone | null
}

export interface BudgetRow extends BudgetLine {
  category: string
  label: string
}

export interface BudgetTypeViewModel {
  type: BudgetType
  count: number
  rows: BudgetRow[]
  totals: BudgetLine
  /** What is left to spend, earn or invest until December. */
  remaining: number
}

export interface BudgetViewModel {
  year: number
  /** Index of the month in progress: 12 for a past year, -1 for a future one. */
  currentMonth: number
  types: Record<BudgetType, BudgetTypeViewModel>
}

export const BUDGET_TYPES: BudgetType[] = ['expense', 'income', 'investment']

function currentMonthOf(year: number, now: Date): number {
  if (year < now.getFullYear()) return MONTHS.length
  if (year > now.getFullYear()) return -1
  return now.getMonth()
}

export function statusOf(month: number, current: number): BudgetMonthStatus {
  if (month < current) return 'closed'
  return month === current ? 'current' : 'planned'
}

/** Overspending is bad news for expenses and investment; falling short, for income. */
export function toneOf(type: BudgetType, diff: number): Tone | null {
  if (Math.abs(diff) < 0.005) return null
  const over = diff > 0
  return over === (type === 'income') ? 'gain' : 'loss'
}

function monthlyActuals(state: State, type: BudgetType): Map<string, number[]> {
  const actuals = new Map<string, number[]>()
  for (const transaction of state.transactions) {
    if (transaction.type !== type) continue
    const month = Number(transaction.month)
    if (!(month >= 0 && month < MONTHS.length)) continue
    const row = actuals.get(transaction.category) ?? Array<number>(MONTHS.length).fill(0)
    row[month] += Number(transaction.amount || 0)
    actuals.set(transaction.category, row)
  }
  return actuals
}

function buildLine(
  type: BudgetType,
  current: number,
  planned: number[],
  actual: number[],
): BudgetLine {
  const cells = MONTHS.map((_, month): BudgetCell => {
    const status = statusOf(month, current)
    const diff = status === 'closed' ? round2(actual[month] - planned[month]) : null
    return {
      month,
      status,
      planned: round2(planned[month]),
      actual: status === 'planned' ? null : round2(actual[month]),
      diff,
      tone: diff === null ? null : toneOf(type, diff),
    }
  })
  const diffToDate = round2(cells.reduce((total, cell) => total + (cell.diff ?? 0), 0))
  return {
    cells,
    plannedTotal: round2(planned.reduce((total, value) => total + value, 0)),
    actualTotal: round2(cells.reduce((total, cell) => total + (cell.actual ?? 0), 0)),
    diffToDate,
    tone: toneOf(type, diffToDate),
  }
}

function buildType(state: State, type: BudgetType, current: number): BudgetTypeViewModel {
  const actuals = monthlyActuals(state, type)
  const empty = Array<number>(MONTHS.length).fill(0)
  const rows = getCategoriesForType(state, type).map((category): BudgetRow => {
    const planned = MONTHS.map((_, month) => Number(state.budget[type]?.[category]?.[month] || 0))
    return {
      category,
      label: decorateCategoryLabel(type, category, state.categoryEmojis),
      ...buildLine(type, current, planned, actuals.get(category) ?? empty),
    }
  })
  const sum = (pick: (cell: BudgetCell) => number) =>
    MONTHS.map((_, month) => rows.reduce((total, row) => total + pick(row.cells[month]), 0))
  const totals = buildLine(
    type,
    current,
    sum((cell) => cell.planned),
    sum((cell) => cell.actual ?? 0),
  )
  return {
    type,
    count: rows.length,
    rows,
    totals,
    remaining: round2(Math.max(0, totals.plannedTotal - totals.actualTotal)),
  }
}

export function buildBudgetViewModel(state: State, now = new Date()): BudgetViewModel {
  const currentMonth = currentMonthOf(Number(state.year), now)
  return {
    year: Number(state.year),
    currentMonth,
    types: {
      expense: buildType(state, 'expense', currentMonth),
      income: buildType(state, 'income', currentMonth),
      investment: buildType(state, 'investment', currentMonth),
    },
  }
}

/** First month of a window: the month before the current one, the current one and what follows. */
export function defaultWindowStart(range: BudgetRange, currentMonth: number): number {
  return clampStart(currentMonth + 2 - range, range)
}

/** Slides the window a whole range back (-1) or forward (1), inside the year. */
export function moveWindow(start: number, range: BudgetRange, direction: -1 | 1): number {
  return clampStart(start + direction * range, range)
}

function clampStart(start: number, range: BudgetRange): number {
  return Math.max(0, Math.min(MONTHS.length - range, start))
}

/**
 * A compliance bar as percentages of the row scale (the largest amount in the
 * visible window): what is within the budget, the excess and where the budget sits.
 */
export function cellBar(
  cell: Pick<BudgetCell, 'planned' | 'actual'>,
  scale: number,
): { fill: number; over: number; plan: number } {
  if (scale <= 0) return { fill: 0, over: 0, plan: 0 }
  const pct = (value: number) => Math.round((value / scale) * 1000) / 10
  const actual = cell.actual ?? 0
  return {
    fill: pct(Math.min(actual, cell.planned)),
    over: pct(Math.max(0, actual - cell.planned)),
    plan: pct(cell.planned),
  }
}
