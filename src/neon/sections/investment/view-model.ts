import {
  computeInvestedCapitalByAsset,
  computeInvestmentValue,
} from '../../../domain/investment/calculations'
import { getContributionEntriesFromSnapshots } from '../../../domain/investment/contributions'
import type { QuoteStatusSummary } from '../../../domain/investment/quote-status'
import type {
  InvestmentDashboardViewModel,
  ReturnMode,
} from '../../../domain/investment/view-model'
import {
  formatDecimal,
  formatMoney,
  formatMonthName,
  formatNumber,
  formatPercent,
  formatShortDate,
  formatSignedMoney,
  formatStamp,
  MINUS,
} from '../../../lib/format'
import {
  computeContributionMetrics,
  matchesInvestmentAsset,
  type ContributionEntry,
} from '../../../lib/finance-core'
import { ALL_MONTHS, YEAR_START, type Month, type MonthOrStart } from '../../../lib/month'
import { toSnapshotDate } from '../../../scripts/contribution-workflow'
import { niceStep } from '../../ui/line-chart'
import type { State } from '../../../scripts/types'
import { round2 } from '../../../scripts/utils'

// The cover of the new Inversión (artboard «Inversión · 2560 px», #437): what
// the portfolio is worth and how it has done in the period, its evolution, each
// position and the worst fall. Everything here is words and figures already
// formatted; the components only lay them out.

export type Tone = 'gain' | 'loss' | 'neutral'

/** Gain, loss or neither: a cent either way is still nothing. */
export function toneOf(value: number): Tone {
  return value > 0.005 ? 'gain' : value < -0.005 ? 'loss' : 'neutral'
}

/** The text colour of each tone. */
export const TONE_TEXT: Record<Tone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  neutral: 'text-text',
}

/** «+17,5 %»: the cover's percentages carry one decimal and always a sign. */
export function signedPct(value: number, digits = 1): string {
  return formatPercent(value, { digits, signed: true })
}

export interface PeriodFigure {
  key: 'return' | 'value' | 'invested'
  label: string
  value: string
  /** The gain in euros under the simple return; empty otherwise. */
  sub: string
  tone: Tone
}

/**
 * The strip over the chart: the return of the period (simple, with the gain
 * under it, or TWR), what the portfolio is worth and what went into it.
 * `latest` says the analysed month is the newest one, so the value is today's;
 * `twr` is the cumulative TWR at its close, from `twrSeries`.
 */
export function periodFigures(
  vm: InvestmentDashboardViewModel,
  method: ReturnMode,
  { latest, twr }: { latest: boolean; twr: number },
): PeriodFigure[] {
  const isSimple = method === 'simple'
  return [
    {
      key: 'return',
      label: isSimple ? 'Tu cartera' : 'Tu cartera · TWR',
      value: signedPct(isSimple ? vm.displayReturn : twr),
      sub: isSimple ? formatSignedMoney(vm.gain) : '',
      tone: toneOf(isSimple ? vm.gain : twr),
    },
    {
      key: 'value',
      label: latest ? 'Vale hoy' : `Valía a ${formatShortDate(vm.asOf)}`,
      value: formatMoney(vm.portfolioValue),
      sub: '',
      tone: 'neutral',
    },
    {
      key: 'invested',
      label: 'Has puesto',
      value: formatMoney(vm.investedCapital),
      sub: '',
      tone: 'neutral',
    },
  ]
}

const NBSP = '\u00a0'
const MONTH_ABBR = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/** The chart's view box: wide and low, with room on the right for the end labels. */
export const CHART_WIDTH = 1400
export const CHART_HEIGHT = 400
const PAD = { left: 70, right: 150, top: 24, bottom: 30 }
/** End labels closer than this (view box units) are pushed apart. */
const END_GAP = 46

/** Indices into the chart points of the worst fall: from its peak to its trough. */
export interface Drawdown {
  peak: number
  trough: number
  /** The first point back at the peak, or null while it hasn't recovered. */
  recovery: number | null
  /** The fall as a fraction: −0.12 for a 12 % fall. */
  depth: number
}

export interface ChartLine {
  key: 'value' | 'invested'
  d: string
  dashed: boolean
}

export interface PortfolioChart {
  viewBox: string
  /** Back to front: the invested capital under the portfolio. */
  lines: ChartLine[]
  /** Round values with their gridline; `top` is the share of the height from above (0–100). */
  grid: Array<{ value: number; top: number; text: string }>
  gridPath: string
  /** The zero line of the TWR view; null in euros. */
  zero: string | null
  /** Month under each month-end point; `left` is the share of the width (0–100). */
  months: Array<{ left: number; text: string }>
  /** What each line ends at, written after its last point. */
  ends: Array<{ name: string; figure: string; top: number; tone: 'value' | 'invested' }>
  /** Today's point of the portfolio line. */
  dot: { x: number; y: number }
  /** The trough of the worst fall, with the fall written under it. */
  drop: { x: number; y: number; left: number; top: number; text: string } | null
  /** What the chart says, for screen readers. */
  label: string
}

const round1 = (value: number) => Math.round(value * 10) / 10
const share = (value: number, total: number) => Math.round((value / total) * 10000) / 100

/** Where the axis values end and the end labels start, as a share of the width. */
export const AXIS_LABEL_LEFT = share(PAD.left - 8, CHART_WIDTH)
export const END_LABEL_LEFT = share(CHART_WIDTH - PAD.right + 14, CHART_WIDTH)

function axisText(value: number, method: ReturnMode): string {
  if (method === 'simple') return `${formatNumber(value, 0)}${NBSP}€`
  const sign = value > 0 ? '+' : value < 0 ? MINUS : ''
  return `${sign}${formatNumber(Math.abs(value), 0)}${NBSP}%`
}

/** What the chart draws: the portfolio and, in euros, what went into it. */
function chartSeries(
  vm: InvestmentDashboardViewModel,
  method: ReturnMode,
  twr: readonly number[],
): { value: readonly number[]; invested: readonly number[] | null } {
  return method === 'simple'
    ? { value: vm.valueSeries[0].values, invested: vm.valueSeries[1].values }
    : { value: twr, invested: null }
}

/**
 * The evolution of the period. In euros, what the portfolio is worth against
 * what went into it (dashed); in TWR, the cumulative return (`twrSeries`) over
 * the zero line. One point per month close, after the year's opening one.
 */
export function portfolioChart(
  vm: InvestmentDashboardViewModel,
  method: ReturnMode,
  twr: readonly number[],
  drawdown: Drawdown | null,
): PortfolioChart {
  const isSimple = method === 'simple'
  const { value, invested } = chartSeries(vm, method, twr)
  const all = [...value, ...(invested ?? []), ...(isSimple ? [] : [0])]
  let low = Math.min(...all)
  let high = Math.max(...all)
  const step = niceStep((high - low || Math.abs(high) || 1) / 4)
  low = Math.floor(low / step) * step
  high = Math.ceil(high / step) * step
  if (high === low) high = low + step
  if (isSimple) low = Math.max(0, low)

  const count = value.length
  const x = (index: number) =>
    round1(PAD.left + (count > 1 ? index / (count - 1) : 1) * (CHART_WIDTH - PAD.left - PAD.right))
  const y = (amount: number) =>
    round1(PAD.top + (1 - (amount - low) / (high - low)) * (CHART_HEIGHT - PAD.top - PAD.bottom))
  const path = (values: readonly number[]) =>
    values.map((amount, index) => `${index ? 'L' : 'M'}${x(index)} ${y(amount)}`).join(' ')
  const hLine = (amount: number) => `M${PAD.left} ${y(amount)} H${CHART_WIDTH - PAD.right}`

  const grid: PortfolioChart['grid'] = []
  for (let amount = low; amount <= high + step / 1000; amount += step) {
    const rounded = Math.round(amount * 1000) / 1000
    grid.push({
      value: rounded,
      top: share(y(rounded), CHART_HEIGHT),
      text: axisText(rounded, method),
    })
  }

  const last = count - 1
  const ends: Array<{ name: string; figure: string; y: number; tone: 'value' | 'invested' }> = [
    {
      name: 'Tu cartera',
      figure: isSimple ? formatMoney(vm.portfolioValue) : signedPct(value[last]),
      y: y(value[last]),
      tone: 'value',
    },
  ]
  if (invested) {
    ends.push({
      name: 'Has puesto',
      figure: formatMoney(vm.investedCapital),
      y: y(invested[last]),
      tone: 'invested',
    })
  }
  ends.sort((a, b) => a.y - b.y)
  for (let index = 1; index < ends.length; index++) {
    if (ends[index].y - ends[index - 1].y < END_GAP) ends[index].y = ends[index - 1].y + END_GAP
  }

  const lines: ChartLine[] = []
  if (invested) lines.push({ key: 'invested', d: path(invested), dashed: true })
  lines.push({ key: 'value', d: path(value), dashed: false })

  // The fall is measured on the TWR index: on the line in euros, contributions
  // would hide it, so only the TWR view marks it.
  const trough = !isSimple && drawdown && drawdown.trough < count ? drawdown.trough : null
  return {
    viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
    lines,
    grid,
    gridPath: grid.map((line) => hLine(line.value)).join(' '),
    zero: isSimple ? null : hLine(0),
    months: value.slice(1).map((_, index) => ({
      left: share(x(index + 1), CHART_WIDTH),
      text: MONTH_ABBR[index] ?? '',
    })),
    ends: ends.map((end) => ({
      name: end.name,
      figure: end.figure,
      top: share(end.y, CHART_HEIGHT),
      tone: end.tone,
    })),
    dot: { x: x(last), y: y(value[last]) },
    drop:
      trough === null || !drawdown
        ? null
        : {
            x: x(trough),
            y: y(value[trough]),
            left: share(x(trough), CHART_WIDTH),
            top: share(y(value[trough]) + 22, CHART_HEIGHT),
            text: signedPct(drawdown.depth * 100),
          },
    label: chartLabel(vm, method, value),
  }
}

/** What the evolution chart says, for screen readers. */
function chartLabel(
  vm: InvestmentDashboardViewModel,
  method: ReturnMode,
  value: readonly number[],
): string {
  const date = formatShortDate(vm.asOf)
  return method === 'simple'
    ? `Lo que vale tu cartera frente a lo que has puesto. A ${date} vale ${formatMoney(vm.portfolioValue)}.`
    : `Rentabilidad TWR acumulada de tu cartera a ${date}: ${signedPct(value[value.length - 1])}.`
}

/**
 * The mobile chart (DESIGN.md, «Gráfico de evolución · Móvil»): edge to edge,
 * 266 px tall, the line thick over an area that fades out, with no gridlines
 * and no figures beside it, and only months on the axis. Its view box is
 * stretched to its box, so units are px of height and a fraction of the
 * width (the line stops short of the right edge so today's dot isn't clipped); points that need to stay round (today's dot, the fall) are placed
 * by share and drawn in HTML.
 */
export const COMPACT_WIDTH = 400
export const COMPACT_HEIGHT = 266
const COMPACT_PAD = { top: 22, bottom: 38, right: 12 }
/** From this many months the axis writes every other one, so the labels don't touch. */
const COMPACT_DENSE = 6

export interface CompactChart {
  viewBox: string
  /** Back to front: the invested capital under the portfolio. */
  lines: ChartLine[]
  /** The portfolio line closed along the bottom, for the fading area. */
  area: string
  /** Month labels; `left` is the share of the width. */
  months: Array<{ left: number; text: string }>
  /** Today's point of the portfolio line, as shares of the width and the height. */
  dot: { left: number; top: number }
  /** The trough of the worst fall, with the fall written under it. */
  drop: { left: number; top: number; text: string } | null
  /** The dashed line needs a key; the TWR view has no second line. */
  hasInvested: boolean
  /** What the chart says, for screen readers. */
  label: string
}

export function compactChart(
  vm: InvestmentDashboardViewModel,
  method: ReturnMode,
  twr: readonly number[],
  drawdown: Drawdown | null,
): CompactChart {
  const isSimple = method === 'simple'
  const { value, invested } = chartSeries(vm, method, twr)
  const all = [...value, ...(invested ?? []), ...(isSimple ? [] : [0])]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || Math.abs(max) * 0.1 || 1
  const low = isSimple ? Math.max(0, min - span * 0.15) : min - span * 0.15
  const high = max + span * 0.1

  const count = value.length
  const x = (index: number) =>
    round1((count > 1 ? index / (count - 1) : 1) * (COMPACT_WIDTH - COMPACT_PAD.right))
  const y = (amount: number) =>
    round1(
      COMPACT_PAD.top +
        (1 - (amount - low) / (high - low)) *
          (COMPACT_HEIGHT - COMPACT_PAD.top - COMPACT_PAD.bottom),
    )
  const path = (values: readonly number[]) =>
    values.map((amount, index) => `${index ? 'L' : 'M'}${x(index)} ${y(amount)}`).join(' ')
  const wide = count - 1 > COMPACT_DENSE

  const last = count - 1
  const trough = !isSimple && drawdown && drawdown.trough < count ? drawdown.trough : null
  const lines: ChartLine[] = []
  if (invested) lines.push({ key: 'invested', d: path(invested), dashed: true })
  lines.push({ key: 'value', d: path(value), dashed: false })
  return {
    viewBox: `0 0 ${COMPACT_WIDTH} ${COMPACT_HEIGHT}`,
    lines,
    area: `${path(value)} L${x(last)} ${COMPACT_HEIGHT} L0 ${COMPACT_HEIGHT} Z`,
    months: value
      .slice(1)
      .map((_, index) => ({ index: index + 1, text: MONTH_ABBR[index] ?? '' }))
      .filter(({ index }) => !wide || (last - index) % 2 === 0)
      .map(({ index, text }) => ({ left: share(x(index), COMPACT_WIDTH), text })),
    dot: { left: share(x(last), COMPACT_WIDTH), top: share(y(value[last]), COMPACT_HEIGHT) },
    drop:
      trough === null || !drawdown
        ? null
        : {
            left: share(x(trough), COMPACT_WIDTH),
            top: share(y(value[trough]), COMPACT_HEIGHT),
            text: signedPct(drawdown.depth * 100),
          },
    hasInvested: invested !== null,
    label: chartLabel(vm, method, value),
  }
}

/** A fall counts from 5 % down; smaller ones are noise. */
const DRAWDOWN_THRESHOLD = 0.05

/**
 * The worst fall of the period on the TWR index, so contributions don't hide
 * it: from a peak to the lowest point before the index is back at that peak.
 * `cumulative` is the cumulative TWR in % per chart point.
 */
export function maxDrawdown(cumulative: readonly number[]): Drawdown | null {
  const index = cumulative.map((pct) => 1 + pct / 100)
  let worst: Drawdown | null = null
  let peak = 0
  let trough = 0
  const close = (recovery: number | null) => {
    const depth = (index[trough] - index[peak]) / index[peak]
    if (-depth > DRAWDOWN_THRESHOLD && (!worst || depth < worst.depth)) {
      worst = { peak, trough, recovery, depth }
    }
  }
  for (let point = 1; point < index.length; point++) {
    if (index[point] >= index[peak]) {
      if (trough !== peak) close(point)
      peak = trough = point
    } else if (index[point] < index[trough]) {
      trough = point
    }
  }
  if (trough !== peak) close(null)
  return worst
}

export interface CardRow {
  label: string
  value: string
  tone: Tone
}

/** «Caídas máximas»: the worst fall, what it meant in euros on the peak and its recovery. */
export function dropRows(drawdown: Drawdown | null, values: readonly number[]): CardRow[] {
  if (!drawdown) return [{ label: 'Sin caídas de más del 5 %', value: '—', tone: 'neutral' }]
  const months = drawdown.recovery === null ? null : drawdown.recovery - drawdown.peak
  return [
    { label: 'Peor caída', value: signedPct(drawdown.depth * 100), tone: 'loss' },
    {
      label: 'En euros',
      value: formatSignedMoney((values[drawdown.peak] ?? 0) * drawdown.depth),
      tone: 'loss',
    },
    {
      label: 'Recuperación',
      value: months === null ? 'Sin recuperar' : months === 1 ? '1 mes' : `${months} meses`,
      tone: 'neutral',
    },
  ]
}

export interface PositionRow {
  id: string
  name: string
  /** The ticker («VWCE»), when the asset has one. */
  symbol: string | null
  /** Units held, or null when the asset has no buy movements. */
  units: string | null
  /** «a 132,00 €»: the price those units are valued at. */
  price: string | null
  weight: string
  /** Share of the portfolio, 0–100, for the weight bar. */
  weightPct: number
  value: string
  gain: string
  ret: string
  tone: Tone
  /** `d` of the sparkline: the gain of the period, in a 120×36 box. */
  spark: string
  /** The return of the period: the change once what went in is discounted. */
  change: string
  changeTone: Tone
  sparkLabel: string
  openLabel: string
  gainValue: number
  changeValue: number
}

export const SPARK_WIDTH = 120
export const SPARK_HEIGHT = 36

function sparkPath(values: readonly number[]): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  return values
    .map((value, index) => {
      const x = round1((index / (values.length - 1)) * SPARK_WIDTH)
      const y = round1(SPARK_HEIGHT - 4 - ((value - min) / range) * (SPARK_HEIGHT - 8))
      return `${index ? 'L' : 'M'}${x} ${y}`
    })
    .join(' ')
}

/**
 * The positions of the analysed month, in the domain's order (by value). The
 * evolution is the period's: from the year's opening value, discounting what
 * went in since, so a purchase doesn't read as a gain.
 */
export function positionRows(
  state: State,
  vm: InvestmentDashboardViewModel,
  month: Month,
): PositionRow[] {
  const points: MonthOrStart[] = [YEAR_START, ...ALL_MONTHS.filter((m) => m <= month)]
  return vm.positions.map((position) => {
    const values = points.map((point) => computeInvestmentValue(state, position.id, point))
    const invested = points.map((point) => computeInvestedCapitalByAsset(state, position.id, point))
    const last = points.length - 1
    const flows = invested[last] - invested[0]
    const base = values[0] + Math.max(0, flows)
    const changeValue = base > 0 ? ((values[last] - values[0] - flows) / base) * 100 : 0
    const units = position.units !== null && position.units > 0 ? position.units : null
    const change = signedPct(changeValue)
    return {
      id: position.id,
      name: position.name,
      symbol: position.symbol,
      units: units === null ? null : formatDecimal(units),
      price: units === null ? null : `a ${formatMoney(position.value / units)}`,
      weight: formatPercent(position.weight, { digits: 1 }),
      weightPct: position.weight,
      value: formatMoney(position.value),
      gain: formatSignedMoney(position.gain),
      ret: signedPct(position.returnPct),
      tone: toneOf(position.gain),
      spark: sparkPath(values.map((value, index) => value - invested[index])),
      change,
      changeTone: toneOf(changeValue),
      sparkLabel: `${position.name}: ${change} en el periodo`,
      openLabel: `Ver ${position.name}`,
      gainValue: position.gain,
      changeValue,
    }
  })
}

export type SortKey = 'weight' | 'gain' | 'change'
export type SortDirection = 'desc' | 'asc'

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'weight', label: 'Peso' },
  { value: 'gain', label: 'Ganancia' },
  { value: 'change', label: '% cambio' },
]
export const DIRECTION_OPTIONS: ReadonlyArray<{ value: SortDirection; label: string }> = [
  { value: 'desc', label: 'De mayor a menor' },
  { value: 'asc', label: 'De menor a mayor' },
]

/** «Peso · mayor a menor», the sort button's label. */
export function sortLabel(key: SortKey, direction: SortDirection): string {
  const name = SORT_OPTIONS.find((option) => option.value === key)?.label ?? ''
  return `${name} · ${direction === 'asc' ? 'menor a mayor' : 'mayor a menor'}`
}

export function sortPositions(
  rows: readonly PositionRow[],
  key: SortKey,
  direction: SortDirection,
): PositionRow[] {
  const pick = (row: PositionRow) =>
    key === 'weight' ? row.weightPct : key === 'gain' ? row.gainValue : row.changeValue
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => sign * (pick(a) - pick(b)))
}

/**
 * «Comisiones»: what the year's investment movements paid in fees up to the
 * analysed month, and that against what went in.
 */
export function feeRows(state: State, month: Month, investedCapital: number): CardRow[] {
  const prefix = `${state.year}-`
  const fees = state.transactions
    .filter((tx) => tx.type === 'investment' && tx.date.startsWith(prefix) && tx.month <= month)
    .reduce((sum, tx) => sum + (Number(tx.fee) || 0), 0)
  return [
    { label: `Pagadas en ${state.year}`, value: formatMoney(round2(fees)), tone: 'neutral' },
    {
      label: 'Sobre lo aportado',
      value: investedCapital > 0 ? formatPercent((fees / investedCapital) * 100) : '—',
      tone: 'neutral',
    },
  ]
}

export interface QuoteNotice {
  /** Some quote is late: the figures use the last valid price. */
  late: boolean
  /** What the header shows next to the dot. */
  text: string
  /** The longer explanation, on hover. */
  title: string
}

/** «9 oct, 17:45» from a quote's instant. */
function quoteStamp(instant: string, timeZone?: string): string {
  const match = formatStamp(instant, timeZone).match(/^(\d+)\/(\d+), (.+)$/)
  if (!match) return ''
  return `${Number(match[1])} ${MONTH_ABBR[Number(match[2]) - 1]}, ${match[3]}`
}

/**
 * How fresh the prices are. Quotes are never real time: with every quote up to
 * date the header only says when the last one came; with any late, it warns
 * that the figures use the last valid price. Null without quotes.
 */
export function quoteNotice(
  summary: QuoteStatusSummary | null,
  timeZone?: string,
): QuoteNotice | null {
  if (!summary) return null
  const stamp = quoteStamp(summary.latest, timeZone)
  return summary.status === 'fresh'
    ? { late: false, text: stamp, title: `Cotizaciones del ${stamp}` }
    : {
        late: true,
        text: `Cotizaciones retrasadas · último precio del ${stamp}`,
        title: 'Alguna cotización llega con retraso: se muestra el último precio válido',
      }
}

export interface PeriodOption {
  value: Month
  label: string
  /** The newest month that can have data: its value is today's. */
  latest: boolean
}

/** The months the period can end at: up to today in the current year, all of a closed one. */
export function periodOptions(year: number, now: Date): PeriodOption[] {
  const last = year === now.getFullYear() ? now.getMonth() + 1 : 12
  const months = ALL_MONTHS.filter((month) => month <= last)
  return months.map((month) => ({
    value: month,
    label: formatMonthName(month),
    latest: month === months.at(-1),
  }))
}

export interface PositionDetail {
  figures: CardRow[]
  movements: Array<{ id: string; title: string; meta: string; amount: string }>
}

/** How many of a position's operations its detail lists. */
const DETAIL_MOVEMENTS = 12

/**
 * What a position's detail shows: its figures and its latest operations,
 * newest first. Null when the position is no longer in the portfolio.
 */
export function positionDetail(
  state: State,
  vm: InvestmentDashboardViewModel,
  positionId: string,
): PositionDetail | null {
  const position = vm.positions.find((candidate) => candidate.id === positionId)
  if (!position) return null
  const units = position.units !== null && position.units > 0 ? position.units : null
  const figures: CardRow[] = [
    { label: 'Valor', value: formatMoney(position.value), tone: 'neutral' },
    {
      label: 'Resultado',
      value: `${formatSignedMoney(position.gain)} · ${signedPct(position.returnPct)}`,
      tone: toneOf(position.gain),
    },
  ]
  if (units !== null)
    figures.push({ label: 'Títulos', value: formatDecimal(units), tone: 'neutral' })
  if (position.averagePrice !== null) {
    figures.push({
      label: 'Precio medio de compra',
      value: formatMoney(position.averagePrice),
      tone: 'neutral',
    })
  }
  figures.push(
    { label: 'Invertido', value: formatMoney(position.invested), tone: 'neutral' },
    {
      label: 'Peso en la cartera',
      value: formatPercent(position.weight, { digits: 1 }),
      tone: 'neutral',
    },
  )

  const asset = state.investmentAssets.find((candidate) => candidate.id === position.id)
  const movements = state.transactions
    .filter(
      (tx) => tx.type === 'investment' && !!asset && matchesInvestmentAsset(tx.category, asset),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? '')),
    )
    .slice(0, DETAIL_MOVEMENTS)
    .map((tx) => {
      const txUnits = Number(tx.units)
      const operation = tx.side === 'sell' ? 'Venta' : 'Compra'
      const fee = Number(tx.fee) || 0
      return {
        id: tx.id,
        title:
          tx.side && txUnits > 0
            ? `${operation} · ${formatDecimal(txUnits)} ${txUnits === 1 ? 'título' : 'títulos'}`
            : tx.description || operation,
        meta:
          fee > 0
            ? `${formatShortDate(tx.date)} · comisión ${formatMoney(fee)}`
            : formatShortDate(tx.date),
        amount: formatMoney(tx.amount),
      }
    })
  return { figures, movements }
}

/**
 * The cumulative TWR in % at the opening of the year and at each month close
 * up to `month`. A month without its own close keeps the last one before it,
 * so a close that wasn't recorded doesn't read as a fall to zero.
 */
export function twrSeries(state: State, month: Month): number[] {
  const metrics = computeContributionMetrics(
    getContributionEntriesFromSnapshots(state) as ContributionEntry[],
  )
  const dated = metrics.map((metric) => ({
    date: String(metric.portfolioDate || metric.date),
    pct: (metric.cumulativeReturn ?? 0) * 100,
  }))
  return [
    0,
    ...ALL_MONTHS.filter((m) => m <= month).map((m) => {
      const close = toSnapshotDate(state.year, m)
      return dated.filter((metric) => metric.date <= close).at(-1)?.pct ?? 0
    }),
  ]
}
