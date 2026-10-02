import {
  computeContributionMetrics as computeContributionMetricsCore,
  matchesInvestmentAsset,
  type ContributionEntry,
  type Entity,
} from '../../lib/finance-core'
import { parseTransactionYear } from '../../scripts/investment-movements'
import { toSnapshotDate } from '../../scripts/contribution-workflow'
import { seriesColor } from '../../scripts/chart-theme'
import { MONTHS, type State, type Transaction } from '../../scripts/types'
import { monthFromISO } from '../../scripts/utils'
import {
  computeInvestedCapital,
  computeInvestedCapitalByAsset,
  computeInvestmentPortfolioValueForReturnMode,
  computeInvestmentValue,
} from './calculations'
import { getContributionEntriesFromSnapshots } from './contributions'
import type { MultiLineSeries } from '../../scripts/charts'

export type ReturnMode = 'simple' | 'twr'

export interface InvestmentPosition {
  id: string
  name: string
  /** Series color as a token reference, from `seriesColor`. */
  color: string
  value: number
  invested: number
  gain: number
  returnPct: number
  /** Share of the portfolio value, 0–100. */
  weight: number
  /** Instrument symbol, from the linked instrument or the latest movement. */
  symbol: string | null
  /** Units held at the end of the month, from buy and sell movements. */
  units: number | null
  /** Average buy price per unit. */
  averagePrice: number | null
  /** ISO date of the latest movement up to the month. */
  lastMovementDate: string | null
  /** Gain over invested capital per chart point, same labels as the portfolio chart. */
  series: MultiLineSeries
}

export interface InvestmentDashboardViewModel {
  /** ISO date the figures refer to: the close of the analysed month. */
  asOf: string
  portfolioValue: number
  investedCapital: number
  gain: number
  displayReturn: number
  returnIsGood: boolean
  returnLabel: string
  positions: InvestmentPosition[]
  /** € view: portfolio value against contributed capital. */
  valueSeries: MultiLineSeries[]
  /** % view: cumulative return of the portfolio. */
  percentSeries: MultiLineSeries[]
  chartLabels: string[]
}

function toGainPercent(value: number, investedCapital: number): number {
  return investedCapital <= 0 ? 0 : ((value - investedCapital) / investedCapital) * 100
}

type PositionDetail = Pick<
  InvestmentPosition,
  'symbol' | 'units' | 'averagePrice' | 'lastMovementDate'
>

/** Symbol, units, average buy price and last movement of an asset up to a month. */
function buildPositionDetail(state: State, asset: Entity, month: number): PositionDetail {
  const movements = state.transactions
    .filter(
      (tx) =>
        tx.type === 'investment' &&
        Number(tx.month) <= month &&
        matchesInvestmentAsset(tx.category, asset),
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  let units = 0
  let boughtUnits = 0
  let boughtCost = 0
  for (const tx of movements) {
    const txUnits = Number(tx.units)
    if (!tx.side || !Number.isFinite(txUnits) || txUnits <= 0) continue
    if (tx.side === 'sell') {
      units -= txUnits
    } else {
      units += txUnits
      boughtUnits += txUnits
      boughtCost += txUnits * Number(tx.unitPrice || 0)
    }
  }

  const instrument = state.instruments.find(
    (item) => item.investmentAssetId === asset.id && item.active,
  )
  const latestSymbol = movements.findLast((tx) => tx.symbol)?.symbol
  return {
    symbol: instrument?.symbol || latestSymbol || null,
    units: boughtUnits > 0 ? Math.round(units * 1e8) / 1e8 : null,
    averagePrice: boughtUnits > 0 ? boughtCost / boughtUnits : null,
    lastMovementDate: movements.at(-1)?.date ?? null,
  }
}

export function buildInvestmentDashboardViewModel(
  state: State,
  month: number,
  returnMode: ReturnMode,
): InvestmentDashboardViewModel {
  const investedCapital = computeInvestedCapital(state, month)
  const isTWR = returnMode === 'twr'
  const portfolioValue = computeInvestmentPortfolioValueForReturnMode(state, month, returnMode)

  const twrEntries = isTWR ? getContributionEntriesFromSnapshots(state) : []
  const twrMetrics = isTWR ? computeContributionMetricsCore(twrEntries as ContributionEntry[]) : []
  const twrByDate = new Map<string, number>()
  twrMetrics.forEach((metric) => twrByDate.set(metric.date, (metric.cumulativeReturn ?? 0) * 100))

  const simpleReturn =
    investedCapital <= 0 ? 0 : ((portfolioValue - investedCapital) / investedCapital) * 100
  const lastTWR =
    twrMetrics.length > 0 ? (twrMetrics[twrMetrics.length - 1].cumulativeReturn ?? 0) * 100 : 0
  const displayReturn = isTWR ? lastTWR : simpleReturn

  const monthIndexes = Array.from({ length: month + 1 }, (_, i) => i)
  const chartPoints = [-1, ...monthIndexes]
  const chartLabels = ['01/01', ...monthIndexes.map((m) => MONTHS[m])]

  const investedCapitalTotal = (targetMonth: number): number =>
    state.investmentAssets.reduce(
      (sum, asset) => sum + computeInvestedCapitalByAsset(state, asset.id, targetMonth),
      0,
    )

  const portfolioTotalValues = chartPoints.map((m) =>
    computeInvestmentPortfolioValueForReturnMode(state, m, returnMode),
  )
  const portfolioInvestedCapital = chartPoints.map((m) => investedCapitalTotal(m))
  const portfolioPercentages = isTWR
    ? chartPoints.map((m) => (m < 0 ? 0 : (twrByDate.get(toSnapshotDate(state.year, m)) ?? 0)))
    : portfolioTotalValues.map((value, idx) => toGainPercent(value, portfolioInvestedCapital[idx]))

  const valued = state.investmentAssets
    .map((asset) => ({ asset, value: computeInvestmentValue(state, asset.id, month) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value)
  const positionTotal = valued.reduce((sum, { value }) => sum + value, 0)

  const positions: InvestmentPosition[] = valued.map(({ asset, value }, idx) => {
    const invested = computeInvestedCapitalByAsset(state, asset.id, month)
    const color = seriesColor(idx)
    return {
      id: asset.id,
      name: asset.name,
      color,
      value,
      invested,
      gain: value - invested,
      returnPct: toGainPercent(value, invested),
      weight: positionTotal > 0 ? (value / positionTotal) * 100 : 0,
      ...buildPositionDetail(state, asset as Entity, month),
      series: {
        name: asset.name,
        color,
        values: chartPoints.map((m) =>
          toGainPercent(
            computeInvestmentValue(state, asset.id, m),
            computeInvestedCapitalByAsset(state, asset.id, m),
          ),
        ),
      },
    }
  })

  return {
    asOf: toSnapshotDate(state.year, month),
    portfolioValue,
    investedCapital,
    gain: portfolioValue - investedCapital,
    displayReturn,
    returnIsGood: displayReturn >= 0,
    returnLabel: isTWR ? 'Rentabilidad TWR' : 'Rentabilidad estimada',
    positions,
    valueSeries: [
      { name: 'Valor de cartera', color: 'var(--primary)', values: portfolioTotalValues },
      {
        name: 'Capital aportado',
        color: 'var(--text-muted)',
        values: portfolioInvestedCapital,
        dashed: true,
      },
    ],
    percentSeries: [
      {
        name: isTWR ? 'Cartera Total (TWR)' : 'Cartera Total',
        color: 'var(--primary)',
        values: portfolioPercentages,
      },
    ],
    chartLabels,
  }
}

export interface InvestmentMovementRow {
  tx: Transaction
  account: string
  /** The traded symbol, or the category for movements saved without one. */
  symbol: string
  currency: string
  sideLabel: string
  declaredLabel: string
  declared: boolean
}

export function buildInvestmentMovementRows(
  state: State,
  yearFilter: number,
  onlyUndeclared: boolean,
  getAccountName: (accountId: string) => string,
): InvestmentMovementRow[] {
  return state.transactions
    .filter((item): item is Transaction => item.type === 'investment')
    .filter((item) => {
      const year = parseTransactionYear(item.date)
      if (year === null || year !== yearFilter) return false
      if (onlyUndeclared && item.declared) return false
      return true
    })
    .sort((a, b) => {
      const byDate = String(b.date).localeCompare(String(a.date))
      if (byDate !== 0) return byDate
      return String(b.time || '').localeCompare(String(a.time || ''))
    })
    .map((tx) => ({
      tx,
      account: getAccountName(tx.accountId),
      symbol: tx.symbol || tx.category || '—',
      currency: (tx.movementCurrency || 'EUR').toUpperCase(),
      sideLabel: tx.side === 'sell' ? 'Venta' : 'Compra',
      declaredLabel: tx.declared ? 'Sí' : 'No',
      declared: Boolean(tx.declared),
    }))
}

/**
 * Money a movement put into the portfolio: a purchase's stored amount (fee
 * included, see computeInvestmentMovement), negative for what a sale brought in.
 */
function investedFlow(tx: Transaction): number {
  const amount = Math.abs(Number(tx.amount) || 0)
  return tx.side === 'sell' ? -amount : amount
}

export interface InvestmentYearSummary {
  /** Spent on purchases, fees included. */
  bought: number
  /** Brought in by sales. */
  sold: number
  fees: number
  /** Movements not declared yet. */
  pending: number
}

/** The year's figures, regardless of the "only undeclared" filter. */
export function summarizeInvestmentYear(state: State, year: number): InvestmentYearSummary {
  const summary: InvestmentYearSummary = { bought: 0, sold: 0, fees: 0, pending: 0 }
  for (const tx of state.transactions) {
    if (tx.type !== 'investment' || parseTransactionYear(tx.date) !== year) continue
    const flow = investedFlow(tx)
    if (flow < 0) summary.sold -= flow
    else summary.bought += flow
    summary.fees += Number(tx.fee) || 0
    if (!tx.declared) summary.pending += 1
  }
  return summary
}

export interface InvestmentMonthGroup {
  /** 0-based month. */
  month: number
  count: number
  /** Purchases (fees included) minus what sales brought in. */
  net: number
  rows: InvestmentMovementRow[]
}

/** Rows (already sorted newest first) grouped by the month of their date. */
export function groupInvestmentMovementsByMonth(
  rows: InvestmentMovementRow[],
): InvestmentMonthGroup[] {
  const groups: InvestmentMonthGroup[] = []
  for (const row of rows) {
    const month = monthFromISO(row.tx.date) ?? row.tx.month
    let group = groups.find((item) => item.month === month)
    if (!group) {
      group = { month, count: 0, net: 0, rows: [] }
      groups.push(group)
    }
    group.net += investedFlow(row.tx)
    group.count += 1
    group.rows.push(row)
  }
  return groups.sort((a, b) => b.month - a.month)
}

export function buildInvestmentYearOptions(state: State): number[] {
  const years = Array.from(
    new Set(
      state.transactions
        .filter((item) => item.type === 'investment')
        .map((item) => parseTransactionYear(item.date))
        .filter((year): year is number => typeof year === 'number' && Number.isInteger(year))
        .concat(state.year),
    ),
  ).sort((a, b) => b - a)
  if (!years.length) {
    years.push(state.year)
  }
  return years
}
