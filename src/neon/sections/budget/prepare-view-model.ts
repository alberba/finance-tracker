import type { BudgetRow, BudgetViewModel } from '../../../domain/budget/view-model'
import { formatMoney, formatMonthName } from '../../../lib/format'
import { ALL_MONTHS, asMonth, atMonth, type Month } from '../../../lib/month'
import { round2 } from '../../../lib/number'
import type { BudgetType } from '../../../scripts/types'

// «Hacer el presupuesto» of the new Presupuesto (artboard «Presupuesto ·
// 2560 px», #433): the plan of next month, category by category, against what
// comes in. Pure functions over the shared budget view-model; the screen only
// holds the values being edited.

/** Where the values start from. `saved` only exists when the month already has a plan. */
export type StartMode = 'saved' | 'average' | 'current' | 'blank'

export interface PrepareRow {
  /** Unique across groups: `type:category`. */
  key: string
  type: BudgetType
  category: string
  label: string
  /** Mean of the actuals of this year's closed months; null when none has closed. */
  average: number | null
  closedCount: number
  /** The plan of the month in progress. */
  current: number
  /** The plan already stored for the target month. */
  stored: number
}

export interface PrepareGroup {
  type: BudgetType
  /** Heading id suffix. */
  id: string
  label: string
  note: string
  /** Tailwind background class of the group's swatch and share of the bar. */
  swatch: string
  income: boolean
  rows: PrepareRow[]
}

const GROUP_DEFS: {
  type: BudgetType
  label: string
  note: string
  swatch: string
}[] = [
  {
    type: 'income',
    label: 'Lo que entra',
    note: 'Ingresos que esperas este mes.',
    swatch: 'bg-soft',
  },
  {
    type: 'expense',
    label: 'Gastos',
    note: 'Lo que pagas y lo que gastas cada mes.',
    swatch: 'bg-peach',
  },
  { type: 'saving', label: 'Ahorro', note: 'Apartado para tus objetivos.', swatch: 'bg-lilac3' },
  {
    type: 'investment',
    label: 'Inversión',
    note: 'Las compras recurrentes del mes.',
    swatch: 'bg-lilac',
  },
]

/** The month to prepare: the one after the month in progress; null in December, in a past year or in a future one. */
export function prepareTarget(view: BudgetViewModel): Month | null {
  if (view.currentMonth < 1 || view.currentMonth > 11) return null
  return asMonth(view.currentMonth + 1)
}

function monthLower(month: Month): string {
  return formatMonthName(month).toLowerCase()
}

/** «Planificación · noviembre 2026». */
export function prepareKicker(year: number, target: Month): string {
  return `Planificación · ${monthLower(target)} ${year}`
}

export function prepareLede(closedCount: number): string {
  return closedCount > 0
    ? 'Parte de lo que entra y dale un destino a cada euro. Las cifras salen de los meses cerrados de este año; cámbialas a tu gusto.'
    : 'Parte de lo que entra y dale un destino a cada euro. Aún no hay meses cerrados este año, así que partes del presupuesto del mes en curso.'
}

function buildRow(type: BudgetType, row: BudgetRow, current: Month, target: Month): PrepareRow {
  const closed = row.cells.filter((cell) => cell.status === 'closed')
  const total = closed.reduce((sum, cell) => sum + (cell.actual ?? 0), 0)
  return {
    key: `${type}:${row.category}`,
    type,
    category: row.category,
    label: row.label,
    average: closed.length ? round2(total / closed.length) : null,
    closedCount: closed.length,
    current: atMonth(row.cells, current).planned,
    stored: atMonth(row.cells, target).planned,
  }
}

/** Every budget type as a group with its categories as rows; types without categories keep an empty group. */
export function buildPrepareGroups(view: BudgetViewModel, target: Month): PrepareGroup[] {
  const current = asMonth(view.currentMonth) ?? 1
  return GROUP_DEFS.map((def) => ({
    type: def.type,
    id: def.type,
    label: def.label,
    note: def.note,
    swatch: def.swatch,
    income: def.type === 'income',
    rows: view.types[def.type].rows.map((row) => buildRow(def.type, row, current, target)),
  }))
}

export function allRows(groups: readonly PrepareGroup[]): PrepareRow[] {
  return groups.flatMap((group) => group.rows)
}

/** Whether the target month already has a plan to start from. */
export function hasSavedPlan(groups: readonly PrepareGroup[]): boolean {
  return allRows(groups).some((row) => row.stored > 0)
}

export function defaultStart(groups: readonly PrepareGroup[]): StartMode {
  return hasSavedPlan(groups) ? 'saved' : 'average'
}

/** Options of «Empezar desde», labelled with the month in progress. */
export function startOptions(current: Month, saved: boolean): { mode: StartMode; label: string }[] {
  const options: { mode: StartMode; label: string }[] = [
    { mode: 'average', label: 'Media' },
    { mode: 'current', label: formatMonthName(current) },
    { mode: 'blank', label: 'En blanco' },
  ]
  return saved ? [{ mode: 'saved', label: 'Lo guardado' }, ...options] : options
}

/** The value a row starts at. Without closed months the average falls back to the current plan. */
export function seedValue(row: PrepareRow, mode: StartMode): number {
  if (mode === 'blank') return 0
  if (mode === 'saved') return row.stored
  if (mode === 'current') return row.current
  return row.average ?? row.current
}

/** The amount a ± press moves: income and investment move in large steps, the rest by size. */
export function stepFor(type: BudgetType, value: number): number {
  if (type === 'income' || type === 'investment') return 50
  return value < 100 ? 5 : 10
}

export function stepValue(type: BudgetType, value: number, direction: 1 | -1): number {
  return Math.max(0, round2(value + direction * stepFor(type, value)))
}

/** «Media 8 meses: 656,00 € · octubre: 650,00 €»; only the current month when none has closed. */
export function rowNote(row: PrepareRow, currentName: string): string {
  const now = `${currentName.toLowerCase()}: ${formatMoney(row.current)}`
  if (row.average === null) return `${now.charAt(0).toUpperCase()}${now.slice(1)}`
  const months = row.closedCount === 1 ? '1 mes' : `${row.closedCount} meses`
  return `Media ${months}: ${formatMoney(row.average)} · ${now}`
}

/** «Usar media» is offered while the value differs from the average. */
export function showUseAverage(row: PrepareRow, value: number): boolean {
  return row.average !== null && Math.abs(value - row.average) > 0.5
}

export interface GroupFigure {
  type: BudgetType
  total: number
  /** Share of the month's income, null without income. */
  share: number | null
}

export interface Split {
  income: number
  assigned: number
  /** Income minus what is assigned; negative when more is split than comes in. */
  free: number
  groups: GroupFigure[]
}

export function split(groups: readonly PrepareGroup[], values: Record<string, number>): Split {
  const totals = groups.map((group) => ({
    group,
    total: round2(group.rows.reduce((sum, row) => sum + (values[row.key] ?? 0), 0)),
  }))
  const income = round2(totals.filter((t) => t.group.income).reduce((sum, t) => sum + t.total, 0))
  const assigned = round2(
    totals.filter((t) => !t.group.income).reduce((sum, t) => sum + t.total, 0),
  )
  return {
    income,
    assigned,
    free: round2(income - assigned),
    groups: totals.map(({ group, total }) => ({
      type: group.type,
      total,
      share: income > 0 ? Math.round((total / income) * 100) : null,
    })),
  }
}

/** «42 %», or a dash without income. */
export function shareText(share: number | null): string {
  return share === null ? '—' : `${share} %`
}

export type FreeTone = 'over' | 'zero' | 'free'

export function freeFigures(free: number): { label: string; note: string; tone: FreeTone } {
  if (free < -0.005) {
    return {
      label: 'Te pasas',
      note: 'Repartes más de lo que entra. Baja alguna categoría.',
      tone: 'over',
    }
  }
  if (free < 0.005) {
    return { label: 'Sin destino', note: 'Cada euro que entra tiene destino.', tone: 'zero' }
  }
  return {
    label: 'Sin destino',
    note: 'Lo que no asignes se queda en la cuenta corriente.',
    tone: 'free',
  }
}

/** Accessible description of the stacked bar. */
export function barLabel(groups: readonly PrepareGroup[], figure: Split): string {
  const parts = figure.groups
    .filter((g) => !groups.find((x) => x.type === g.type)?.income)
    .map((g) => `${groups.find((x) => x.type === g.type)?.label} ${shareText(g.share)}`)
  const free =
    figure.income > 0 ? Math.round((Math.max(figure.free, 0) / figure.income) * 100) : null
  return `Reparto: ${parts.join(', ')}, sin destino ${shareText(free)}`
}

export interface BudgetWrite {
  type: BudgetType
  category: string
  month: Month
  value: number
}

/**
 * The cells to write: for every row, the target month and, with `repeat`, the
 * months after it through December, wherever the stored plan differs from the value.
 */
export function cellsToWrite(
  view: BudgetViewModel,
  groups: readonly PrepareGroup[],
  values: Record<string, number>,
  target: Month,
  repeat: boolean,
): BudgetWrite[] {
  const last = repeat ? 12 : target
  return allRows(groups).flatMap((row) => {
    const value = round2(values[row.key] ?? 0)
    const stored = view.types[row.type].rows.find((r) => r.category === row.category)
    if (!stored) return []
    return ALL_MONTHS.filter((month) => month >= target && month <= last)
      .filter((month) => Math.abs(atMonth(stored.cells, month).planned - value) >= 0.005)
      .map((month) => ({ type: row.type, category: row.category, month, value }))
  })
}

/** «Repetir este reparto en diciembre» / «…hasta diciembre»; null in December. */
export function repeatLabel(target: Month): string | null {
  if (target >= 12) return null
  return target === 11
    ? 'Repetir este reparto en diciembre'
    : 'Repetir este reparto hasta diciembre'
}

/** «Guardado para noviembre», «…noviembre y diciembre», «…de noviembre a diciembre». */
export function savedSummary(target: Month, repeat: boolean): string {
  const first = monthLower(target)
  if (!repeat || target >= 12) return `Guardado para ${first}`
  if (target === 11) return `Guardado para ${first} y diciembre`
  return `Guardado de ${first} a diciembre`
}
