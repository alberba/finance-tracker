import { signedAmount, type MonthGroup } from '../../../domain/transactions/registry'
import {
  formatDayMonth,
  formatLongDate,
  formatMoney,
  formatMonthName,
  formatMonthYear,
  formatPercent,
  formatSignedMoney,
} from '../../../lib/format'
import type { Month } from '../../../lib/month'
import { parseDecimal, round2 } from '../../../lib/number'
import { TRANSACTION_TYPES, type Transaction, type TransactionType } from '../../../scripts/types'

// What the new Movimientos registry shows (artboard «Movimientos · 2560 px»):
// the ledger by month and day, the filter summary in the aside and the detail
// of one movement. Pure functions over the shared domain; the section only
// wires them to the stores.

/** Filters of «Más filtros» that only the new design has. Empty means no filter. */
export interface ExtraFilters {
  /** One exact day, ISO. */
  date: string
  /** Lowest and highest amount, as typed («12,50»). */
  min: string
  max: string
}

export const NO_EXTRA_FILTERS: ExtraFilters = { date: '', min: '', max: '' }

function amountBound(text: string): number | null {
  if (!text.trim()) return null
  const value = parseDecimal(text)
  return Number.isFinite(value) ? value : null
}

/** Whether a movement passes the exact day and the amount range. */
export function extraMatcher(extra: ExtraFilters): (tx: Transaction) => boolean {
  const min = amountBound(extra.min)
  const max = amountBound(extra.max)
  return (tx) => {
    const amount = Math.abs(Number(tx.amount) || 0)
    if (extra.date && tx.date !== extra.date) return false
    if (min !== null && amount < min) return false
    if (max !== null && amount > max) return false
    return true
  }
}

/** Month groups narrowed by the extra filters, dropping the months left empty. */
export function narrowMonthGroups(groups: MonthGroup[], extra: ExtraFilters): MonthGroup[] {
  const matches = extraMatcher(extra)
  return groups.flatMap((group) => {
    const rows = group.rows.filter(matches)
    if (!rows.length) return []
    if (rows.length === group.rows.length) return [group]
    const net = round2(rows.reduce((sum, tx) => sum + signedAmount(tx), 0))
    return [{ ...group, rows, count: rows.length, net }]
  })
}

/** «Más filtros», with how many of its filters are on («Más filtros · 2»). */
export function moreFiltersLabel(accountIds: string[], extra: ExtraFilters): string {
  const count =
    (accountIds.length ? 1 : 0) +
    (extra.date ? 1 : 0) +
    (extra.min.trim() ? 1 : 0) +
    (extra.max.trim() ? 1 : 0)
  return count ? `Más filtros · ${count}` : 'Más filtros'
}

export function hasExtraFilters(extra: ExtraFilters): boolean {
  return Boolean(extra.date || extra.min.trim() || extra.max.trim())
}

/** The type chips: one type at a time, none chosen means every type. */
export const TYPE_CHIPS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'saving', label: 'Ahorros' },
  { value: 'investment', label: 'Inversión' },
]

/** The single type the chips narrow to, or null when every type shows. */
export function chosenType(types: string[]): TransactionType | null {
  return types.length === 1 && (TRANSACTION_TYPES as readonly string[]).includes(types[0])
    ? (types[0] as TransactionType)
    : null
}

/** Pressing a chip picks its type; pressing the chosen one goes back to every type. */
export function toggleTypeChip(types: string[], type: TransactionType): TransactionType[] {
  return chosenType(types) === type ? [] : [type]
}

export const TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  saving: 'Ahorro',
  investment: 'Inversión',
}

const TYPE_NOUN: Record<TransactionType, string> = {
  expense: 'gastos',
  income: 'ingresos',
  saving: 'ahorros',
  investment: 'inversión',
}

/** How a figure is painted: income in gain, investment in lilac, the rest in text. */
export type AmountTone = 'gain' | 'lilac' | 'text'

export function amountTone(type: TransactionType): AmountTone {
  if (type === 'income') return 'gain'
  if (type === 'investment') return 'lilac'
  return 'text'
}

/** A movement's amount as read: signed by its effect, plain for a saving. */
export function movementAmount(tx: Pick<Transaction, 'type' | 'amount'>, currency = 'EUR'): string {
  if (tx.type === 'saving') return formatMoney(Math.abs(Number(tx.amount) || 0), currency)
  return formatSignedMoney(signedAmount(tx), currency)
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** «Hoy», «Ayer» or «5 oct»: the heading of a day in the ledger. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === shiftDay(today, -1)) return 'Ayer'
  return formatDayMonth(date)
}

export interface LedgerRowView {
  id: string
  description: string
  /** The account, under the description. */
  meta: string
  category: string
  type: TransactionType
  amount: string
  tone: AmountTone
  /** Accessible name of the row's button: what, when and how much. */
  label: string
  /** A Bitvavo operation: read only here. */
  remote: boolean
}

export interface LedgerDayView {
  date: string
  label: string
  net: string
  rows: LedgerRowView[]
}

export interface LedgerMonthView {
  month: Month
  title: string
  summary: string
  days: LedgerDayView[]
}

export interface LedgerContext {
  year: number
  today: string
  currency: string
  accountName: (id: string) => string
}

/** One movement as a ledger row. */
export function ledgerRow(tx: Transaction, context: LedgerContext): LedgerRowView {
  const description = tx.description || tx.category || '—'
  const amount = movementAmount(tx, context.currency)
  const account =
    tx.type === 'saving' && tx.destinationAccountId
      ? `${context.accountName(tx.accountId)} → ${context.accountName(tx.destinationAccountId)}`
      : context.accountName(tx.accountId)
  return {
    id: tx.id,
    description,
    meta: account,
    category: tx.category || 'Sin categoría',
    type: tx.type,
    amount,
    tone: amountTone(tx.type),
    label: `${description}, ${dayLabel(tx.date, context.today).toLowerCase()}, ${amount}`,
    remote: Boolean(tx.remoteOperation),
  }
}

/** Month groups (already sorted) as ledger months, each split by day in their order. */
export function buildLedgerMonths(groups: MonthGroup[], context: LedgerContext): LedgerMonthView[] {
  return groups.map((group) => {
    const days: LedgerDayView[] = []
    const nets = new Map<string, number>()
    group.rows.forEach((tx) => {
      nets.set(tx.date, (nets.get(tx.date) ?? 0) + signedAmount(tx))
      let day = days.find((candidate) => candidate.date === tx.date)
      if (!day) {
        day = { date: tx.date, label: dayLabel(tx.date, context.today), net: '', rows: [] }
        days.push(day)
      }
      day.rows.push(ledgerRow(tx, context))
    })
    days.forEach((day) => {
      day.net = `Neto ${formatSignedMoney(nets.get(day.date) ?? 0, context.currency)}`
    })
    return {
      month: group.month,
      title: formatMonthYear(group.month, context.year),
      summary: `${plural(group.count, 'movimiento', 'movimientos')} · neto ${formatSignedMoney(group.net, context.currency)}`,
      days,
    }
  })
}

/** The button that unfolds the older months: «Ver febrero y anteriores · 12 movimientos». */
export function olderMonthsLabel(hidden: MonthGroup[]): string {
  if (!hidden.length) return ''
  const count = hidden.reduce((sum, group) => sum + group.count, 0)
  return `Ver ${formatMonthName(hidden[0].month).toLowerCase()} y anteriores · ${plural(count, 'movimiento', 'movimientos')}`
}

export interface FilterSummary {
  label: string
  total: string
  count: string
}

/**
 * The aside's figure for the movements of the month that pass the filters:
 * the net when every type shows, the plain total of the chosen type otherwise.
 */
export function filterSummary(
  rows: Transaction[],
  types: string[],
  currency = 'EUR',
): FilterSummary {
  const type = chosenType(types)
  const noun = type ? TYPE_NOUN[type] : 'todos los tipos'
  const count = `${plural(rows.length, 'movimiento', 'movimientos')} · ${noun}`
  if (!type) {
    const net = round2(rows.reduce((sum, tx) => sum + signedAmount(tx), 0))
    return { label: 'Neto del filtro', total: formatSignedMoney(net, currency), count }
  }
  const total = round2(rows.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0))
  return { label: 'Total filtrado', total: formatMoney(total, currency), count }
}

export interface BreakdownRow {
  name: string
  amount: string
  share: string
  /** Bar width, 0–100. */
  width: number
}

export interface Breakdown {
  title: string
  rows: BreakdownRow[]
}

const BREAKDOWN_TITLE: Record<TransactionType, string> = {
  expense: 'Gastos por categoría',
  income: 'Ingresos por categoría',
  saving: 'Ahorros por categoría',
  investment: 'Inversión por categoría',
}

/** The month's movements of one type by category, largest first: the chosen type, or expenses. */
export function categoryBreakdown(
  rows: Transaction[],
  types: string[],
  currency = 'EUR',
): Breakdown {
  const type = chosenType(types) ?? 'expense'
  const totals = new Map<string, number>()
  rows.forEach((tx) => {
    if (tx.type !== type) return
    const name = tx.category || 'Sin categoría'
    totals.set(name, (totals.get(name) ?? 0) + Math.abs(Number(tx.amount) || 0))
  })
  const total = Array.from(totals.values()).reduce((sum, amount) => sum + amount, 0)
  return {
    title: BREAKDOWN_TITLE[type],
    rows: Array.from(totals, ([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'))
      .map(({ name, amount }) => {
        const share = total > 0 ? (amount / total) * 100 : 0
        return {
          name,
          amount: formatMoney(round2(amount), currency),
          share: formatPercent(share, { digits: 1 }),
          width: Math.round(share * 10) / 10,
        }
      }),
  }
}

/** What the empty ledger says: nothing this year, or nothing that matches. */
export function emptyLedgerText(year: number, yearCount: number): string {
  return yearCount
    ? `Ningún movimiento de ${year} coincide con estos filtros.`
    : `Aún no hay movimientos en ${year}.`
}

export interface DetailField {
  label: string
  value: string
}

export interface BudgetUse {
  title: string
  text: string
  /** Bar width, 0–100. */
  width: number
  over: boolean
}

export interface MovementDetail {
  title: string
  kicker: string
  amount: string
  tone: AmountTone
  fields: DetailField[]
  budget: BudgetUse | null
  sameTitle: string
  same: DetailField[]
}

export interface DetailContext {
  currency: string
  accountName: (id: string) => string
  /** The planned amount of the movement's category for its month, or 0. */
  plannedFor: (tx: Transaction) => number
}

/**
 * The detail of one movement: its data, how far its category went against the
 * budget that month (expenses with a budget) and the latest movements with the
 * same description.
 */
export function movementDetail(
  tx: Transaction,
  all: Transaction[],
  context: DetailContext,
): MovementDetail {
  const fields: DetailField[] = [
    { label: 'Fecha', value: formatLongDate(tx.date) },
    {
      label: tx.type === 'saving' ? 'Cuenta origen' : 'Cuenta',
      value: context.accountName(tx.accountId),
    },
  ]
  if (tx.type === 'saving' && tx.destinationAccountId) {
    fields.push({ label: 'Cuenta destino', value: context.accountName(tx.destinationAccountId) })
  }
  fields.push(
    { label: 'Categoría', value: tx.category || 'Sin categoría' },
    { label: 'Tipo', value: TYPE_LABEL[tx.type] },
  )
  const dateMonth = Number(tx.date.slice(5, 7))
  if (dateMonth && dateMonth !== Number(tx.month)) {
    fields.push({ label: 'Cuenta en el mes', value: formatMonthName(tx.month) })
  }

  let budget: BudgetUse | null = null
  const planned = tx.type === 'expense' ? context.plannedFor(tx) : 0
  if (planned > 0) {
    const year = tx.date.slice(0, 4)
    const spent = round2(
      all
        .filter(
          (other) =>
            other.type === 'expense' &&
            other.category === tx.category &&
            Number(other.month) === Number(tx.month) &&
            other.date.slice(0, 4) === year,
        )
        .reduce((sum, other) => sum + Math.abs(Number(other.amount) || 0), 0),
    )
    budget = {
      title: `${tx.category} · ${formatMonthName(tx.month).toLowerCase()}`,
      text: `${formatMoney(spent, context.currency)} de ${formatMoney(planned, context.currency)}`,
      width: Math.min(100, Math.round((spent / planned) * 100)),
      over: spent > planned,
    }
  }

  const description = tx.description.trim()
  const same = description
    ? all
        .filter((other) => other.id !== tx.id && other.description.trim() === description)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3)
        .map((other) => ({
          label: formatLongDate(other.date),
          value: movementAmount(other, context.currency),
        }))
    : []

  return {
    title: tx.description || tx.category || 'Movimiento',
    kicker: TYPE_LABEL[tx.type],
    amount: movementAmount(tx, context.currency),
    tone: amountTone(tx.type),
    fields,
    budget,
    sameTitle: `Más de ${description}`,
    same,
  }
}

// --- Selection and bulk actions ---------------------------------------------

/** Ids of every row the ledger shows, in order: what «Seleccionar todo» picks. */
export function shownIds(months: readonly LedgerMonthView[]): string[] {
  return months.flatMap((month) => month.days.flatMap((day) => day.rows.map((row) => row.id)))
}

/** The bulk bar's count and the signed sum of the selection. */
export function selectionSummary(
  selected: readonly Transaction[],
  currency: string,
): { count: string; sum: string } {
  const sum = round2(selected.reduce((total, tx) => total + signedAmount(tx), 0))
  return {
    count: plural(selected.length, 'seleccionado', 'seleccionados'),
    sum: formatSignedMoney(sum, currency),
  }
}

/**
 * Types a selection can change to. Not «Ahorro»: a saving needs a destination
 * account, so it is edited one by one.
 */
export const BULK_TYPES: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'investment', label: 'Inversión' },
]

/**
 * The type whose categories the bulk bar offers: the new type, or the one every
 * selected movement shares; null when they mix types and none is chosen.
 */
export function bulkCategoryType(
  selected: readonly Transaction[],
  newType: TransactionType | '',
): TransactionType | null {
  if (newType) return newType
  const types = new Set(selected.map((tx) => tx.type))
  return types.size === 1 ? [...types][0] : null
}
