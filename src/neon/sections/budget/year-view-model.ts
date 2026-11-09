import {
  cellBar,
  defaultWindowStart,
  moveWindow,
  type BudgetCell,
  type BudgetRow,
  type BudgetTypeViewModel,
} from '../../../domain/budget/view-model'
import {
  formatMoney,
  formatMonthName,
  formatSignedMoney,
  formatWholeAmount,
} from '../../../lib/format'
import { ALL_MONTHS, asMonth, atMonth, type Month } from '../../../lib/month'
import { parseDecimal, round2 } from '../../../lib/number'
import type { Tone } from '../../../lib/tone'
import type { BudgetType } from '../../../scripts/types'

// «El año», the yearly screen of the new Presupuesto (artboard «Presupuesto ·
// 2560 px», #433): the plan against what was recorded, by category and month,
// as a grid (year or quarter) or as one month's list. Pure functions over the
// shared budget view-model.

export const TYPE_LABEL: Record<BudgetType, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
  saving: 'Ahorro',
  investment: 'Inversión',
}

/** What the figure on top of a cell is: «Gastado», «Ingresado»… */
export const PAST_LABEL: Record<BudgetType, string> = {
  expense: 'Gastado',
  income: 'Ingresado',
  saving: 'Ahorrado',
  investment: 'Invertido',
}

/** «Queda por gastar», «Falta por ingresar»… */
export const REMAINING_LABEL: Record<BudgetType, string> = {
  expense: 'Queda por gastar',
  income: 'Falta por ingresar',
  saving: 'Queda por ahorrar',
  investment: 'Queda por invertir',
}

/** Header of the month list's last column. */
export function remainingHead(type: BudgetType): string {
  return type === 'income' ? 'Falta o sobra' : 'Queda o pasado'
}

/** «septiembre». */
export function monthName(month: Month): string {
  return formatMonthName(month).toLowerCase()
}

/** «Sep». */
export function shortMonth(month: Month): string {
  return formatMonthName(month).slice(0, 3)
}

/** «1.245»: a whole amount, without sign. */
export function whole(value: number): string {
  return formatWholeAmount(Math.abs(value))
}

/** «+1.245,00 €», «−320,00 €», «0,00 €». */
export function signed(value: number): string {
  return Math.abs(value) < 0.005 ? formatMoney(0) : formatSignedMoney(value)
}

// ---- Tones ----------------------------------------------------------------

/**
 * Whether a deviation is good or bad news, as the artboard paints it: spending
 * (or saving, or investing) over the budget is loss; for income, going over is
 * gain and falling short is loss once the month is closed. Nothing else is
 * coloured.
 */
export function deviationTone(
  type: BudgetType,
  plan: number,
  actual: number,
  closed: boolean,
): Tone | null {
  const diff = actual - plan
  if (Math.abs(diff) < 0.005) return null
  if (type === 'income') return diff > 0 ? 'gain' : closed ? 'loss' : null
  return diff > 0 ? 'loss' : null
}

// ---- Windows and navigation -----------------------------------------------

export type YearView = 'year' | 'quarter' | 'month'

export const VIEW_LABEL: Record<YearView, string> = {
  year: 'Año',
  quarter: 'Trimestre',
  month: 'Mes',
}

export const VIEWS: YearView[] = ['year', 'quarter', 'month']

/** Where the quarter and the month start: the month before the current one, and the current one. */
export interface Cursor {
  quarter: Month
  month: Month
}

export function defaultCursor(currentMonth: number): Cursor {
  const month = asMonth(Math.min(Math.max(currentMonth, 1), 12)) ?? 1
  return { quarter: defaultWindowStart(3, currentMonth), month }
}

/** The months a view shows. */
export function windowMonths(view: YearView, cursor: Cursor): Month[] {
  if (view === 'year') return [...ALL_MONTHS]
  if (view === 'month') return [cursor.month]
  return ALL_MONTHS.filter((month) => month >= cursor.quarter && month < cursor.quarter + 3)
}

/** The cursor after pressing previous (-1) or next (1); unchanged at the ends of the year. */
export function moveCursor(view: YearView, cursor: Cursor, direction: -1 | 1): Cursor {
  if (view === 'quarter') return { ...cursor, quarter: moveWindow(cursor.quarter, 3, direction) }
  if (view === 'month') {
    const next = asMonth(cursor.month + direction)
    return next ? { ...cursor, month: next } : cursor
  }
  return cursor
}

export interface Navigation {
  label: string
  prevLabel: string
  nextLabel: string
  canPrev: boolean
  canNext: boolean
  /** Arrows only make sense for a quarter or a month. */
  arrows: boolean
}

/** «Todo 2026», «Ene – Mar 2026», «Octubre 2026». */
export function navigation(view: YearView, cursor: Cursor, year: number): Navigation {
  if (view === 'year') {
    return {
      label: `Todo ${year}`,
      prevLabel: '',
      nextLabel: '',
      canPrev: false,
      canNext: false,
      arrows: false,
    }
  }
  const quarter = view === 'quarter'
  const months = windowMonths(view, cursor)
  const first = months[0]
  const last = months[months.length - 1]
  return {
    label: quarter
      ? `${shortMonth(first)} – ${shortMonth(last)} ${year}`
      : `${formatMonthName(cursor.month)} ${year}`,
    prevLabel: quarter ? 'Trimestre anterior' : 'Mes anterior',
    nextLabel: quarter ? 'Trimestre siguiente' : 'Mes siguiente',
    canPrev: first > 1,
    canNext: last < 12,
    arrows: true,
  }
}

// ---- Summary ---------------------------------------------------------------

export interface Figure {
  label: string
  value: string
  note: string
  tone: Tone | null
}

/** Until when the accumulated deviation runs: «hasta sep.», none without closed months. */
export function deviationSpan(currentMonth: number): string {
  if (currentMonth <= 1) return ''
  if (currentMonth > 12) return 'en el año'
  return `hasta ${shortMonth((currentMonth - 1) as Month).toLowerCase()}.`
}

/** «Resumen del año»: planned, recorded so far, what is left and the deviation of the closed months. */
export function yearSummary(
  type: BudgetType,
  view: BudgetTypeViewModel,
  year: number,
  currentMonth: number,
): Figure[] {
  const { totals, remaining } = view
  const share = totals.plannedTotal ? (totals.actualTotal / totals.plannedTotal) * 100 : 0
  const diff = totals.diffToDate
  const closed = currentMonth > 1
  return [
    {
      label: `Presupuestado en ${year}`,
      value: formatMoney(totals.plannedTotal),
      note: `unos ${formatWholeAmount(totals.plannedTotal / 12)} € al mes`,
      tone: null,
    },
    {
      label: 'Real hasta hoy',
      value: formatMoney(totals.actualTotal),
      note: `${formatShare(share)} de lo previsto en el año`,
      tone: null,
    },
    {
      label: REMAINING_LABEL[type],
      value: formatMoney(remaining),
      note: 'de aquí a diciembre',
      tone: null,
    },
    closed
      ? {
          label: `Desvío ${deviationSpan(currentMonth)}`,
          value: signed(diff),
          note:
            Math.abs(diff) < 0.005
              ? 'justo lo previsto'
              : `${diff < 0 ? 'por debajo' : 'por encima'} de lo previsto`,
          tone: deviationTone(type, 0, diff, true),
        }
      : { label: 'Desvío', value: '—', note: 'aún no hay meses cerrados', tone: null },
  ]
}

function formatShare(value: number): string {
  return `${(Math.round(value * 10) / 10).toString().replace('.', ',')} %`
}

// ---- Grid ------------------------------------------------------------------

export interface Bar {
  /** Percent of the track. */
  fill: number
  over: number
  tick: number
}

/** The compliance bar of a plan and what was recorded, over a scale a fifth above the larger. */
export function barOf(plan: number, actual: number | null): Bar {
  const scale = Math.max(plan, actual ?? 0) * 1.2
  const { fill, over, plan: tick } = cellBar({ planned: plan, actual }, scale)
  return { fill, over, tick }
}

export interface GridCell {
  month: Month
  /** What was recorded; null for a month still to come. */
  actual: number | null
  plan: number
  tone: Tone | null
  /** The month in progress, shaded. */
  current: boolean
  bar: Bar
  /** «Septiembre: 421,55 € de 400,00 € presupuestados · +21,55 €». */
  title: string
  /** The text of the button that edits the plan. */
  editLabel: string
}

export function cellTitle(cell: Pick<BudgetCell, 'month' | 'actual' | 'planned'>): string {
  const name = formatMonthName(cell.month)
  if (cell.actual === null) {
    return `${name}: sin movimientos, ${formatMoney(cell.planned)} presupuestados`
  }
  return `${name}: ${formatMoney(cell.actual)} de ${formatMoney(cell.planned)} presupuestados · ${signed(cell.actual - cell.planned)}`
}

export function editLabel(category: string, month: Month): string {
  return `Presupuesto de ${category} en ${monthName(month)}`
}

export function saveLabel(category: string, month: Month): string {
  return `Guardar presupuesto de ${category} en ${monthName(month)}`
}

export function gridCell(
  type: BudgetType,
  category: string,
  cell: BudgetCell,
  currentMonth: number,
): GridCell {
  return {
    month: cell.month,
    actual: cell.actual,
    plan: cell.planned,
    tone:
      cell.actual === null
        ? null
        : deviationTone(type, cell.planned, cell.actual, cell.status === 'closed'),
    current: cell.month === currentMonth,
    bar: barOf(cell.planned, cell.actual),
    title: cellTitle(cell),
    editLabel: editLabel(category, cell.month),
  }
}

/** What a set of cells adds up to: the recorded amount of those with data and the plan of those same months. */
export interface Aggregate {
  actual: number | null
  /** Plan of the months that have a recorded amount. */
  planDone: number
  /** Plan of every month. */
  planAll: number
  tone: Tone | null
}

export function aggregate(
  type: BudgetType,
  cells: readonly Pick<BudgetCell, 'planned' | 'actual'>[],
  closed: boolean,
): Aggregate {
  let actual = 0
  let planDone = 0
  let planAll = 0
  let hasActual = false
  for (const cell of cells) {
    planAll += cell.planned
    if (cell.actual === null) continue
    hasActual = true
    actual += cell.actual
    planDone += cell.planned
  }
  return {
    actual: hasActual ? round2(actual) : null,
    planDone: round2(planDone),
    planAll: round2(planAll),
    tone: hasActual ? deviationTone(type, planDone, actual, closed) : null,
  }
}

export interface GridRow {
  category: string
  cells: GridCell[]
  total: Aggregate
}

export interface Grid {
  months: Month[]
  /** Per month, whether to say «cerrado», «en curso» or «previsto» under its name (quarter view). */
  statuses: Record<number, string>
  rows: GridRow[]
  /** The «Total» row: one aggregate per month, and the grand total. */
  monthTotals: (Aggregate & { month: Month; current: boolean })[]
  total: Aggregate
}

const STATUS_WORD = { closed: 'cerrado', current: 'en curso', planned: 'previsto' } as const

export function buildGrid(
  type: BudgetType,
  view: BudgetTypeViewModel,
  months: readonly Month[],
  currentMonth: number,
): Grid {
  const rows = view.rows.map((row): GridRow => {
    const cells = months.map((month) => atMonth(row.cells, month))
    return {
      category: row.category,
      cells: cells.map((cell) => gridCell(type, row.category, cell, currentMonth)),
      total: aggregate(type, cells, true),
    }
  })
  const monthTotals = months.map((month) => ({
    month,
    current: month === currentMonth,
    ...aggregate(
      type,
      view.rows.map((row) => atMonth(row.cells, month)),
      month < currentMonth,
    ),
  }))
  const every = view.rows.flatMap((row) => months.map((month) => atMonth(row.cells, month)))
  const statuses: Record<number, string> = {}
  for (const month of months) {
    statuses[month] = STATUS_WORD[atMonth(view.totals.cells, month).status]
  }
  return { months: [...months], statuses, rows, monthTotals, total: aggregate(type, every, true) }
}

/** The legend over the grid. */
export function gridLegend(type: BudgetType, view: YearView): string {
  const tones =
    type === 'income'
      ? 'En verde, lo que supera lo previsto; en rojo, lo que queda por debajo.'
      : 'En rojo, lo que se sale del presupuesto.'
  return (
    `Cifra grande: lo ${PAST_LABEL[type].toLowerCase()}. Debajo, el presupuesto: haz clic para cambiarlo. ${tones}` +
    `${view === 'quarter' ? ' La raya marca el presupuesto.' : ''} El nombre de la categoría abre su plan del año.`
  )
}

export function gridAria(type: BudgetType): string {
  return `Cuadrícula de ${TYPE_LABEL[type].toLowerCase()} por categoría y mes`
}

export function monthAria(type: BudgetType, month: Month): string {
  return `Lista de ${TYPE_LABEL[type].toLowerCase()} de ${monthName(month)}`
}

// ---- One month's list ------------------------------------------------------

export interface MonthLine {
  category: string
  actual: number | null
  plan: number
  tone: Tone | null
  bar: Bar
  /** «Queda 120 €», «Pasado 40 €», «Sin diferencia». */
  remaining: string
  remainingTone: Tone | null
  editLabel: string
  /** actual / plan, -1 without data: the list order. */
  ratio: number
}

export function remainingText(type: BudgetType, left: number): string {
  if (Math.abs(left) < 0.005) return 'Sin diferencia'
  const word = type === 'income' ? (left > 0 ? 'Falta' : 'Sobra') : left > 0 ? 'Queda' : 'Pasado'
  return `${word} ${whole(left)} €`
}

function monthLine(type: BudgetType, category: string, cell: BudgetCell): MonthLine {
  const actual = cell.actual
  const spent = actual ?? 0
  const closed = cell.status === 'closed'
  return {
    category,
    actual,
    plan: cell.planned,
    tone: actual === null ? null : deviationTone(type, cell.planned, actual, closed),
    bar: barOf(cell.planned, actual),
    remaining: remainingText(type, cell.planned - spent),
    remainingTone: deviationTone(type, cell.planned, spent, closed),
    editLabel: editLabel(category, cell.month),
    ratio: actual === null ? -1 : cell.planned ? actual / cell.planned : 0,
  }
}

export interface MonthList {
  lines: MonthLine[]
  total: Omit<MonthLine, 'category' | 'editLabel' | 'ratio'>
}

/** One line per category, the closest to (or past) its budget first, and the month's total. */
export function buildMonthList(
  type: BudgetType,
  view: BudgetTypeViewModel,
  month: Month,
  currentMonth: number,
): MonthList {
  const lines = view.rows
    .map((row) => monthLine(type, row.category, atMonth(row.cells, month)))
    .sort((a, b) => b.ratio - a.ratio)
  const total = aggregate(
    type,
    view.rows.map((row) => atMonth(row.cells, month)),
    month < currentMonth,
  )
  const left = total.planAll - (total.actual ?? 0)
  return {
    lines,
    total: {
      actual: total.actual,
      plan: total.planAll,
      tone: total.tone,
      bar: barOf(total.planAll, total.actual),
      remaining: remainingText(type, left),
      remainingTone: total.tone,
    },
  }
}

// ---- Plan panel --------------------------------------------------------------

/** «Plan de 2026 · Gastos». */
export function planKicker(year: number, type: BudgetType): string {
  return `Plan de ${year} · ${TYPE_LABEL[type]}`
}

export interface PlanFigures {
  planned: string
  actual: string
  /** «Desvío hasta sep.»; empty without closed months. */
  deviationLabel: string
  deviation: string
  tone: Tone | null
}

/** The panel's figures, following the amounts typed; an invalid one keeps its saved amount. */
export function planFigures(
  type: BudgetType,
  row: BudgetRow,
  drafts: readonly string[],
  currentMonth: number,
): PlanFigures {
  const plan = ALL_MONTHS.map((month) => {
    const value = parseDraft(atMonth(drafts, month))
    return value ?? atMonth(row.cells, month).planned
  })
  const closed = row.cells.filter((cell) => cell.status === 'closed')
  const diff = round2(
    closed.reduce((total, cell) => total + (cell.actual ?? 0) - atMonth(plan, cell.month), 0),
  )
  const label = deviationSpan(currentMonth)
  return {
    planned: formatMoney(plan.reduce((total, value) => total + value, 0)),
    actual: formatMoney(row.actualTotal),
    deviationLabel: label ? `Desvío ${label}` : 'Desvío',
    deviation: label ? signed(diff) : '—',
    tone: label ? deviationTone(type, 0, diff, true) : null,
  }
}

/** «en curso · real 214,80 €», «real 382,10 €», «sin movimientos». */
export function planReference(cell: BudgetCell): string {
  const real = cell.actual === null ? 'sin movimientos' : `real ${formatMoney(cell.actual)}`
  return cell.status === 'current' ? `en curso · ${real}` : real
}

// ---- Drafts ------------------------------------------------------------------

/** The amount a field holds: blank is 0; null when it is not a non-negative number. */
export function parseDraft(text: string): number | null {
  if (text.trim() === '') return 0
  const value = parseDecimal(text)
  return Number.isFinite(value) && value >= 0 ? round2(value) : null
}

/** Whether a draft changes the saved plan. */
export function isChange(saved: number, value: number): boolean {
  return Math.abs(saved - value) >= 0.005
}
