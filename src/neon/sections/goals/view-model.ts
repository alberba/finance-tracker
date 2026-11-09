import { buildSavingGoals } from '../../../domain/goals/view-model'
import { formatMonthName, formatNumber } from '../../../lib/format'
import { asMonth } from '../../../lib/month'
import { parseDecimal } from '../../../lib/number'
import type { State } from '../../../scripts/types'

// Objetivos in the new design (artboard «Objetivos · 2560 px», #441): one
// column per savings goal, filled with what it has saved, and when it arrives
// at the monthly amount planned for it against its deadline. Months are
// counted as one number (year × 12 + month − 1) so they subtract cleanly.

const NBSP = ' '

/** A month as one number: year × 12 + (month − 1). */
export function monthNumber(year: number, month: number): number {
  return year * 12 + month - 1
}

export function monthOf(date: Date): number {
  return monthNumber(date.getFullYear(), date.getMonth() + 1)
}

/** Year and month (1-12) of a month number. */
export function yearMonth(value: number): { year: number; month: number } {
  return { year: Math.floor(value / 12), month: (value % 12) + 1 }
}

/** «mar 2027». */
export function monthLabel(value: number): string {
  const { year, month } = yearMonth(value)
  return `${formatMonthName(asMonth(month) ?? 1)
    .slice(0, 3)
    .toLowerCase()} ${year}`
}

/** «250 €»: plans are made in whole euros. */
export function wholeEuros(value: number): string {
  return `${formatNumber(Math.round(value))}${NBSP}€`
}

function months(count: number): string {
  return count === 1 ? '1 mes' : `${count} meses`
}

/** One savings goal as the new design plans it. */
export interface GoalPlan {
  id: string
  name: string
  category: string
  target: number
  /** Everything saved in its category. */
  saved: number
  /** The month it is due; null without a deadline. */
  due: number | null
  /** What goes into it each month as planned; 0 when never planned. */
  monthly: number
  /** The month of its first saving, where its «today» mark starts counting. */
  start: number | null
}

/** The user's savings goals with what each has saved and its plan. */
export function goalPlans(state: Pick<State, 'savingGoals' | 'transactions'>): GoalPlan[] {
  const first = new Map<string, string>()
  for (const tx of state.transactions) {
    if (tx.type !== 'saving' || !tx.date) continue
    const seen = first.get(tx.category)
    if (!seen || tx.date < seen) first.set(tx.category, tx.date)
  }
  const measured = new Map(buildSavingGoals(state as State).map((row) => [row.id, row]))
  return state.savingGoals.map((goal) => {
    const firstDate = first.get(goal.category)
    return {
      id: goal.id,
      name: goal.name,
      category: goal.category,
      target: measured.get(goal.id)?.target ?? goal.targetAmount,
      saved: measured.get(goal.id)?.saved ?? 0,
      due:
        goal.targetYear !== undefined && goal.targetMonth !== undefined
          ? monthNumber(goal.targetYear, goal.targetMonth)
          : null,
      monthly: goal.monthlyAmount ?? 0,
      start: firstDate
        ? monthNumber(Number(firstDate.slice(0, 4)), Number(firstDate.slice(5, 7)))
        : null,
    }
  })
}

/** Where a goal gets to at a monthly amount. */
export interface GoalForecast {
  met: boolean
  remaining: number
  /** The month it arrives; null when it does not advance. */
  arrival: number | null
  /** Months after the deadline it arrives (negative: before); null without both. */
  late: number | null
  /** The monthly amount that arrives right on the deadline; null without one. */
  needed: number | null
}

export function forecast(plan: GoalPlan, monthly: number, now: number): GoalForecast {
  const remaining = Math.max(plan.target - plan.saved, 0)
  const met = plan.target > 0 && remaining <= 0
  const arrival = met ? now : monthly > 0 ? now + Math.ceil(remaining / monthly) : null
  return {
    met,
    remaining,
    arrival,
    late: arrival !== null && plan.due !== null ? arrival - plan.due : null,
    needed: plan.due !== null ? Math.ceil(remaining / Math.max(plan.due - now, 1)) : null,
  }
}

/** The arrival and its verdict, as a column and the selected goal say them. */
export interface GoalReading {
  arrival: string
  verdict: string
  /** Late or not advancing: the verdict is painted in --color-loss. */
  late: boolean
}

export function goalReading(result: GoalForecast): GoalReading {
  if (result.met) return { arrival: 'Conseguido', verdict: 'Meta alcanzada', late: false }
  if (result.arrival === null) return { arrival: 'Sin fecha', verdict: 'No avanza', late: true }
  const arrival = monthLabel(result.arrival)
  if (result.late === null) return { arrival, verdict: 'Sin fecha límite', late: false }
  if (result.late > 0) return { arrival, verdict: `${months(result.late)} tarde`, late: true }
  return { arrival, verdict: result.late === 0 ? 'Justo a tiempo' : 'A tiempo', late: false }
}

/** Heights in the column, 0–100 from the bottom. */
export interface GoalTube {
  /** What is saved. */
  saved: number
  /** Where the monthly amount gets it by the deadline. */
  projected: number
  /** What the monthly amount leaves short of the target by the deadline. */
  short: number
  /** Where an even pace from its first saving to the deadline puts it today. */
  today: number | null
}

export interface GoalColumn extends GoalReading {
  id: string
  name: string
  percent: string
  tube: GoalTube
}

function share(value: number, target: number): number {
  return target > 0 ? Math.min(Math.max((value / target) * 100, 0), 100) : 0
}

function tube(plan: GoalPlan, now: number): GoalTube {
  const saved = share(plan.saved, plan.target)
  if (plan.due === null) return { saved, projected: saved, short: 0, today: null }
  const projected = share(plan.saved + plan.monthly * Math.max(plan.due - now, 0), plan.target)
  const start = plan.start ?? now
  const span = Math.max(plan.due - start, 1)
  return {
    saved,
    projected,
    short: 100 - projected,
    today: share(Math.min(Math.max((now - start) / span, 0), 1) * plan.target, plan.target),
  }
}

/** How urgent a goal is: the later it arrives past its deadline, the sooner it shows. */
function urgency(result: GoalForecast): number {
  if (result.met) return -Infinity
  if (result.arrival === null) return Infinity
  return result.late ?? -Number.MAX_SAFE_INTEGER
}

/** One column per goal, the most urgent first (ties keep the user's order). */
export function goalColumns(plans: GoalPlan[], date: Date): GoalColumn[] {
  const now = monthOf(date)
  return plans
    .map((plan, index) => ({ plan, index, result: forecast(plan, plan.monthly, now) }))
    .sort((a, b) => urgency(b.result) - urgency(a.result) || a.index - b.index)
    .map(({ plan, result }) => ({
      id: plan.id,
      name: plan.name,
      percent: `${Math.round(share(plan.saved, plan.target))}${NBSP}%`,
      tube: tube(plan, now),
      ...goalReading(result),
    }))
}

/** The selected goal under the columns, read at the amount on its slider. */
export interface SelectedGoal extends GoalReading {
  /** «250 €», the amount on the slider. */
  monthly: string
  /** Top of the slider: twice the larger of the needed and the current amount. */
  max: number
  /** The amount that arrives right on the deadline, when the slider is off it. */
  action: { label: string; amount: number } | null
}

export function selectedGoal(plan: GoalPlan, monthly: number, date: Date): SelectedGoal {
  const result = forecast(plan, monthly, monthOf(date))
  const reading = goalReading(result)
  const needed = result.needed
  const off = needed !== null && !result.met && (reading.late || monthly > needed)
  return {
    ...reading,
    monthly: wholeEuros(monthly),
    max: Math.ceil((Math.max(needed ?? 0, monthly, 50) * 2) / 50) * 50,
    action: off
      ? { label: `${monthly < needed ? 'Subir' : 'Bajar'} a ${wholeEuros(needed)}`, amount: needed }
      : null,
  }
}

/** «Repartir el ahorro»: each goal with the share of the monthly saving it gets. */
export interface SplitView {
  rows: Array<{ id: string; name: string; line: string; late: boolean }>
  /** The bar of shares, in the goals' order; widths add up to 100 at most. */
  segments: Array<{ id: string; name: string; width: number }>
  rest: { label: string; amount: string; over: boolean }
}

function splitLine(result: GoalForecast): string {
  if (result.met) return 'Conseguido'
  if (result.arrival === null) return 'No avanza'
  const arrival = `Llegas en ${monthLabel(result.arrival)}`
  if (result.late === null) return arrival
  if (result.late > 0) return `${arrival} · ${months(result.late)} tarde`
  return `${arrival} · ${result.late === 0 ? 'justo a tiempo' : 'a tiempo'}`
}

export function splitView(
  plans: GoalPlan[],
  shares: Record<string, number>,
  total: number,
  date: Date,
): SplitView {
  const now = monthOf(date)
  const share = (plan: GoalPlan) => shares[plan.id] ?? 0
  const sum = plans.reduce((acc, plan) => acc + share(plan), 0)
  const whole = Math.max(total, sum, 1)
  const rest = total - sum
  return {
    rows: plans.map((plan) => {
      const result = forecast(plan, share(plan), now)
      return {
        id: plan.id,
        name: plan.name,
        line: splitLine(result),
        late: goalReading(result).late,
      }
    }),
    segments: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      width: (share(plan) / whole) * 100,
    })),
    rest: {
      label: rest < 0 ? 'Repartes más de lo que ahorras' : 'Sin asignar',
      amount: wholeEuros(Math.abs(rest)),
      over: rest < 0,
    },
  }
}

/** What the budget sets aside for saving this month; 0 when it is another year's budget. */
export function monthlySaving(state: Pick<State, 'budget'>, year: number, date: Date): number {
  if (year !== date.getFullYear()) return 0
  const month = date.getMonth()
  return Object.values(state.budget.saving ?? {}).reduce(
    (sum, plan) => sum + Number(plan?.[month] ?? 0),
    0,
  )
}

/** The monthly saving the goals do not already take. */
export function freeSaving(saving: number, plans: GoalPlan[]): number {
  return Math.max(saving - plans.reduce((sum, plan) => sum + plan.monthly, 0), 0)
}

/** How far a new goal can be: «6 meses» to «3 años». */
export const WHEN_OPTIONS: ReadonlyArray<{ months: number; label: string }> = [
  { months: 6, label: '6 meses' },
  { months: 12, label: '1 año' },
  { months: 18, label: '18 meses' },
  { months: 24, label: '2 años' },
  { months: 36, label: '3 años' },
]

/**
 * What a goal needs a month to reach `target` in `count` months, and whether
 * the free saving covers it; `free` is null when the budget sets nothing aside.
 */
export function newGoalFit(
  target: number,
  count: number,
  free: number | null,
): { needed: number; text: string; fits: boolean } {
  if (!(target > 0)) return { needed: 0, text: 'Pon cuánto necesitas.', fits: true }
  const needed = Math.ceil(target / Math.max(count, 1))
  if (free === null) {
    return { needed, text: 'Tu presupuesto no reserva ahorro este mes.', fits: true }
  }
  const left = `tu presupuesto deja ${wholeEuros(free)} libres al mes`
  return needed <= free
    ? { needed, text: `Te cabe: ${left}.`, fits: true }
    : { needed, text: `No te cabe: ${left} y faltan ${wholeEuros(needed - free)}.`, fits: false }
}

/**
 * An amount typed in a goal field. Goals are written in whole euros with the
 * thousands dotted («3.600»), so a dot before groups of three digits is a
 * thousands mark; anything else reads as `parseDecimal` reads it.
 */
export function parseAmount(text: string): number {
  const compact = String(text).trim().replace(/\s/g, '')
  return parseDecimal(/^\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, '') : compact)
}
