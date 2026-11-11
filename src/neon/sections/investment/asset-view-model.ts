import type {
  InvestmentDashboardViewModel,
  InvestmentPosition,
} from '../../../domain/investment/view-model'
import { matchesInvestmentAsset } from '../../../lib/finance-core'
import {
  formatDayMonth,
  formatDecimal,
  formatMoney,
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
  /** What the row says for screen readers. */
  label: string
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
  count: string
  /** Ids of the operations not yet declared. */
  undeclared: string[]
  years: AssetYear[]
}

const VIEW_WIDTH = 880
const VIEW_HEIGHT = 280
const PAD = { left: 8, right: 24, top: 16, bottom: 28 }
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

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
        tx.type === 'investment' && matchesInvestmentAsset(tx.category, asset),
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
    label: `${title} del ${formatShortDate(tx.date)}: ${total}`,
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
): AssetChart | null {
  const operations = movements
    .filter((tx) => isOperation(tx) && Number(tx.unitPrice) > 0)
    .map((tx) => ({ tx, time: parseDay(tx.date), price: Number(tx.unitPrice) }))
    .sort((a, b) => a.time - b.time)
  const units = position.units !== null && position.units > 0 ? position.units : null
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

  const first = operations[0].time
  const plotWidth = VIEW_WIDTH - PAD.left - PAD.right
  const plotHeight = VIEW_HEIGHT - PAD.top - PAD.bottom
  const x = (time: number) => round1(PAD.left + ((time - first) / (today - first)) * plotWidth)
  const y = (price: number) => round1(PAD.top + (1 - (price - low) / (high - low)) * plotHeight)

  const line = sequence
    .map((point, index) => `${index ? 'L' : 'M'}${x(point.time)} ${y(point.price)}`)
    .join(' ')
  const baseline = VIEW_HEIGHT - PAD.bottom
  const area = `${line} L${x(today)} ${baseline} L${x(first)} ${baseline} Z`

  const points = sequence.map<AssetPoint>((point) => {
    const versusAverage = average ? (point.price / average - 1) * 100 : 0
    const side = point.tx ? (point.tx.side === 'sell' ? 'sell' : 'buy') : null
    return {
      x: x(point.time),
      y: y(point.price),
      left: share(x(point.time), VIEW_WIDTH),
      top: share(y(point.price), VIEW_HEIGHT),
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
    viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
    line,
    area,
    average: averageInside
      ? {
          d: `M${PAD.left} ${y(average)} H${VIEW_WIDTH - PAD.right}`,
          top: share(y(average), VIEW_HEIGHT),
        }
      : null,
    ticks: tickLabels(first, today).map(({ time, text }) => ({
      left: share(x(time), VIEW_WIDTH),
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
  const units = position.units !== null && position.units > 0 ? position.units : null
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

/**
 * What an asset's detail shows. Null when the position is no longer in the
 * portfolio.
 */
export function assetDetail(
  state: State,
  vm: InvestmentDashboardViewModel,
  positionId: string,
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
    chart: assetChart(position, movements, vm.asOf),
    facts: assetFacts(position, movements),
    count: `${operationCount} ${operationCount === 1 ? 'operación' : 'operaciones'}${
      undeclared.length ? ` · ${undeclared.length} sin declarar` : ''
    }`,
    undeclared,
    years: groupByYear(movements),
  }
}
