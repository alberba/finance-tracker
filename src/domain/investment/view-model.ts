import { ALL_MONTHS, atMonth, YEAR_START, type Month, type MonthOrStart } from '../../lib/month'
import {
  computeContributionMetrics as computeContributionMetricsCore,
  matchesInvestmentAsset,
  type ContributionEntry,
  type Entity,
} from '../../lib/finance-core'
import { toSnapshotDate } from '../../scripts/contribution-workflow'
import {
  MONTHS,
  type RecurringFrequency,
  type RecurringRule,
  type State,
} from '../../scripts/types'
import { round2 } from '../../scripts/utils'
import {
  computeInvestedCapital,
  computeInvestedCapitalByAsset,
  computeInvestmentPortfolioValueForReturnMode,
  computeInvestmentValue,
} from './calculations'
import { getContributionEntriesFromSnapshots } from './contributions'

export type ReturnMode = 'simple' | 'twr'

/** One line of a chart: a value per chart point. */
export interface ChartSeries {
  name: string
  values: number[]
  /** A reference line, such as contributed capital. */
  dashed?: boolean
}

export interface InvestmentPosition {
  id: string
  name: string
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
  series: ChartSeries
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
  valueSeries: ChartSeries[]
  /** % view: cumulative return of the portfolio. */
  percentSeries: ChartSeries[]
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
function buildPositionDetail(state: State, asset: Entity, month: Month): PositionDetail {
  const movements = state.transactions
    .filter(
      (tx) =>
        tx.type === 'investment' &&
        Number(tx.month) <= month &&
        matchesInvestmentAsset(tx.category, asset, tx.instrumentId, state.instruments),
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

/** Value used to decide if the asset has a position row for this month. */
export function positionValue(state: State, asset: Entity, month: Month): number {
  return computeInvestmentValue(state, asset.id, month)
}

export function buildInvestmentDashboardViewModel(
  state: State,
  month: Month,
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

  const chartMonths = ALL_MONTHS.filter((m) => m <= month)
  const chartPoints: MonthOrStart[] = [YEAR_START, ...chartMonths]
  const chartLabels = ['01/01', ...chartMonths.map((m) => atMonth(MONTHS, m))]

  const investedCapitalTotal = (targetMonth: MonthOrStart): number =>
    state.investmentAssets.reduce(
      (sum, asset) => sum + computeInvestedCapitalByAsset(state, asset.id, targetMonth),
      0,
    )

  const portfolioTotalValues = chartPoints.map((m) =>
    computeInvestmentPortfolioValueForReturnMode(state, m, returnMode),
  )
  const portfolioInvestedCapital = chartPoints.map((m) => investedCapitalTotal(m))
  const portfolioPercentages = isTWR
    ? chartPoints.map((m) =>
        m === YEAR_START ? 0 : (twrByDate.get(toSnapshotDate(state.year, m)) ?? 0),
      )
    : portfolioTotalValues.map((value, idx) => toGainPercent(value, portfolioInvestedCapital[idx]))

  const valued = state.investmentAssets
    .map((asset) => ({ asset, value: positionValue(state, asset, month) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value)
  const positionTotal = valued.reduce((sum, { value }) => sum + value, 0)

  const positions: InvestmentPosition[] = valued.map(({ asset, value }) => {
    const invested = computeInvestedCapitalByAsset(state, asset.id, month)
    return {
      id: asset.id,
      name: asset.name,
      value,
      invested,
      gain: value - invested,
      returnPct: toGainPercent(value, invested),
      weight: positionTotal > 0 ? (value / positionTotal) * 100 : 0,
      ...buildPositionDetail(state, asset as Entity, month),
      series: {
        name: asset.name,
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
      { name: 'Valor de cartera', values: portfolioTotalValues },
      {
        name: 'Capital aportado',
        values: portfolioInvestedCapital,
        dashed: true,
      },
    ],
    percentSeries: [
      {
        name: isTWR ? 'Cartera Total (TWR)' : 'Cartera Total',
        values: portfolioPercentages,
      },
    ],
    chartLabels,
  }
}

/** Purchases a frequency makes in a year, before its interval. */
const YEARLY_OCCURRENCES: Record<RecurringFrequency, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  monthEnd: 12,
  yearly: 1,
}

/** What a recurring purchase costs a month on average (weekly: × 52 ÷ 12). */
export function ruleMonthlyEquivalent(
  rule: Pick<RecurringRule, 'amount' | 'frequency' | 'interval'>,
): number {
  const interval = Math.max(1, Math.floor(rule.interval || 1))
  return round2((rule.amount * YEARLY_OCCURRENCES[rule.frequency]) / interval / 12)
}
