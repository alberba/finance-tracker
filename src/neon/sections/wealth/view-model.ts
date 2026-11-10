import type { SnapshotCommitEdit, SnapshotField } from '../../../composables/useSnapshotEdit'
import {
  GROUP_SIGN,
  snapshotKey,
  type SnapshotGroupViewModel,
  type WealthViewModel,
} from '../../../domain/wealth/view-model'
import {
  formatCompactMoney,
  formatMoney,
  formatMonthName,
  formatNumber,
  formatWholeAmount,
  formatPercent,
  formatSignedMoney,
} from '../../../lib/format'
import { atMonth, monthIndex, type Month } from '../../../lib/month'
import { round2 } from '../../../lib/number'
import type { SnapshotKind } from '../../../scripts/types'

// Patrimonio in the new design (artboard «Patrimonio · 2560 px», #435): the
// cover (balance equation, month close, how it went, where it is, what you
// have), the detail of one account and «Balance por meses», where a month is
// closed. Pure functions over the shared wealth view-model; a month's values
// are those of `history`, whose debt reads negative.

export interface MonthTotals {
  accounts: number
  investments: number
  /** The debt, as a positive amount. */
  liabilities: number
  net: number
}

/** The group names of the new design («Liquidez» and «Deuda» in the old one). */
export const GROUP_TITLE: Record<SnapshotKind, string> = {
  accounts: 'Efectivo',
  investments: 'Inversión',
  liabilities: 'Pasivos',
}

const GROUP_UNIT: Record<SnapshotKind, [string, string]> = {
  accounts: ['cuenta', 'cuentas'],
  investments: ['activo', 'activos'],
  liabilities: ['pasivo', 'pasivos'],
}

function countOf(kind: SnapshotKind, count: number): string {
  return `${count} ${GROUP_UNIT[kind][count === 1 ? 0 : 1]}`
}

function share(part: number, whole: number): string {
  return whole > 0 && part > 0 ? formatPercent((part / whole) * 100, { digits: 0 }) : '—'
}

function column(view: WealthViewModel, month: Month): number {
  return view.history.months.indexOf(month)
}

function groupValue(view: WealthViewModel, kind: SnapshotKind, month: Month): number {
  const row = view.history.rows.find((entry) => entry.kind === 'group' && entry.group === kind)
  const index = column(view, month)
  return row && index >= 0 ? row.values[index] : 0
}

/** Cash plus investment minus debt, at the end of `month`. */
export function monthTotals(view: WealthViewModel, month: Month): MonthTotals {
  const accounts = groupValue(view, 'accounts', month)
  const investments = groupValue(view, 'investments', month)
  const liabilities = round2(-groupValue(view, 'liabilities', month))
  return { accounts, investments, liabilities, net: round2(accounts + investments - liabilities) }
}

/** A month is closed once it stores a balance: «Marzo cerrado», «Abril sin cerrar». */
export function closeStatus(
  view: WealthViewModel,
  month: Month,
): { closed: boolean; text: string } {
  const closed = atMonth(view.months, month).saved
  return { closed, text: `${formatMonthName(month)} ${closed ? 'cerrado' : 'sin cerrar'}` }
}

export type EvolutionPeriod = 'month' | 'quarter'
export type EvolutionKind = 'line' | 'bars'

export interface EvolutionPoint {
  month: Month
  /** «Ene», «T2». */
  label: string
  /** The value in short under the label, when there are few points; empty otherwise. */
  sub: string
  value: number
  /** The month has no stored balance yet: the dot or bar is hollow. */
  open: boolean
  /** Position in the plot, in percent: x from the left, y from the top. */
  x: number
  y: number
}

export interface EvolutionChart {
  points: EvolutionPoint[]
  ticks: { top: number; label: string }[]
  /** «+600,00 € desde enero. El último dato aún no está cerrado.» */
  note: string
  /** What the chart says, for a screen reader. */
  label: string
}

const SHORT_SUBS_UP_TO = 8
const MAX_STEPS = 4

/** The smallest round step (1, 2, 2.5 or 5 times a power of ten) that spans lo–hi in four. */
function scale(
  min: number,
  max: number,
  fromZero: boolean,
): { lo: number; hi: number; step: number } {
  const span = Math.max(max - (fromZero ? Math.min(0, min) : min), 1)
  let power = 10 ** Math.floor(Math.log10(span / MAX_STEPS))
  for (;;) {
    for (const factor of [1, 2, 2.5, 5]) {
      const step = factor * power
      const lo = fromZero && min >= 0 ? 0 : Math.floor(min / step) * step
      let hi = Math.ceil(max / step) * step
      if (hi === lo) hi = lo + step
      if ((hi - lo) / step <= MAX_STEPS) return { lo, hi, step }
    }
    power *= 10
  }
}

/** The net worth at the close of each month (or quarter) of the year so far. */
export function evolution(
  view: WealthViewModel,
  period: EvolutionPeriod,
  kind: EvolutionKind,
): EvolutionChart {
  const months = view.history.months
  const last = months[months.length - 1]
  const shown = months.filter((month) =>
    period === 'month' ? true : month % 3 === 0 || month === last,
  )
  const values = shown.map((month) => monthTotals(view, month).net)
  if (!shown.length) return { points: [], ticks: [], note: '', label: '' }

  const { lo, hi, step } = scale(Math.min(...values), Math.max(...values), kind === 'bars')
  const y = (value: number) => 100 - ((value - lo) / (hi - lo)) * 100
  const ticks: EvolutionChart['ticks'] = []
  for (let value = lo; value <= hi + step / 2; value += step) {
    ticks.push({ top: y(value), label: formatCompactMoney(value) })
  }
  const width = 100 / shown.length
  const labelOf = (month: Month) =>
    period === 'month'
      ? formatMonthName(month).slice(0, 3)
      : `T${Math.floor(monthIndex(month) / 3) + 1}`
  const points = shown.map((month, index) => ({
    month,
    label: labelOf(month),
    sub: shown.length <= SHORT_SUBS_UP_TO ? formatCompactMoney(values[index]) : '',
    value: values[index],
    open: !atMonth(view.months, month).saved,
    x: (index + 0.5) * width,
    y: y(values[index]),
  }))

  const first = points[0]
  const latest = points[points.length - 1]
  const firstName = period === 'month' ? formatMonthName(first.month).toLowerCase() : first.label
  const note =
    `${formatSignedMoney(latest.value - first.value)} desde ${firstName}.` +
    (latest.open ? ' El último dato aún no está cerrado.' : '')
  const label =
    `Patrimonio por ${period === 'month' ? 'mes' : 'trimestre'}: ` +
    points
      .map((point) => {
        const name = period === 'month' ? formatMonthName(point.month).toLowerCase() : point.label
        return `${name} ${formatMoney(point.value)}`
      })
      .join(', ')
  return { points, ticks, note, label }
}

export type MixTone = 'lilac' | 'lilac2' | 'lilac3' | 'peach'

export interface MixSegment {
  name: string
  /** The group it belongs to, or how many the «Resto» folds. */
  note: string
  value: string
  /** «55 %». */
  pct: string
  /** Its weight, for the width of its piece of the bar. */
  weight: number
  tone: MixTone
}

const MIX_TONES: MixTone[] = ['lilac', 'lilac2', 'lilac3', 'peach']
const MIX_SHOWN = 3

/** «Dónde está»: what each asset weighs in the total, the three biggest and the rest. */
export function composition(
  view: WealthViewModel,
  month: Month,
): { segments: MixSegment[]; note: string; label: string } {
  const index = column(view, month)
  const assets = view.history.rows
    .filter((row) => row.kind === 'item' && row.group !== 'liabilities')
    .map((row) => ({ name: row.label, group: row.group!, value: row.values[index] ?? 0 }))
    .filter((asset) => asset.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = round2(assets.reduce((sum, asset) => sum + asset.value, 0))
  if (!assets.length)
    return { segments: [], note: 'Todavía no tienes activos con saldo.', label: '' }

  const head = assets.length > MIX_SHOWN + 1 ? assets.slice(0, MIX_SHOWN) : assets
  const rest = assets.slice(head.length)
  const parts = head.map((asset) => ({
    name: asset.name,
    note: GROUP_TITLE[asset.group],
    value: asset.value,
  }))
  if (rest.length) {
    parts.push({
      name: 'Resto',
      note: `${rest.length} cuentas o activos`,
      value: round2(rest.reduce((sum, asset) => sum + asset.value, 0)),
    })
  }
  const segments = parts.map((part, i) => ({
    name: part.name,
    note: part.note,
    value: formatMoney(part.value),
    pct: share(part.value, total),
    weight: total > 0 ? part.value / total : 0,
    tone: MIX_TONES[i],
  }))
  const top = segments[0]
  return {
    segments,
    note: `${formatMoney(total)} en activos. ${top.name} pesa más: ${top.pct}.`,
    label: `Reparto de los activos: ${segments.map((s) => `${s.name} ${s.pct}`).join(', ')}`,
  }
}

export interface HoldingRow {
  id: string
  kind: SnapshotKind
  name: string
  /** «Apuntado en marzo» or «Calculado con tus movimientos». */
  note: string
  value: string
  /** Weight within its group. */
  share: string
  /** Nothing in it: the figure goes muted. */
  empty: boolean
}

export interface HoldingGroup {
  kind: SnapshotKind
  title: string
  /** The group total; debt reads negative. */
  total: string
  count: string
  rows: HoldingRow[]
}

/** «Lo que tienes»: each group with its accounts at the month of `view`. */
export function holdings(view: WealthViewModel, month: Month): HoldingGroup[] {
  const monthName = formatMonthName(month).toLowerCase()
  return view.groups.map((group) => {
    const values = group.rows.map((row) => row.snapshot ?? row.calculated)
    const total = round2(values.reduce((sum, value) => sum + value, 0))
    const sign = GROUP_SIGN[group.kind]
    return {
      kind: group.kind,
      title: GROUP_TITLE[group.kind],
      total: formatMoney(sign * total),
      count: countOf(group.kind, group.rows.length),
      rows: group.rows.map((row, i) => ({
        id: row.id,
        kind: group.kind,
        name: row.name,
        note: row.snapshot === null ? 'Calculado con tus movimientos' : `Apuntado en ${monthName}`,
        value: formatMoney(sign * values[i]),
        share: share(values[i], total),
        empty: values[i] === 0,
      })),
    }
  })
}

export type FigureTone = 'gain' | 'loss' | 'muted' | 'plain'

export interface AccountDetail {
  name: string
  /** «Efectivo», over the name. */
  group: string
  value: string
  /** Against the month before; null in the first month. */
  delta: { text: string; note: string; tone: FigureTone } | null
  bars: { month: Month; label: string; aria: string; height: number; selected: boolean }[]
  tiles: { label: string; value: string; tone: FigureTone }[]
}

const BAR_FLOOR = 20

function figureTone(value: number): FigureTone {
  return value > 0 ? 'gain' : value < 0 ? 'loss' : 'muted'
}

/** One account, asset or debt month by month, read at `month`. */
export function accountDetail(
  view: WealthViewModel,
  kind: SnapshotKind,
  id: string,
  month: Month,
): AccountDetail | null {
  const row = view.history.rows.find((entry) => entry.key === snapshotKey(kind, id))
  const entity = view.groups.find((group) => group.kind === kind)?.rows.find((r) => r.id === id)
  const index = column(view, month)
  if (!row || !entity || index < 0) return null

  const values = row.values
  const current = values[index]
  const previous = index > 0 ? values[index - 1] : null
  const low = Math.min(...values)
  const high = Math.max(...values)
  const assets = monthTotals(view, month)
  const first = values[0]
  const firstName = formatMonthName(view.history.months[0]).toLowerCase()
  const change = first > 0 && index > 0 ? ((current - first) / first) * 100 : null

  return {
    name: row.label,
    group: GROUP_TITLE[kind],
    value: formatMoney(current),
    delta:
      previous === null
        ? null
        : {
            text: current === previous ? 'Sin cambios' : formatSignedMoney(current - previous),
            note: `desde ${formatMonthName(view.history.months[index - 1]).toLowerCase()}`,
            tone: figureTone(round2(current - previous)),
          },
    bars: view.history.months.map((entry, i) => ({
      month: entry,
      label: formatMonthName(entry).slice(0, 3),
      aria: `${formatMonthName(entry)}: ${formatMoney(values[i])}`,
      height:
        high > low
          ? Math.round(BAR_FLOOR + ((values[i] - low) / (high - low)) * (100 - BAR_FLOOR))
          : 60,
      selected: entry === month,
    })),
    tiles: [
      {
        label: 'Del patrimonio',
        value: kind === 'liabilities' ? '—' : share(current, assets.accounts + assets.investments),
        tone: 'plain',
      },
      {
        label: `Desde ${firstName}`,
        value: change === null ? '—' : formatPercent(change, { digits: 1, signed: true }),
        tone: change === null ? 'plain' : figureTone(round2(change)),
      },
      {
        label: 'Saldo inicial',
        value: formatMoney(GROUP_SIGN[kind] * entity.opening),
        tone: 'plain',
      },
    ],
  }
}

export interface LedgerRow {
  id: string
  kind: SnapshotKind
  name: string
  /** The month before, as it was kept; «—» in January. */
  prev: string
  /** The calculated balance, the hint of an empty field. */
  placeholder: string
  aria: string
}

/** The fields of «Cerrar {mes}», group by group. */
export function ledgerGroups(
  view: WealthViewModel,
  month: Month,
): { kind: SnapshotKind; title: string; count: string; rows: LedgerRow[] }[] {
  const index = column(view, month)
  const monthName = formatMonthName(month).toLowerCase()
  return view.groups.map((group) => ({
    kind: group.kind,
    title: GROUP_TITLE[group.kind],
    count: countOf(group.kind, group.rows.length),
    rows: group.rows.map((row) => {
      const history = view.history.rows.find((r) => r.key === snapshotKey(group.kind, row.id))
      const before = index > 0 ? history?.values[index - 1] : undefined
      return {
        id: row.id,
        kind: group.kind,
        name: row.name,
        prev: before === undefined ? '—' : formatMoney(GROUP_SIGN[group.kind] * before),
        placeholder: formatNumber(row.calculated, 2),
        aria: `Saldo de ${row.name} en ${monthName}`,
      }
    }),
  }))
}

/** The button and the line next to it at the foot of «Cerrar {mes}». */
export function closeAction({
  month,
  closed,
  changes,
  invalid,
}: {
  month: Month
  closed: boolean
  changes: number
  invalid: boolean
}): { label: string; text: string; locked: boolean } {
  const edited = `${changes} ${changes === 1 ? 'saldo editado' : 'saldos editados'}`
  const label = closed
    ? changes
      ? 'Guardar cambios'
      : 'Cerrado'
    : `Cerrar ${formatMonthName(month).toLowerCase()}`
  let text = closed
    ? changes
      ? `${edited}, sin guardar`
      : 'Cerrado con los saldos guardados'
    : changes
      ? `${edited}, sin cerrar`
      : 'Sin editar: se cierra con el saldo calculado'
  if (invalid) text = `Corrige los saldos no válidos para ${closed ? 'guardar' : 'cerrar el mes'}.`
  return { label, text, locked: closed && changes === 0 }
}

/**
 * Closing a month stores a balance for every row: what was typed, or the
 * calculated balance where the field was left empty. Null while a field is
 * not a number.
 */
export function closingEdits(
  groups: SnapshotGroupViewModel[],
  field: (kind: SnapshotKind, id: string) => SnapshotField | undefined,
): SnapshotCommitEdit[] | null {
  const edits: SnapshotCommitEdit[] = []
  for (const group of groups) {
    for (const row of group.rows) {
      const current = field(group.kind, row.id)
      if (current?.invalid) return null
      edits.push({ kind: group.kind, id: row.id, value: current?.effective ?? row.calculated })
    }
  }
  return edits
}

export interface MonthTableRow {
  key: string
  kind: 'group' | 'item' | 'total'
  group?: SnapshotKind
  label: string
  cells: { text: string; tone: FigureTone }[]
}

const FLAG_AMOUNT = 300
const FLAG_SHARE = 0.1

/**
 * «Balance por meses»: every account at the close of each month, in whole
 * euros. Color only for what stands out: a closed month that moves more than
 * 10 % and 300 € from the closed month before. An open month reads muted.
 */
export function monthTable(view: WealthViewModel): {
  months: { month: Month; short: string; closed: boolean; aria: string }[]
  rows: MonthTableRow[]
} {
  const closed = view.history.months.map((month) => atMonth(view.months, month).saved)
  const months = view.history.months.map((month, i) => ({
    month,
    short: formatMonthName(month).slice(0, 3),
    closed: closed[i],
    aria: `${formatMonthName(month)}, ${closed[i] ? 'cerrado' : 'sin cerrar'}`,
  }))
  const rows = view.history.rows.map((row) => ({
    key: row.key,
    kind: row.kind,
    group: row.group,
    label:
      row.kind === 'group' && row.group
        ? GROUP_TITLE[row.group]
        : row.kind === 'total'
          ? 'Patrimonio neto'
          : row.label,
    cells: row.values.map((value, i) => {
      let tone: FigureTone = closed[i] ? 'plain' : 'muted'
      if (i > 0 && closed[i] && closed[i - 1]) {
        const before = row.values[i - 1]
        const moved = value - before
        if (Math.abs(moved) >= FLAG_AMOUNT && Math.abs(moved) >= Math.abs(before) * FLAG_SHARE) {
          tone = moved > 0 ? 'gain' : 'loss'
        }
      }
      return { text: formatWholeAmount(value), tone }
    }),
  }))
  return { months, rows }
}

/** The month the cover talks about: the last one of the year reached so far. */
export function coverMonth(view: WealthViewModel): Month {
  return view.history.months[view.history.months.length - 1] ?? 1
}

/** «Octubre está sin cerrar» and how to close it, or where to look once closed. */
export function closeCard(
  view: WealthViewModel,
  month: Month,
): { title: string; note: string; action: string } {
  const name = formatMonthName(month)
  const lower = name.toLowerCase()
  return closeStatus(view, month).closed
    ? {
        title: `${name} está cerrado`,
        note: `Los saldos de ${lower} ya están apuntados. Puedes corregirlos o ver los meses anteriores.`,
        action: 'Ver balance por meses',
      }
    : {
        title: `${name} está sin cerrar`,
        note: 'Apunta el saldo real de cada cuenta a fin de mes para que el balance cuadre.',
        action: `Cerrar ${lower}`,
      }
}

/** «Saldos calculados a 10 de octubre.» while the month runs; its close otherwise. */
export function balanceDate(year: number, month: Month, today: Date): string {
  const lower = formatMonthName(month).toLowerCase()
  const running = today.getFullYear() === year && today.getMonth() + 1 === month
  return running
    ? `Saldos calculados a ${today.getDate()} de ${lower}.`
    : `Saldos al cierre de ${lower}.`
}
