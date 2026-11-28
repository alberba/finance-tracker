import type { InvestmentEntryPreset } from '../../../composables/useEntrySheet'
import type { PositionEvolution } from '../../../domain/investment/position-evolution'
import type {
  AccountPosition,
  UninstrumentedHolding,
} from '../../../domain/investment/positions'
import type {
  InvestmentAccount,
  InvestmentDashboardViewModel,
} from '../../../domain/investment/view-model'
import { movementBelongsToInvestmentAsset } from '../../../lib/finance-core'
import {
  formatDayMonth,
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  formatShortDate,
  formatSignedMoney,
} from '../../../lib/format'
import type { State, Transaction } from '../../../scripts/types'
import { signedPct, sparkPath, toneOf, type Tone } from './view-model'

// The detail of an asset in Inversión (artboard «Inversión · detalle de
// activo (VWCE) · 2560 px», #439): what it is worth and how it did, its price
// against the operations that were made, a few figures and the operations
// themselves by year. Everything here is words and figures already formatted;
// the components only lay them out.
//
// The mobile frame asks for a compact chart (`{ compact: true }`, #440); the rest
// is the same detail.
//
// The app keeps no price history per asset, so the price line is drawn through
// what is known: the price of each operation and today's price (the position's
// value over its units).

export interface AssetFigure {
  key: 'value' | 'result' | 'invested' | 'weight'
  label: string
  value: string
  /** The result as a share of what went in, «+16,4 %». */
  note?: string
  tone: Tone
}

/** A point of the price line: an operation. */
export interface AssetPoint {
  /** Share of the width (0–100). */
  left: number
  /** Share of the height from above (0–100). */
  top: number
  x: number
  y: number
  /** The date of the operation. */
  date: string
  price: string
  /** Against the average buy price: «+4,2 % frente a tu media». */
  delta: string
  deltaTone: Tone
  /** «Compra del 3 mar 2026». */
  note: string
  operation: 'buy' | 'sell'
}

export interface AssetChart {
  viewBox: string
  line: string
  area: string
  /** The average buy price as a dashed line, when it is inside the range. */
  average: { d: string; top: number } | null
  /** Years (or months, in a short history) under the line. */
  ticks: Array<{ left: number; text: string }>
  /** From the oldest operation to the newest. */
  points: AssetPoint[]
  label: string
}

export interface AssetFact {
  label: string
  value: string
  note: string
  tone: Tone
}

/** «Tu posición» on the mobile frame: a few rows and a ring of its weight. */
export interface AssetPosition {
  rows: AssetFact[]
  ring: {
    /** Weight in the portfolio, 0–100. */
    share: number
    /** Whole euros, to fit inside the ring: «1.980 €». */
    value: string
    weight: string
    label: string
  }
}

export interface AssetMovementRow {
  id: string
  /** «15 feb». */
  day: string
  side: 'buy' | 'sell' | null
  /** «Compra», «Venta» or, for a movement without operation, its description. */
  operation: string
  fee: string
  /** A fee was charged: «Sin comisión» is not worth a line of its own. */
  feeCharged: boolean
  /** «10 × 120,00 €». */
  quantity: string
  total: string
}

export interface AssetYear {
  year: string
  /** «Comprado 2.200,00 € · Vendido +300,00 €». */
  sum: string
  rows: AssetMovementRow[]
}

/** One position of the account: an instrument and what is held of it. */
export interface PositionLine {
  instrumentId: string
  symbol: string
  /** «2», units held. */
  units: string
  /** The average buy price, or «—» without buys. */
  averagePrice: string
  value: string
  invested: string
  /** «+160,00 €». */
  gain: string
  /** «+4,0 %». */
  ret: string
  tone: Tone
  weight: string
  /** Share of the account's positions, 0–100, for the weight bar. */
  weightPct: number
  /** The value is an estimate: the instrument has no quote. */
  estimated: boolean
  /** Month by month value of the position; null while it is not known or has no two points. */
  evolution: PositionEvolutionLine | null
}

/** The monthly evolution of a position, drawn as a line in the sparkline's box. */
export interface PositionEvolutionLine {
  /** `d` of the line. */
  path: string
  /** «Evolución de BTC: de 1.900,00 € en ene a 10.000,00 € en mar». */
  label: string
  /** The line is a share of the account's value: the instrument has no quote history. */
  approximate: boolean
}

/** What the account holds with no instrument: movements without units and the opening balance. */
export interface UninstrumentedLine {
  value: string
  invested: string
  /** «−20,00 €». */
  gain: string
  /** «−10,0 %». */
  ret: string
  tone: Tone
}

export interface AssetDetail {
  id: string
  name: string
  /** What the account holds, by value. */
  positions: PositionLine[]
  /** The «Sin instrumento» row of the positions; null when it is negligible. */
  uninstrumented: UninstrumentedLine | null
  /** Some position has no quote: its value is its share of the account's. */
  unpricedNote: string | null
  figures: AssetFigure[]
  chart: AssetChart | null
  facts: AssetFact[]
  /** The units held, «15» and «títulos»; null for an asset without units. */
  units: { count: string; word: string } | null
  position: AssetPosition
  count: string
  years: AssetYear[]
  /** What Comprar / Vender start with: the symbol, and the category, broker and currency of the last movement. */
  entry: Omit<InvestmentEntryPreset, 'side'>
}

interface ChartFrame {
  width: number
  height: number
  pad: { left: number; right: number; top: number; bottom: number }
}

/** The desktop chart, beside «En cifras». */
const WIDE: ChartFrame = {
  width: 880,
  height: 280,
  pad: { left: 8, right: 24, top: 16, bottom: 28 },
}
/** The mobile chart, edge to edge under the price (artboard «… móvil · Pixel 10»). */
const COMPACT: ChartFrame = {
  width: 412,
  height: 266,
  pad: { left: 14, right: 14, top: 24, bottom: 34 },
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100
const share = (value: number, total: number) => Math.round((value / total) * 10000) / 100

export function isOperation(tx: Transaction): boolean {
  return !!tx.side && Number(tx.units) > 0
}

/** Newest first: by date, then by time. */
export function newestFirst(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? ''))
}

/** The asset's movements, newest first. */
function assetMovements(state: State, position: InvestmentAccount): Transaction[] {
  const asset = state.investmentAssets.find((candidate) => candidate.id === position.id)
  if (!asset) return []
  return state.transactions
    .filter(
      (tx): tx is Transaction =>
        tx.type === 'investment' &&
        movementBelongsToInvestmentAsset(tx, asset, state.investmentAssets, state.instruments),
    )
    .sort(newestFirst)
}

function movementRow(tx: Transaction): AssetMovementRow {
  const operation = isOperation(tx)
  const sell = tx.side === 'sell'
  const amount = Math.abs(Number(tx.amount) || 0)
  const fee = Number(tx.fee) || 0
  const units = Number(tx.units)
  const title = operation ? (sell ? 'Venta' : 'Compra') : tx.description || 'Movimiento'
  const total = sell ? `+${formatMoney(amount)}` : formatMoney(amount)
  const day = formatDayMonth(tx.date)
  return {
    id: tx.id,
    day,
    side: operation ? (sell ? 'sell' : 'buy') : null,
    operation: title,
    fee: operation ? (fee > 0 ? `Comisión ${formatMoney(fee)}` : 'Sin comisión') : '',
    feeCharged: operation && fee > 0,
    quantity: operation
      ? `${formatDecimal(units)} × ${formatMoney(Number(tx.unitPrice) || 0)}`
      : '',
    total,
  }
}

function yearSum(movements: readonly Transaction[]): string {
  let bought = 0
  let sold = 0
  for (const tx of movements) {
    const amount = Math.abs(Number(tx.amount) || 0)
    if (tx.side === 'sell') sold += amount
    else bought += amount
  }
  return [
    bought > 0 ? `Comprado ${formatMoney(round2(bought))}` : '',
    sold > 0 ? `Vendido +${formatMoney(round2(sold))}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function groupByYear(movements: readonly Transaction[]): AssetYear[] {
  const years: Array<{ year: string; movements: Transaction[] }> = []
  for (const tx of movements) {
    const year = tx.date.slice(0, 4)
    const last = years.at(-1)
    if (last?.year === year) last.movements.push(tx)
    else years.push({ year, movements: [tx] })
  }
  return years.map(({ year, movements: group }) => ({
    year,
    sum: yearSum(group),
    rows: group.map(movementRow),
  }))
}

function parseDay(isoDate: string): number {
  return Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)
}

function tickLabels(first: number, last: number): Array<{ time: number; text: string }> {
  const start = new Date(first)
  const end = new Date(last)
  const spanYears = end.getUTCFullYear() - start.getUTCFullYear()
  const ticks: Array<{ time: number; text: string }> = []
  if (spanYears >= 1) {
    const step = spanYears > 6 ? 2 : 1
    for (let year = start.getUTCFullYear() + 1; year <= end.getUTCFullYear(); year += step) {
      ticks.push({ time: Date.UTC(year, 0, 1), text: String(year) })
    }
    return ticks
  }
  for (let month = start.getUTCMonth() + 1; ; month++) {
    const time = Date.UTC(start.getUTCFullYear(), month, 1)
    if (time > last) break
    ticks.push({ time, text: MONTHS[new Date(time).getUTCMonth()] })
  }
  return ticks
}

/**
 * The price line: one point per operation, over time, ending at the newest.
 * There is no point for today: the asset's value divided by its units is not a
 * price (a movement without units inflates it), and the symbol's quote is not
 * shown yet (#524). Null without two operations on different days.
 */
export function assetChart(
  account: Pick<InvestmentAccount, 'name'>,
  average: number | null,
  movements: readonly Transaction[],
  frame: ChartFrame = WIDE,
): AssetChart | null {
  const { width, height, pad: inset } = frame
  const operations = movements
    .filter((tx) => isOperation(tx) && Number(tx.unitPrice) > 0)
    .map((tx) => ({ tx, time: parseDay(tx.date), price: Number(tx.unitPrice) }))
    .sort((a, b) => a.time - b.time)
  if (!operations.length) return null
  const last = operations.at(-1)!
  const end = last.time
  if (end <= operations[0].time) return null

  const sequence = operations
  const prices = sequence.map((point) => point.price)
  let low = Math.min(...prices, average ?? Infinity)
  let high = Math.max(...prices, average ?? -Infinity)
  const pad = (high - low) * 0.08 || high * 0.05 || 1
  low -= pad
  high += pad
  // Two nearly equal prices must not read as a wild swing: keep a minimum span.
  const minSpan = last.price * 0.4
  if (high - low < minSpan) {
    const middle = (high + low) / 2
    low = middle - minSpan / 2
    high = middle + minSpan / 2
  }

  const first = operations[0].time
  const plotWidth = width - inset.left - inset.right
  const plotHeight = height - inset.top - inset.bottom
  const x = (time: number) => round1(inset.left + ((time - first) / (end - first)) * plotWidth)
  const y = (price: number) => round1(inset.top + (1 - (price - low) / (high - low)) * plotHeight)

  const line = sequence
    .map((point, index) => `${index ? 'L' : 'M'}${x(point.time)} ${y(point.price)}`)
    .join(' ')
  const baseline = height - inset.bottom
  const area = `${line} L${x(end)} ${baseline} L${x(first)} ${baseline} Z`

  const points = sequence.map<AssetPoint>((point) => {
    const versusAverage = average ? (point.price / average - 1) * 100 : 0
    const side = point.tx.side === 'sell' ? 'sell' : 'buy'
    return {
      x: x(point.time),
      y: y(point.price),
      left: share(x(point.time), width),
      top: share(y(point.price), height),
      date: formatShortDate(point.tx.date),
      price: formatMoney(round2(point.price)),
      delta: average ? `${signedPct(versusAverage)} frente a tu media` : '',
      deltaTone: toneOf(versusAverage),
      note: side === 'sell' ? 'Venta' : 'Compra',
      operation: side,
    }
  })

  const averageInside = average !== null && average > low && average < high
  const history = `${formatShortDate(operations[0].tx.date)} – ${formatShortDate(last.tx.date)}`
  return {
    viewBox: `0 0 ${width} ${height}`,
    line,
    area,
    average: averageInside
      ? {
          d: `M${inset.left} ${y(average)} H${width - inset.right}`,
          top: share(y(average), height),
        }
      : null,
    ticks: tickLabels(first, end).map(({ time, text }) => ({
      left: share(x(time), width),
      text,
    })),
    points,
    label: `Precio de ${account.name} (${history}): ${formatMoney(round2(operations[0].price))} en la primera operación y ${formatMoney(round2(last.price))} en la última, con ${operations.length} ${operations.length === 1 ? 'operación marcada' : 'operaciones marcadas'}.`,
  }
}

function assetFacts(average: number | null, movements: readonly Transaction[]): AssetFact[] {
  const operations = movements.filter(isOperation)
  const buys = operations.filter((tx) => tx.side !== 'sell')
  const fees = movements.reduce((sum, tx) => sum + (Number(tx.fee) || 0), 0)
  const facts: AssetFact[] = []
  const fact = (label: string, value: string, note = '', tone: Tone = 'neutral') =>
    facts.push({ label, value, note, tone })

  if (average !== null) fact('Precio medio de compra', formatMoney(average))
  const firstBuy = buys.at(-1)
  if (firstBuy) fact('Primera compra', formatShortDate(firstBuy.date))
  fact('Comisiones pagadas', formatMoney(round2(fees)))
  return facts
}

/** The units of an account that holds one instrument; with several there is no single count. */
function unitsHeld(single: AccountPosition | null): AssetDetail['units'] {
  return single
    ? { count: formatDecimal(single.units), word: single.units === 1 ? 'título' : 'títulos' }
    : null
}

function evolutionLine(evolution: PositionEvolution | undefined): PositionEvolutionLine | null {
  if (!evolution) return null
  const { values } = evolution
  const start = values.findIndex((value) => value > 0)
  if (start < 0 || values.length < 2) return null
  const month = (index: number) => (index === 0 ? 'dic' : MONTHS[index - 1])
  const last = values.length - 1
  const approximate = !evolution.priced
  return {
    path: sparkPath(values),
    approximate,
    label: `Evolución${approximate ? ' aproximada' : ''} de ${evolution.symbol}: de ${formatMoney(values[start])} en ${month(start)} a ${formatMoney(values[last])} en ${month(last)}`,
  }
}

function positionLine(position: AccountPosition, evolution: PositionEvolution[]): PositionLine {
  return {
    instrumentId: position.instrumentId,
    symbol: position.symbol,
    units: formatDecimal(position.units),
    averagePrice: position.averagePrice === null ? '—' : formatMoney(position.averagePrice),
    value: formatMoney(position.value),
    invested: formatMoney(position.invested),
    gain: formatSignedMoney(position.gain),
    ret: position.invested > 0 ? signedPct(position.returnPct) : '',
    tone: toneOf(position.gain),
    weight: formatPercent(position.weight, { digits: 1 }),
    weightPct: position.weight,
    estimated: !position.priced,
    evolution: evolutionLine(evolution.find((item) => item.instrumentId === position.instrumentId)),
  }
}

function uninstrumentedLine(holding: UninstrumentedHolding | undefined): UninstrumentedLine | null {
  if (!holding) return null
  const gain = round2(holding.value - holding.invested)
  return {
    value: formatMoney(holding.value),
    invested: formatMoney(holding.invested),
    gain: formatSignedMoney(gain),
    ret: holding.invested > 0 ? signedPct((gain / holding.invested) * 100) : '',
    tone: toneOf(gain),
  }
}

function assetPosition(position: InvestmentAccount, average: number | null): AssetPosition {
  const weight = formatPercent(position.weight, { digits: 1 })
  const rows: AssetFact[] = []
  if (average !== null) {
    rows.push({
      label: 'Precio medio',
      value: formatMoney(average),
      note: '',
      tone: 'neutral',
    })
  }
  rows.push(
    {
      label: 'Resultado',
      value: formatSignedMoney(position.gain),
      note: position.invested > 0 ? signedPct(position.returnPct) : '',
      tone: toneOf(position.gain),
    },
    { label: 'Has puesto', value: formatMoney(position.invested), note: '', tone: 'neutral' },
  )
  return {
    rows,
    ring: {
      share: round2(Math.min(100, Math.max(0, position.weight))),
      value: `${formatNumber(Math.round(position.value))}\u00a0€`,
      weight,
      label: `${formatMoney(position.value)}, el ${weight} de la cartera`,
    },
  }
}

/**
 * What an asset's detail shows. Null when the position is no longer in the
 * portfolio.
 */
export function assetDetail(
  state: State,
  vm: InvestmentDashboardViewModel,
  positionId: string,
  {
    compact = false,
    evolution = [],
  }: { compact?: boolean; evolution?: PositionEvolution[] } = {},
): AssetDetail | null {
  const position = vm.accounts.find((candidate) => candidate.id === positionId)
  if (!position) return null
  const positions = vm.positions.filter((held) => held.accountId === position.id)
  const single = positions.length === 1 ? positions[0] : null
  const average = single?.averagePrice ?? null
  const movements = assetMovements(state, position)
  const operationCount = movements.length
  const last = movements.find(isOperation) ?? movements[0]

  return {
    id: position.id,
    name: position.name,
    positions: positions.map((held) => positionLine(held, evolution)),
    uninstrumented: uninstrumentedLine(
      vm.uninstrumented.find((holding) => holding.accountId === position.id),
    ),
    unpricedNote: positions.some((held) => !held.priced)
      ? 'Sin cotización: el valor es la parte que le toca del valor de la cuenta.'
      : null,
    figures: [
      { key: 'value', label: 'Vale hoy', value: formatMoney(position.value), tone: 'neutral' },
      {
        key: 'result',
        label: 'Resultado',
        value: formatSignedMoney(position.gain),
        note: position.invested > 0 ? signedPct(position.returnPct) : '',
        tone: toneOf(position.gain),
      },
      {
        key: 'invested',
        label: 'Has puesto',
        value: formatMoney(position.invested),
        tone: 'neutral',
      },
      {
        key: 'weight',
        label: 'Peso en la cartera',
        value: formatPercent(position.weight, { digits: 1 }),
        tone: 'neutral',
      },
    ],
    chart: assetChart(position, average, movements, compact ? COMPACT : WIDE),
    facts: assetFacts(average, movements),
    units: unitsHeld(single),
    position: assetPosition(position, average),
    count: `${operationCount} ${operationCount === 1 ? 'operación' : 'operaciones'}`,
    entry: {
      symbol: last?.symbol ?? single?.symbol ?? '',
      category: last?.category ?? position.name,
      accountId: last?.accountId,
      destinationAccountId: position.id,
      currency: last?.movementCurrency,
    },
    years: groupByYear(movements),
  }
}
