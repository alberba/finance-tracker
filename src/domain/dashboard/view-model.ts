import { getCategoryEmoji } from '../../scripts/category-emoji'
import {
  MONTHS,
  type BudgetType,
  type Goal,
  type GoalKey,
  type MonthTotals,
  type State,
} from '../../scripts/types'
import { formatPercent, monthFromISO, parseIntSafe, round2 } from '../../scripts/utils'
import {
  buildDashboardInvestmentProgressItems,
  type InvestmentProgressItem,
} from '../../scripts/app/dashboard-investment-progress-list'
import {
  computeInvestmentValue as computeCoreInvestmentValue,
  getCategoryActuals as getCoreCategoryActuals,
  getMonthTotals as getCoreMonthTotals,
  getWealthByMonth as getCoreWealthByMonth,
} from '../../lib/finance-core'

export type DashboardHeroRange = '7d' | '1m' | '6m' | '1a'
export type DashboardTone = 'neutral' | 'good' | 'bad'
export type DashboardTransactionTone = 'income' | 'expense' | 'investment'

export interface DashboardMonthOption {
  value: number
  label: string
}

export interface DashboardRangeOption {
  value: DashboardHeroRange
  label: string
  active: boolean
}

export interface DashboardStatDelta {
  tag: string
  post: string
  tone: DashboardTone
}

export interface DashboardStat {
  value: string
  delta: DashboardStatDelta | null
  sparkValues: number[]
}

export interface DashboardKpis {
  income: DashboardStat
  expense: DashboardStat
  investment: DashboardStat
  netWorth: string
  netWorthChange: {
    label: string
    tone: DashboardTone
  }
  annualSavings: string
}

export interface DashboardLineChart {
  labels: string[]
  values: number[]
  endpoint: string
}

export interface DashboardCashflowChart {
  labels: string[]
  income: number[]
  expense: number[]
  investment: number[]
}

export interface DashboardTopExpenseItem {
  category: string
  emoji: string
  amount: string
  pct: string
  pctValue: number
}

export interface DashboardWealthSplitItem {
  label: string
  colorVar: string
  fallbackColor: string
  value: number
  amount: string
  pct: string
}

export interface DashboardRecentTransaction {
  id: string
  date: string
  description: string
  category: string
  emoji: string
  typeLabel: string
  amount: string
  sign: string
  tone: DashboardTransactionTone
}

export type DashboardSavingsGoal =
  | {
      kind: 'empty'
      message: string
    }
  | {
      kind: 'goal'
      name: string
      targetYear: number
      target: string
      current: string
      progress: number
      progressLabel: string
      subLabel: string
      remainingLabel: string
      remainingTone: DashboardTone
    }

export interface DashboardViewModel {
  year: number
  yearOptions: number[]
  currency: string
  month: number
  months: DashboardMonthOption[]
  ranges: DashboardRangeOption[]
  kpis: DashboardKpis
  netWorthChart: DashboardLineChart
  cashflowChart: DashboardCashflowChart
  topExpenses: DashboardTopExpenseItem[]
  wealthSplit: DashboardWealthSplitItem[]
  investmentProgress: InvestmentProgressItem[]
  recentTransactions: DashboardRecentTransaction[]
  savingsGoal: DashboardSavingsGoal
}

interface DashboardViewModelOptions {
  state: State
  month: number
  heroRange: DashboardHeroRange
  getMonthTotals: (month: number) => MonthTotals
  getYearTotals: () => MonthTotals
  getWealthSeries: () => Array<{
    liquidity: number
    investment: number
    liabilities: number
    net: number
  }>
  getLatestDataMonth: () => number
  getMonthlyCashflowSeries: () => { income: number[]; expense: number[]; investment: number[] }
  getCategoryActuals: (type: BudgetType, month: number) => Record<string, number>
  getBudgetValue: (type: BudgetType, category: string, month: number) => number
  getWealthByMonth: (month: number) => {
    liquidity: number
    investment: number
    liabilities: number
    net: number
  }
  computeInvestmentValue: (assetId: string, month: number) => number
  formatMoney: (value: number) => string
}

const MONTHS_PER_YEAR = 12
const MONTH_ABBR = MONTHS.map((name) => name.slice(0, 3))
const TYPE_LABEL: Record<BudgetType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  investment: 'Inversión',
}

export function buildDashboardViewModelFromState({
  state,
  month,
  heroRange,
}: {
  state: State
  month: number
  heroRange: DashboardHeroRange
}): DashboardViewModel {
  const getWealthByMonth = (targetMonth: number) =>
    getCoreWealthByMonth(
      targetMonth,
      state.accounts,
      state.investmentAssets,
      state.liabilities,
      state.transactions,
      state.snapshots,
    )

  const getMonthTotals = (targetMonth: number) =>
    getCoreMonthTotals(state.transactions, targetMonth)

  return buildDashboardViewModel({
    state,
    month,
    heroRange,
    getMonthTotals,
    getYearTotals: () => getYearTotalsFromState(getMonthTotals),
    getWealthSeries: () => MONTHS.map((_, targetMonth) => getWealthByMonth(targetMonth)),
    getLatestDataMonth: () => getLatestDataMonthFromState(state, month),
    getMonthlyCashflowSeries: () => getMonthlyCashflowSeriesFromState(getMonthTotals),
    getCategoryActuals: (type, targetMonth) =>
      getCoreCategoryActuals(
        state.transactions,
        type,
        targetMonth,
        getCategoriesForType(state, type),
      ),
    getBudgetValue: (type, category, targetMonth) =>
      getBudgetValueFromState(state, type, category, targetMonth),
    getWealthByMonth,
    computeInvestmentValue: (assetId, targetMonth) =>
      computeCoreInvestmentValue(
        assetId,
        targetMonth,
        state.investmentAssets,
        state.transactions,
        state.snapshots,
      ),
    formatMoney: (value) => formatStateMoney(value, state.currency),
  })
}

export function buildDashboardViewModel({
  state,
  month,
  heroRange,
  getMonthTotals,
  getYearTotals,
  getWealthSeries,
  getLatestDataMonth,
  getMonthlyCashflowSeries,
  getCategoryActuals,
  getBudgetValue,
  getWealthByMonth,
  computeInvestmentValue,
  formatMoney,
}: DashboardViewModelOptions): DashboardViewModel {
  const safeMonth = MONTHS[month] ? month : 0
  const monthTotals = getMonthTotals(safeMonth)
  const yearTotals = getYearTotals()
  const wealthSeries = getWealthSeries()
  const latestDataMonth = getLatestDataMonth()
  const chartMonths = MONTHS.slice(0, latestDataMonth + 1)
  const currentWealth = wealthSeries[safeMonth] || {
    liquidity: 0,
    investment: 0,
    liabilities: 0,
    net: 0,
  }
  const previousYearIndex = safeMonth - MONTHS_PER_YEAR
  const previousYearNet = previousYearIndex >= 0 ? (wealthSeries[previousYearIndex]?.net ?? 0) : 0
  const netWorthChange =
    previousYearNet !== 0
      ? ((currentWealth.net - previousYearNet) / Math.abs(previousYearNet)) * 100
      : null
  const prevMonth = safeMonth - 1
  const prevTotals = prevMonth >= 0 ? getMonthTotals(prevMonth) : null
  const prevAbbr = prevMonth >= 0 ? `${(MONTHS[prevMonth] || '').slice(0, 3).toLowerCase()}.` : ''
  const cashflowSeries = getMonthlyCashflowSeries()
  const dashboardCashflow = {
    income: cashflowSeries.income.slice(0, latestDataMonth + 1),
    expense: cashflowSeries.expense.slice(0, latestDataMonth + 1),
    investment: cashflowSeries.investment.slice(0, latestDataMonth + 1),
  }

  return {
    year: state.year,
    yearOptions: buildDashboardYearOptions(state),
    currency: state.currency,
    month: safeMonth,
    months: MONTHS.map((label, value) => ({ label, value })),
    ranges: buildRangeOptions(heroRange),
    kpis: {
      income: {
        value: formatMoney(monthTotals.income),
        delta: buildStatDelta(monthTotals.income, prevTotals?.income ?? null, prevAbbr, true),
        sparkValues: cashflowSeries.income.slice(0, latestDataMonth + 1),
      },
      expense: {
        value: formatMoney(monthTotals.expense),
        delta: buildStatDelta(monthTotals.expense, prevTotals?.expense ?? null, prevAbbr, false),
        sparkValues: cashflowSeries.expense.slice(0, latestDataMonth + 1),
      },
      investment: {
        value: formatMoney(monthTotals.investment),
        delta: buildStatDelta(
          monthTotals.investment,
          prevTotals?.investment ?? null,
          prevAbbr,
          true,
        ),
        sparkValues: cashflowSeries.investment.slice(0, latestDataMonth + 1),
      },
      netWorth: formatMoney(currentWealth.net),
      netWorthChange: {
        label: netWorthChange === null ? '--' : formatPercent(netWorthChange),
        tone: netWorthChange === null ? 'neutral' : netWorthChange >= 0 ? 'good' : 'bad',
      },
      annualSavings: formatMoney(yearTotals.income - yearTotals.expense - yearTotals.investment),
    },
    netWorthChart: buildNetWorthChart(wealthSeries, latestDataMonth, heroRange, formatMoney),
    cashflowChart: {
      labels: Array.from(chartMonths),
      ...dashboardCashflow,
    },
    topExpenses: buildTopExpenses(getCategoryActuals('expense', safeMonth), formatMoney),
    wealthSplit: buildWealthSplit({
      state,
      month: safeMonth,
      getWealthByMonth,
      computeInvestmentValue,
      formatMoney,
    }),
    investmentProgress: buildDashboardInvestmentProgressItems({
      actuals: getCategoryActuals('investment', safeMonth),
      month: safeMonth,
      getBudgetValue: (category, budgetMonth) =>
        getBudgetValue('investment', category, budgetMonth),
      formatMoney,
    }),
    recentTransactions: buildRecentTransactions(state, formatMoney),
    savingsGoal: buildSavingsGoal({
      state,
      month: safeMonth,
      getWealthByMonth,
      computeInvestmentValue,
      formatMoney,
    }),
  }
}

function buildDashboardYearOptions(state: State): number[] {
  const years = new Set<number>([state.year])

  state.transactions.forEach((item) => addYear(years, item.date))
  state.contributions.forEach((item) => addYear(years, item.portfolioDate || item.date))

  return Array.from(years).sort((a, b) => b - a)
}

function addYear(years: Set<number>, value: string): void {
  const year = String(value).slice(0, 4)
  if (/^\d{4}$/.test(year)) {
    years.add(Number(year))
  }
}

function getCategoriesForType(state: State, type: BudgetType): string[] {
  if (type === 'income') {
    return state.incomeCategories
  }
  if (type === 'expense') {
    return state.expenseCategories
  }
  return state.investmentCategories
}

function getYearTotalsFromState(getMonthTotals: (month: number) => MonthTotals): MonthTotals {
  return MONTHS.map((_, month) => getMonthTotals(month)).reduce(
    (acc, item) => {
      acc.income += item.income
      acc.expense += item.expense
      acc.investment += item.investment
      return acc
    },
    { income: 0, expense: 0, investment: 0 },
  )
}

function getMonthlyCashflowSeriesFromState(getMonthTotals: (month: number) => MonthTotals) {
  const income: number[] = []
  const expense: number[] = []
  const investment: number[] = []

  MONTHS.forEach((_, month) => {
    const total = getMonthTotals(month)
    income.push(round2(total.income))
    expense.push(round2(total.expense))
    investment.push(round2(total.investment))
  })

  return { income, expense, investment }
}

function getBudgetValueFromState(
  state: State,
  type: BudgetType,
  category: string,
  month: number,
): number {
  return round2(state.budget[type]?.[category]?.[month] || 0)
}

function getLatestDataMonthFromState(state: State, fallbackMonth: number): number {
  let latest = -1

  state.transactions.forEach((item) => {
    const month = Number(item.month)
    if (Number.isInteger(month) && month >= 0 && month < MONTHS.length) {
      latest = Math.max(latest, month)
    }
  })

  Object.keys(state.snapshots || {}).forEach((monthKey) => {
    const month = Number(monthKey)
    if (Number.isInteger(month) && month >= 0 && month < MONTHS.length) {
      latest = Math.max(latest, month)
    }
  })

  state.contributions.forEach((entry) => {
    const month = monthFromISO(entry.portfolioDate || entry.date)
    if (month !== null) {
      latest = Math.max(latest, month)
    }
  })

  if (latest >= 0) {
    return latest
  }
  return MONTHS[fallbackMonth] ? fallbackMonth : 0
}

function formatStateMoney(value: unknown, currency: string): string {
  const safeCurrency = (currency || 'EUR').toUpperCase()
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(Number(value || 0))
  } catch {
    return `${Number(value || 0).toFixed(2)} ${safeCurrency}`
  }
}

function buildRangeOptions(activeRange: DashboardHeroRange): DashboardRangeOption[] {
  return [
    { value: '7d', label: '7D', active: activeRange === '7d' },
    { value: '1m', label: '1M', active: activeRange === '1m' },
    { value: '6m', label: '6M', active: activeRange === '6m' },
    { value: '1a', label: '1A', active: activeRange === '1a' },
  ]
}

function buildStatDelta(
  current: number,
  previous: number | null,
  previousAbbr: string,
  goodWhenUp: boolean,
): DashboardStatDelta | null {
  if (previous === null || previous === 0) {
    return null
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100
  const up = pct > 0.05
  const down = pct < -0.05
  const isGood = up ? goodWhenUp : down ? !goodWhenUp : null

  return {
    tag: `${up ? '▲' : down ? '▼' : '—'} ${formatDeltaPct(pct)}`,
    post: `vs. ${previousAbbr}`,
    tone: isGood === null ? 'neutral' : isGood ? 'good' : 'bad',
  }
}

function formatDeltaPct(pct: number): string {
  return `${Math.abs(pct).toFixed(1).replace('.', ',')}%`
}

function buildNetWorthChart(
  wealthSeries: Array<{ net: number }>,
  latestDataMonth: number,
  heroRange: DashboardHeroRange,
  formatMoney: (value: number) => string,
): DashboardLineChart {
  const fullMonths = MONTHS.slice(0, latestDataMonth + 1)
  const fullNets = wealthSeries.slice(0, latestDataMonth + 1).map((item) => item.net)
  const rangeCount: Record<DashboardHeroRange, number> = {
    '7d': 2,
    '1m': 2,
    '6m': 6,
    '1a': 12,
  }
  const start = Math.max(0, fullNets.length - Math.max(2, rangeCount[heroRange]))
  return {
    labels: Array.from(fullMonths.slice(start)),
    values: fullNets.slice(start),
    endpoint: formatMoney(fullNets.length ? fullNets[fullNets.length - 1] : 0),
  }
}

function buildTopExpenses(
  expenseActuals: Record<string, number>,
  formatMoney: (value: number) => string,
): DashboardTopExpenseItem[] {
  const expenseTotal = Object.values(expenseActuals).reduce((sum, value) => sum + value, 0)
  return Object.entries(expenseActuals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, amount]) => {
      const pct = expenseTotal > 0 ? (amount / expenseTotal) * 100 : 0
      return {
        category,
        emoji: getCategoryEmoji('expense', category),
        amount: formatMoney(amount),
        pct: `${pct.toFixed(1).replace('.', ',')}%`,
        pctValue: pct,
      }
    })
}

function buildWealthSplit({
  state,
  month,
  getWealthByMonth,
  computeInvestmentValue,
  formatMoney,
}: Pick<
  DashboardViewModelOptions,
  'state' | 'getWealthByMonth' | 'computeInvestmentValue' | 'formatMoney'
> & { month: number }): DashboardWealthSplitItem[] {
  const wealth = getWealthByMonth(month)
  const { fundsValue, cryptoValue } = getInvestmentBuckets(state, month, computeInvestmentValue)
  const otherInvest = Math.max(round2(wealth.investment - fundsValue - cryptoValue), 0)
  const items = [
    {
      label: 'Efectivo',
      colorVar: '--primary',
      fallbackColor: '#3B6BF0',
      value: Math.max(round2(wealth.liquidity), 0),
    },
    {
      label: 'Fondos',
      colorVar: '--invest',
      fallbackColor: '#6A52E8',
      value: Math.max(round2(fundsValue), 0),
    },
    {
      label: 'Cripto',
      colorVar: '--accent',
      fallbackColor: '#F59E0B',
      value: Math.max(round2(cryptoValue), 0),
    },
    {
      label: 'Otras inversiones',
      colorVar: '--income',
      fallbackColor: '#0E9F6E',
      value: otherInvest,
    },
  ].filter((item) => item.value > 0)
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return items.map((item) => {
    const pct = total > 0 ? (item.value / total) * 100 : 0
    return {
      ...item,
      amount: formatMoney(item.value),
      pct: `${pct.toFixed(0)}%`,
    }
  })
}

function buildRecentTransactions(
  state: State,
  formatMoney: (value: number) => string,
): DashboardRecentTransaction[] {
  return [...state.transactions]
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)),
    )
    .slice(0, 8)
    .map((transaction) => ({
      id: transaction.id,
      date: formatTxDate(transaction.date),
      description: transaction.description || '—',
      category: transaction.category || 'Sin categoría',
      emoji: getCategoryEmoji(transaction.type, transaction.category),
      typeLabel: TYPE_LABEL[transaction.type] || transaction.type,
      amount: formatMoney(Math.abs(transaction.amount)),
      sign: transaction.type === 'income' ? '+' : '−',
      tone: transaction.type,
    }))
}

function formatTxDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!match) {
    return String(iso || '')
  }
  const monthIndex = Math.min(Math.max(parseIntSafe(match[2], 1) - 1, 0), 11)
  return `${match[3]} ${MONTH_ABBR[monthIndex]} ${match[1]}`
}

function buildSavingsGoal({
  state,
  month,
  getWealthByMonth,
  computeInvestmentValue,
  formatMoney,
}: Pick<
  DashboardViewModelOptions,
  'state' | 'getWealthByMonth' | 'computeInvestmentValue' | 'formatMoney'
> & { month: number }): DashboardSavingsGoal {
  const nearest = getNearestSavingsGoal(state)
  if (!nearest) {
    return {
      kind: 'empty',
      message: 'Define un objetivo de ahorro en la sección Objetivos.',
    }
  }

  const currentMap = goalCurrentMap({
    state,
    month,
    getWealthByMonth,
    computeInvestmentValue,
  })
  const current = round2(currentMap[nearest.key] || 0)
  const target = Math.max(round2(nearest.goal.targetAmount || 0), 0)
  const progress = target <= 0 ? 0 : Math.min(Math.max((current / target) * 100, 0), 100)
  const remaining = round2(Math.max(target - current, 0))

  return {
    kind: 'goal',
    name: nearest.goal.name || 'Objetivo',
    targetYear: nearest.goal.targetYear,
    target: formatMoney(target),
    current: formatMoney(current),
    progress,
    progressLabel: `${progress.toFixed(0)}%`,
    subLabel: `Ahorrado de ${formatMoney(target)}`,
    remainingLabel:
      remaining > 0
        ? `Te quedan ${formatMoney(remaining)} para alcanzar tu objetivo.`
        : '¡Objetivo alcanzado!',
    remainingTone: remaining > 0 ? 'bad' : 'good',
  }
}

function getNearestSavingsGoal(state: State): { key: GoalKey; goal: Goal } | null {
  const candidates = (['short', 'medium', 'long'] as GoalKey[])
    .map((key) => ({ key, goal: state.goals[key] }))
    .filter((candidate) => candidate.goal && (candidate.goal.targetAmount || 0) > 0)
  if (!candidates.length) {
    return null
  }
  candidates.sort((a, b) => (a.goal.targetYear || 0) - (b.goal.targetYear || 0))
  return candidates[0]
}

function goalCurrentMap({
  state,
  month,
  getWealthByMonth,
  computeInvestmentValue,
}: Pick<DashboardViewModelOptions, 'state' | 'getWealthByMonth' | 'computeInvestmentValue'> & {
  month: number
}): Record<GoalKey, number> {
  const wealth = getWealthByMonth(month)
  const { fundsValue, cryptoValue } = getInvestmentBuckets(state, month, computeInvestmentValue)
  return {
    short: wealth.net,
    medium: wealth.net,
    long: wealth.net,
    investmentTotal: wealth.investment,
    investmentFunds: fundsValue,
    investmentCrypto: cryptoValue,
  }
}

function getInvestmentBuckets(
  state: State,
  month: number,
  computeInvestmentValue: (assetId: string, month: number) => number,
) {
  const fundsValue = state.investmentAssets
    .filter((asset) => /fond|index/i.test(asset.name))
    .reduce((sum, asset) => sum + computeInvestmentValue(asset.id, month), 0)
  const cryptoValue = state.investmentAssets
    .filter((asset) => /crypto|btc|eth/i.test(asset.name))
    .reduce((sum, asset) => sum + computeInvestmentValue(asset.id, month), 0)
  return { fundsValue, cryptoValue }
}
