import { ALL_MONTHS, atMonth, YEAR_START, type Month, type MonthOrStart } from '../../lib/month'
import {
  computeContributionMetrics as computeContributionMetricsCore,
  type ContributionEntry,
} from '../../lib/finance-core'
import { toSnapshotDate } from '../../scripts/contribution-workflow'
import {
  MONTHS,
  type Entity,
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
import {
  buildAccountHoldings,
  type AccountPosition,
  type PositionOptions,
  type UninstrumentedHolding,
} from './positions'

export type ReturnMode = 'simple' | 'twr'

/** One line of a chart: a value per chart point. */
export interface ChartSeries {
  name: string
  values: number[]
  /** A reference line, such as contributed capital. */
  dashed?: boolean
}

/**
 * An investment account as the cover lists it. An account is where money is, not
 * an asset: it carries no symbol, units or price. What it holds is its positions
 * (`InvestmentDashboardViewModel.positions`).
 */
export interface InvestmentAccount {
  id: string
  name: string
  value: number
  invested: number
  gain: number
  returnPct: number
  /** Share of the portfolio value, 0–100. */
  weight: number
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
  /** Investment accounts with value, by value. */
  accounts: InvestmentAccount[]
  /** What each account holds, one entry per account × instrument (see `buildAccountPositions`). */
  positions: AccountPosition[]
  /** What accounts hold with no instrument, when it is not negligible (see `buildUninstrumentedHoldings`). */
  uninstrumented: UninstrumentedHolding[]
  /** € view: portfolio value against contributed capital. */
  valueSeries: ChartSeries[]
  /** % view: cumulative return of the portfolio. */
  percentSeries: ChartSeries[]
  chartLabels: string[]
}

function toGainPercent(value: number, investedCapital: number): number {
  return investedCapital <= 0 ? 0 : ((value - investedCapital) / investedCapital) * 100
}

/** Value used to decide if the asset has a position row for this month. */
export function positionValue(state: State, asset: Entity, month: Month): number {
  return computeInvestmentValue(state, asset.id, month)
}

export function buildInvestmentDashboardViewModel(
  state: State,
  month: Month,
  returnMode: ReturnMode,
  positionOptions: PositionOptions = {},
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

  const accounts: InvestmentAccount[] = valued.map(({ asset, value }) => {
    const invested = computeInvestedCapitalByAsset(state, asset.id, month)
    return {
      id: asset.id,
      name: asset.name,
      value,
      invested,
      gain: value - invested,
      returnPct: toGainPercent(value, invested),
      weight: positionTotal > 0 ? (value / positionTotal) * 100 : 0,
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
    accounts,
    ...buildAccountHoldings(state, month, positionOptions),
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
