import type {
  InvestmentDashboardViewModel,
  InvestmentPosition,
} from '../../../domain/investment/view-model'
import { matchesInvestmentAsset } from '../../../lib/finance-core'
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
import { signedPct, toneOf, type Tone } from './view-model'

// The detail of an asset in the new Inversión (artboard «Inversión · detalle de
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
  tone: Tone
}

/** A point of the price line: an operation, or today (`operation: null`). */
export interface AssetPoint {
  /** Share of the width (0–100). */
  left: number
  /** Share of the height from above (0–100). */
  top: number
  x: number
  y: number
  /** «Hoy», or the date of the operation. */
  date: string
  price: string
  /** Against the average buy price: «+4,2 % frente a tu media». */
  delta: string
  deltaTone: Tone
  /** «Compra del 3 mar 2026», empty for today. */
  note: string
  operation: 'buy' | 'sell' | null
  /** False for an operation not yet declared. */
  declared: boolean
}

export interface AssetChart {
  viewBox: string
  line: string
  area: string
  /** The average buy price as a dashed line, when it is inside the range. */
  average: { d: string; top: number } | null
  /** Years (or months, in a short history) under the line. */
  ticks: Array<{ left: number; text: string }>
  /** From the oldest operation to today. */
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
  /** «10 × 120,00 €». */
  quantity: string
  total: string
  declared: boolean
}

export interface AssetYear {
  year: string
  /** «Comprado 2.200,00 € · Vendido +300,00 €». */
  sum: string
  rows: AssetMovementRow[]
}

export interface AssetDetail {
  id: string
  /** The ticker, or the name when the asset has none. */
  symbol: string
  name: string
  figures: AssetFigure[]
  chart: AssetChart | null
  facts: AssetFact[]
  /** The units held, «15» and «títulos»; null for an asset without units. */
  units: { count: string; word: string } | null
  position: AssetPosition
  count: string
  /** Ids of the operations not yet declared. */
  undeclared: string[]
  years: AssetYear[]
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

/** Units held, or null when the asset has no units. */
const heldUnits = (position: InvestmentPosition): number | null =>
  position.units !== null && position.units > 0 ? position.units : null

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100
const share = (value: number, total: number) => Math.round((value / total) * 10000) / 100

function isOperation(tx: Transaction): boolean {
  return !!tx.side && Number(tx.units) > 0
}

/** The asset's movements, newest first. */
function assetMovements(state: State, position: InvestmentPosition): Transaction[] {
  const asset = state.investmentAssets.find((candidate) => candidate.id === position.id)
  if (!asset) return []
  return state.transactions
    .filter(
      (tx): tx is Transaction =>
        tx.type === 'investment' &&
        matchesInvestmentAsset(tx.category, asset, tx.instrumentId, state.instruments),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? '')),
    )
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
    quantity: operation
      ? `${formatDecimal(units)} × ${formatMoney(Number(tx.unitPrice) || 0)}`
      : '',
    total,
    declared: Boolean(tx.declared),
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

function groupByYear(movements: readonly Transaction[]): AssetYear[] {
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
 * The price line: one point per operation and today's, over time. Null when
 * there is no operation with a price, or all fall on the day the line ends.
 */
export function assetChart(
  position: InvestmentPosition,
  movements: readonly Transaction[],
  asOf: string,
  frame: ChartFrame = WIDE,
): AssetChart | null {
  const { width, height, pad: inset } = frame
  const operations = movements
    .filter((tx) => isOperation(tx) && Number(tx.unitPrice) > 0)
    .map((tx) => ({ tx, time: parseDay(tx.date), price: Number(tx.unitPrice) }))
    .sort((a, b) => a.time - b.time)
  const units = heldUnits(position)
  if (!operations.length || units === null) return null

  const today = Math.max(parseDay(asOf) || 0, operations.at(-1)!.time)
  if (today <= operations[0].time) return null
  const todayPrice = position.value / units
  const average = position.averagePrice

  const sequence = [
    ...operations.map(({ tx, time, price }) => ({ tx, time, price })),
    { tx: null, time: today, price: todayPrice },
  ]
  const prices = sequence.map((point) => point.price)
  let low = Math.min(...prices, average ?? Infinity)
  let high = Math.max(...prices, average ?? -Infinity)
  const pad = (high - low) * 0.08 || high * 0.05 || 1
  low -= pad
  high += pad
  // Two nearly equal prices must not read as a wild swing: keep a minimum span.
  const minSpan = todayPrice * 0.4
  if (high - low < minSpan) {
    const middle = (high + low) / 2
    low = middle - minSpan / 2
    high = middle + minSpan / 2
  }

  const first = operations[0].time
  const plotWidth = width - inset.left - inset.right
  const plotHeight = height - inset.top - inset.bottom
  const x = (time: number) => round1(inset.left + ((time - first) / (today - first)) * plotWidth)
  const y = (price: number) => round1(inset.top + (1 - (price - low) / (high - low)) * plotHeight)

  const line = sequence
    .map((point, index) => `${index ? 'L' : 'M'}${x(point.time)} ${y(point.price)}`)
    .join(' ')
  const baseline = height - inset.bottom
  const area = `${line} L${x(today)} ${baseline} L${x(first)} ${baseline} Z`

  const points = sequence.map<AssetPoint>((point) => {
    const versusAverage = average ? (point.price / average - 1) * 100 : 0
    const side = point.tx ? (point.tx.side === 'sell' ? 'sell' : 'buy') : null
    return {
      x: x(point.time),
      y: y(point.price),
      left: share(x(point.time), width),
      top: share(y(point.price), height),
      date: point.tx ? formatShortDate(point.tx.date) : 'Hoy',
      price: formatMoney(round2(point.price)),
      delta: average ? `${signedPct(versusAverage)} frente a tu media` : '',
      deltaTone: toneOf(versusAverage),
      note: point.tx
        ? `${side === 'sell' ? 'Venta' : 'Compra'} del ${formatShortDate(point.tx.date)}`
        : '',
      operation: side,
      declared: point.tx ? Boolean(point.tx.declared) : true,
    }
  })

  const averageInside = average !== null && average > low && average < high
  const history = `${formatShortDate(operations[0].tx.date)} – hoy`
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
    ticks: tickLabels(first, today).map(({ time, text }) => ({
      left: share(x(time), width),
      text,
    })),
    points,
    label: `Precio de ${position.name} (${history}): ${formatMoney(round2(operations[0].price))} en la primera operación y ${formatMoney(round2(todayPrice))} hoy, con ${operations.length} ${operations.length === 1 ? 'operación marcada' : 'operaciones marcadas'}.`,
  }
}

function assetFacts(position: InvestmentPosition, movements: readonly Transaction[]): AssetFact[] {
  const operations = movements.filter(isOperation)
  const buys = operations.filter((tx) => tx.side !== 'sell')
  const sells = operations.length - buys.length
  const units = heldUnits(position)
  const average = position.averagePrice
  const fees = movements.reduce((sum, tx) => sum + (Number(tx.fee) || 0), 0)
  const undeclared = operations.filter((tx) => !tx.declared).length
  const facts: AssetFact[] = []
  const fact = (label: string, value: string, note = '', tone: Tone = 'neutral') =>
    facts.push({ label, value, note, tone })

  if (average !== null) fact('Precio medio de compra', formatMoney(average))
  if (units !== null && average !== null) {
    const price = position.value / units
    const versus = (price / average - 1) * 100
    fact(
      'Precio hoy',
      formatMoney(round2(price)),
      `${signedPct(versus)} sobre tu media`,
      toneOf(versus),
    )
  }
  const firstBuy = buys.at(-1)
  if (firstBuy) fact('Primera compra', formatShortDate(firstBuy.date))
  if (operations.length) {
    fact(
      'Operaciones',
      `${buys.length} ${buys.length === 1 ? 'compra' : 'compras'}${
        sells ? ` · ${sells} ${sells === 1 ? 'venta' : 'ventas'}` : ''
      }`,
    )
  }
  fact('Comisiones pagadas', formatMoney(round2(fees)))
  fact('Declaración', undeclared ? `${undeclared} sin declarar` : 'Al día')
  return facts
}

function unitsHeld(position: InvestmentPosition): AssetDetail['units'] {
  const units = heldUnits(position)
  return units === null
    ? null
    : { count: formatDecimal(units), word: units === 1 ? 'título' : 'títulos' }
}

function assetPosition(position: InvestmentPosition): AssetPosition {
  const weight = formatPercent(position.weight, { digits: 1 })
  const rows: AssetFact[] = []
  if (position.averagePrice !== null) {
    rows.push({
      label: 'Precio medio',
      value: formatMoney(position.averagePrice),
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
  { compact = false }: { compact?: boolean } = {},
): AssetDetail | null {
  const position = vm.positions.find((candidate) => candidate.id === positionId)
  if (!position) return null
  const movements = assetMovements(state, position)
  const operationCount = movements.length
  // Only operations are declared; a contribution without titles has nothing to declare.
  const undeclared = movements.filter((tx) => isOperation(tx) && !tx.declared).map((tx) => tx.id)

  return {
    id: position.id,
    symbol: position.symbol ?? position.name,
    name: position.name,
    figures: [
      { key: 'value', label: 'Vale hoy', value: formatMoney(position.value), tone: 'neutral' },
      {
        key: 'result',
        label: 'Resultado',
        value: formatSignedMoney(position.gain),
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
    chart: assetChart(position, movements, vm.asOf, compact ? COMPACT : WIDE),
    facts: assetFacts(position, movements),
    units: unitsHeld(position),
    position: assetPosition(position),
    count: `${operationCount} ${operationCount === 1 ? 'operación' : 'operaciones'}${
      undeclared.length ? ` · ${undeclared.length} sin declarar` : ''
    }`,
    undeclared,
    years: groupByYear(movements),
  }
}
