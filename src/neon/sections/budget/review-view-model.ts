import type { BudgetRow, BudgetViewModel } from '../../../domain/budget/view-model'
import { formatMoney, formatMonthName, formatNumber } from '../../../lib/format'
import { asMonth, atMonth, monthIndex, type Month } from '../../../lib/month'
import { parseDecimal, round2 } from '../../../lib/number'

// «Revisar {mes}», the month close review of the new Presupuesto (artboard
// «Presupuesto · 2560 px», #433): how each expense category did in the month
// that just closed, a suggestion for its budget and the changes to apply from
// the current month through December. Pure functions over the budget view-model.

/** The month under review and the months its changes would apply to. */
export interface ReviewPosition {
  year: number
  closed: Month
  /** First month the changes apply to; null when there is none left (a past year). */
  applyFrom: Month | null
}

/** The month that just closed; null when none has closed yet or the year is still to come. */
export function reviewPosition(view: BudgetViewModel): ReviewPosition | null {
  const { year, currentMonth } = view
  if (currentMonth > 12) return { year, closed: 12, applyFrom: null }
  if (currentMonth < 2) return null
  const closed = asMonth(currentMonth - 1)
  return closed ? { year, closed, applyFrom: asMonth(currentMonth) } : null
}

/** «octubre–diciembre», or «diciembre» when it is the last month. */
export function applyRange(from: Month): string {
  const start = formatMonthName(from).toLowerCase()
  return from === 12 ? start : `${start}–diciembre`
}

/** «octubre a diciembre», for running text. */
export function applyRangeProse(from: Month): string {
  const start = formatMonthName(from).toLowerCase()
  return from === 12 ? start : `${start} a diciembre`
}

export type DecisionMode = 'keep' | 'up' | 'down'

export const DECISION_OPTIONS: { mode: DecisionMode; label: string }[] = [
  { mode: 'keep', label: 'Mantener' },
  { mode: 'up', label: 'Subir' },
  { mode: 'down', label: 'Bajar' },
]

/** One user decision: the mode and the amount text being typed. */
export interface Decision {
  mode: DecisionMode
  draft: string
}

export interface Suggestion {
  mode: DecisionMode
  /** The amount suggested for «up» and «down»; the plan for «keep». */
  amount: number
  text: string
}

export interface ReviewBar {
  month: Month
  /** Percent of the chart height. */
  height: number
  kind: 'over' | 'closed' | 'normal'
}

export interface ReviewCategory {
  category: string
  plan: number
  actual: number
  /** Actual minus plan in the closed month. */
  diff: number
  deviation: string
  overBudget: boolean
  bars: ReviewBar[]
  planLine: number
  insight: string
  average: number
  step: number
  suggestion: Suggestion
  /** The amounts «Subir» and «Bajar» start at. */
  defaultUp: number
  defaultDown: number
}

/** Rounding step of the amounts: 5 for small budgets, 10 for the rest. */
export function amountStep(plan: number): number {
  return plan < 100 ? 5 : 10
}

function ceilToStep(value: number, step: number): number {
  return Math.ceil(round2(value) / step - 1e-9) * step
}

function whole(value: number): string {
  return `${formatNumber(Math.round(value))} €`
}

/** Compares the average of the closed months with the budget and says what to do. */
export function suggest(plan: number, average: number, overCount: number): Suggestion {
  const step = amountStep(plan)
  if (average > plan * 1.05) {
    const amount = ceilToStep(average, step)
    return {
      mode: 'up',
      amount,
      text: `Sugerencia: subir a ${whole(amount)}. Tu media (${whole(average)}) supera el presupuesto.`,
    }
  }
  if (average < plan * 0.8) {
    const amount = Math.max(ceilToStep(average, step), 0)
    return {
      mode: 'down',
      amount,
      text: `Sugerencia: bajar a ${whole(amount)}. Tu media (${whole(average)}) queda muy por debajo.`,
    }
  }
  return {
    mode: 'keep',
    amount: plan,
    text:
      overCount > 0
        ? 'Sugerencia: mantener. Te pasas a veces, pero la media cae dentro del presupuesto.'
        : 'Sugerencia: mantener. Tu media cae dentro del presupuesto.',
  }
}

export function deviationText(diff: number): string {
  if (diff > 0.005) return `+${formatMoney(diff)} de más`
  if (diff < -0.005) return `${formatMoney(-diff)} de sobra`
  return 'Justo en el presupuesto'
}

export function insightText(overCount: number, months: number, average: number): string {
  return overCount === 0
    ? `Ningún mes por encima del presupuesto. Media: ${whole(average)}.`
    : `Por encima ${overCount} de ${months} meses. Media: ${whole(average)}.`
}

/** Expense categories with a budget in the closed month, in the order of the categories list. */
export function reviewCategories(rows: BudgetRow[], position: ReviewPosition): ReviewCategory[] {
  const { closed } = position
  return rows.flatMap((row) => {
    const cell = atMonth(row.cells, closed)
    if (cell.planned <= 0) return []
    const months = row.cells.slice(0, monthIndex(closed) + 1)
    const actuals = months.map((c) => c.actual ?? 0)
    const overCount = months.filter((c) => (c.actual ?? 0) > c.planned + 0.005).length
    const average = round2(actuals.reduce((sum, v) => sum + v, 0) / months.length)
    const plan = cell.planned
    const actual = cell.actual ?? 0
    const diff = round2(actual - plan)
    const step = amountStep(plan)
    const suggestion = suggest(plan, average, overCount)
    const max = Math.max(plan, ...actuals, ...months.map((c) => c.planned)) * 1.08
    const pct = (value: number) => Math.round((value / max) * 1000) / 10
    return [
      {
        category: row.category,
        plan,
        actual,
        diff,
        deviation: deviationText(diff),
        overBudget: diff > 0.005,
        bars: months.map((c): ReviewBar => {
          const value = c.actual ?? 0
          return {
            month: c.month,
            height: pct(value),
            kind: value > c.planned + 0.005 ? 'over' : c.month === closed ? 'closed' : 'normal',
          }
        }),
        planLine: pct(plan),
        insight: insightText(overCount, months.length, average),
        average,
        step,
        suggestion,
        defaultUp: suggestion.mode === 'up' ? suggestion.amount : plan + step * 2,
        defaultDown: suggestion.mode === 'down' ? suggestion.amount : Math.max(plan - step * 2, 0),
      },
    ]
  })
}

/** The amount a decision settles on: the typed one when it is valid, else the default. */
export function decisionAmount(category: ReviewCategory, decision: Decision | undefined): number {
  if (!decision || decision.mode === 'keep') return category.plan
  const typed = parseDecimal(decision.draft)
  if (Number.isFinite(typed) && typed >= 0) return round2(typed)
  return decision.mode === 'up' ? category.defaultUp : category.defaultDown
}

/** The text a new decision starts with in the amount field. */
export function defaultDraft(category: ReviewCategory, mode: DecisionMode): string {
  const amount =
    mode === 'up' ? category.defaultUp : mode === 'down' ? category.defaultDown : category.plan
  return String(round2(amount)).replace('.', ',')
}

export interface ReviewChange {
  category: string
  before: number
  after: number
  text: string
}

export function reviewChanges(
  categories: ReviewCategory[],
  decisions: Record<string, Decision | undefined>,
): ReviewChange[] {
  return categories.flatMap((category) => {
    const after = decisionAmount(category, decisions[category.category])
    if (Math.abs(after - category.plan) < 0.005) return []
    return [
      {
        category: category.category,
        before: category.plan,
        after,
        text: `${formatMoney(category.plan)} → ${formatMoney(after)} al mes`,
      },
    ]
  })
}

export interface ReviewTotals {
  reviewed: number
  total: number
  planBefore: number
  planAfter: number
}

export function reviewTotals(
  categories: ReviewCategory[],
  decisions: Record<string, Decision | undefined>,
): ReviewTotals {
  return {
    reviewed: categories.filter((c) => decisions[c.category]).length,
    total: categories.length,
    planBefore: round2(categories.reduce((sum, c) => sum + c.plan, 0)),
    planAfter: round2(
      categories.reduce((sum, c) => sum + decisionAmount(c, decisions[c.category]), 0),
    ),
  }
}

export interface ReviewKpi {
  label: string
  value: string
  note: string
  loss: boolean
}

/** The strip «Septiembre en cifras», computed from the categories under review. */
export function reviewStrip(categories: ReviewCategory[], closed: Month): ReviewKpi[] {
  const spent = round2(categories.reduce((sum, c) => sum + c.actual, 0))
  const planned = round2(categories.reduce((sum, c) => sum + c.plan, 0))
  const diff = round2(spent - planned)
  const over = categories.filter((c) => c.overBudget).map((c) => c.category)
  const month = formatMonthName(closed).toLowerCase()
  return [
    {
      label: `Gastado en ${month}`,
      value: formatMoney(spent),
      note: `en ${categories.length === 1 ? 'la categoría' : `las ${categories.length} categorías`}`,
      loss: false,
    },
    {
      label: 'Presupuesto',
      value: formatMoney(planned),
      note: `fijado para ${month}`,
      loss: false,
    },
    {
      label: 'Diferencia',
      value: formatMoney(diff),
      note:
        Math.abs(diff) < 0.005
          ? 'justo lo previsto'
          : diff < 0
            ? 'por debajo de lo previsto'
            : 'por encima de lo previsto',
      loss: diff > 0.005,
    },
    {
      label: 'Se pasaron',
      value: `${over.length} de ${categories.length}`,
      note: over.join(', '),
      loss: false,
    },
  ]
}

export interface PlanWrite {
  category: string
  /** The twelve months as they were. */
  before: number[]
  /** The twelve months with the new amount from `from` through December. */
  after: number[]
}

/** The plans to save: each changed category keeps its earlier months and takes the new amount after. */
export function applyPlan(rows: BudgetRow[], changes: ReviewChange[], from: Month): PlanWrite[] {
  return changes.flatMap((change) => {
    const row = rows.find((r) => r.category === change.category)
    if (!row) return []
    const before = row.cells.map((cell) => cell.planned)
    const after = before.map((value, index) => (index + 1 >= from ? change.after : value))
    return [{ category: change.category, before, after }]
  })
}
