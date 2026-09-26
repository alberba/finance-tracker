import {
  computeContributionMetrics as computeContributionMetricsCore,
  type ContributionEntry,
} from '../../lib/finance-core'
import { parseTransactionYear } from '../../scripts/investment-movements'
import { toSnapshotDate } from '../../scripts/contribution-workflow'
import { MONTHS, type State, type Transaction } from '../../scripts/types'
import { formatPercent } from '../../scripts/utils'
import {
  computeInvestedCapital,
  computeInvestedCapitalByAsset,
  computeInvestmentPortfolioValueForReturnMode,
  computeInvestmentValue,
} from './calculations'
import { getContributionEntriesFromSnapshots } from './contributions'
import type { MultiLineSeries, DonutChartItem } from '../../scripts/charts'

export type ReturnMode = 'simple' | 'twr'

const CHART_COLORS = [
  '#0d8476',
  '#2563eb',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#84cc16',
  '#ec4899',
  '#64748b',
]

export interface InvestmentPosition {
  id: string
  name: string
  color: string
  value: number
  invested: number
  gain: number
  returnPct: number
  /** Share of the portfolio value, 0–100. */
  weight: number
  /** Gain over invested capital per chart point, same labels as the portfolio chart. */
  series: MultiLineSeries[]
}

export interface InvestmentDashboardViewModel {
  portfolioValue: number
  investedCapital: number
  gain: number
  positions: InvestmentPosition[]
  valueSeries: MultiLineSeries[]
  displayReturn: number
  returnIsGood: boolean
  returnLabel: string
  portfolioSeries: MultiLineSeries[]
  assetsSeries: MultiLineSeries[]
  allocation: DonutChartItem[]
  chartLabels: string[]
}

function toGainPercent(value: number, investedCapital: number): number {
  return investedCapital <= 0 ? 0 : ((value - investedCapital) / investedCapital) * 100
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
  const monthLabels = ['01/01', ...monthIndexes.map((m) => MONTHS[m])]

  const computeInvestedCapitalTotal = (targetMonth: number): number =>
    state.investmentAssets.reduce(
      (sum, asset) => sum + computeInvestedCapitalByAsset(state, asset.id, targetMonth),
      0,
    )

  const portfolioTotalValues = chartPoints.map((m) =>
    computeInvestmentPortfolioValueForReturnMode(state, m, isTWR ? 'twr' : 'simple'),
  )
  const portfolioInvestedCapital = chartPoints.map((m) => computeInvestedCapitalTotal(m))
  const portfolioPercentages = isTWR
    ? chartPoints.map((m) => {
        if (m < 0) return 0
        return twrByDate.get(toSnapshotDate(state.year, m)) ?? 0
      })
    : portfolioTotalValues.map((value, idx) => toGainPercent(value, portfolioInvestedCapital[idx]))

  const assetsSeries: MultiLineSeries[] = state.investmentAssets
    .filter((asset) => computeInvestmentValue(state, asset.id, month) > 0)
    .map((asset, idx) => {
      const values = chartPoints.map((m) => computeInvestmentValue(state, asset.id, m))
      const investedByAsset = chartPoints.map((m) => computeInvestedCapitalByAsset(state, asset.id, m))
      return {
        name: asset.name,
        color: CHART_COLORS[idx % CHART_COLORS.length],
        values: values.map((value, valueIdx) => toGainPercent(value, investedByAsset[valueIdx])),
      }
    })

  const positionTotal = state.investmentAssets.reduce(
    (sum, asset) => sum + Math.max(0, computeInvestmentValue(state, asset.id, month)),
    0,
  )
  const positions: InvestmentPosition[] = state.investmentAssets
    .map((asset, idx) => {
      const value = computeInvestmentValue(state, asset.id, month)
      const invested = computeInvestedCapitalByAsset(state, asset.id, month)
      const color = CHART_COLORS[idx % CHART_COLORS.length]
      return {
        id: asset.id,
        name: asset.name,
        color,
        value,
        invested,
        gain: value - invested,
        returnPct: toGainPercent(value, invested),
        weight: positionTotal > 0 ? (value / positionTotal) * 100 : 0,
        series: [
          {
            name: asset.name,
            color,
            values: chartPoints.map((m) =>
              toGainPercent(
                computeInvestmentValue(state, asset.id, m),
                computeInvestedCapitalByAsset(state, asset.id, m),
              ),
            ),
          },
        ],
      }
    })
    .filter((position) => position.value > 0)
    .sort((a, b) => b.value - a.value)

  const allocation: DonutChartItem[] = state.investmentAssets
    .map((asset, idx) => ({
      label: asset.name,
      color: CHART_COLORS[idx % CHART_COLORS.length],
      value: computeInvestmentValue(state, asset.id, month),
    }))
    .filter((item) => item.value > 0)

  return {
    portfolioValue,
    investedCapital,
    gain: portfolioValue - investedCapital,
    positions,
    valueSeries: [
      { name: 'Valor de cartera', color: '#3b6bf0', values: portfolioTotalValues },
      { name: 'Capital aportado', color: '#8693a4', values: portfolioInvestedCapital },
    ],
    displayReturn,
    returnIsGood: displayReturn >= 0,
    returnLabel: isTWR ? 'Rentabilidad TWR' : 'Rentabilidad estimada',
    portfolioSeries: [
      {
        name: isTWR ? 'Cartera Total (TWR)' : 'Cartera Total',
        color: CHART_COLORS[0],
        values: portfolioPercentages,
      },
    ],
    assetsSeries,
    allocation,
    chartLabels: monthLabels,
  }
}

export interface InvestmentMovementRow {
  tx: Transaction
  account: string
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
      sideLabel: tx.side === 'sell' ? 'Venta' : 'Compra',
      declaredLabel: tx.declared ? 'Sí' : 'No',
      declared: Boolean(tx.declared),
    }))
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

export { formatPercent }
