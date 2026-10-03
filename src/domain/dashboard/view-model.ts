import { MONTHS, type BudgetType, type GoalKey, type MonthTotals, type State } from '../../scripts/types'
import { monthFromISO, round2, todayISO } from '../../scripts/utils'
import {
  computeInvestmentValue as computeCoreInvestmentValue,
  getCategoryActuals as getCoreCategoryActuals,
  getMonthTotals as getCoreMonthTotals,
  getWealthByMonth as getCoreWealthByMonth,
} from '../../lib/finance-core'
import {
  formatDayMonth,
  formatMoney as formatMoneyIn,
  formatMonthName,
  formatPercent,
  formatSignedMoney,
} from '../../lib/format'
import { getCategoriesForType } from '../transactions/categories'
import { getInvestmentBuckets } from '../investment/buckets'
import { buildGoalsViewModel } from '../goals/view-model'
import type { Tone } from '../../components/ui/tone'

export type DashboardHeroRange = '1m' | '6m' | '1a'
export type DashboardTone = 'neutral' | 'good' | 'bad'
export type DashboardTrend = 'up' | 'down' | 'flat'
export type DashboardKpiKind = BudgetType

export interface DashboardMonthOption {
  value: number
  label: string
}

export interface DashboardRangeOption {
  value: DashboardHeroRange
  label: string
}

export interface DashboardNetWorthBand {
  value: string
  /** Against the previous month; null in January or without data. */
  monthChange: { share: string; amount: string; against: string; tone: Tone } | null
  /** From January to the month: the state holds one year. */
  yearChange: { label: string; tone: Tone } | null
}

export interface DashboardKpi {
  kind: DashboardKpiKind
  label: string
  value: string
  /** "Agosto: 2.450,00 €"; null in January. */
  previous: string | null
  change: { label: string; trend: DashboardTrend; tone: DashboardTone } | null
  /** Up to the last six months, oldest first; height is a share of the highest (0–100). */
  bars: Array<{ month: string; height: number; current: boolean }>
}

export interface DashboardIncomeSplit {
  segments: Array<{
    key: 'expense' | 'investment' | 'unspent'
    label: string
    weight: number
    share: string
  }>
  /** What is left of every 100 that came in. */
  keptPer100: string
  unspent: string
}

export interface DashboardLineChart {
  labels: string[]
  values: number[]
  max: string
}

export interface DashboardTopExpenseItem {
  category: string
  rank: string
  amount: string
  share: string
  /** Bar length against the largest category (0–100). */
  width: number
  detail: string
}

export interface DashboardTopExpenses {
  summary: string
  items: DashboardTopExpenseItem[]
}

export type DashboardWealthKind = 'cash' | 'funds' | 'crypto' | 'other'

export interface DashboardWealthSplitItem {
  kind: DashboardWealthKind
  label: string
  value: number
  /** Share of the total (0–100). */
  weight: number
  amount: string
  share: string
}

export interface DashboardWealthSplit {
  total: string
  items: DashboardWealthSplitItem[]
}

export interface DashboardRecentTransaction {
  id: string
  date: string
  description: string
  category: string
  initial: string
  amount: string
  tone: BudgetType
}

export interface DashboardGoal {
  key: string
  name: string
  progress: number
  progressLabel: string
  saved: string
  target: string
  detail: string
}

export interface DashboardGoals {
  summary: string
  items: DashboardGoal[]
}

export interface DashboardViewModel {
  year: number
  yearOptions: number[]
  currency: string
  month: number
  monthName: string
  monthStatus: string
  months: DashboardMonthOption[]
  ranges: DashboardRangeOption[]
  netWorth: DashboardNetWorthBand
  netWorthChart: DashboardLineChart
  kpis: DashboardKpi[]
  incomeSplit: DashboardIncomeSplit | null
  topExpenses: DashboardTopExpenses
  wealthSplit: DashboardWealthSplit
  recentTransactions: DashboardRecentTransaction[]
  goals: DashboardGoals
}

type Money = (value: number) => string
type Wealth = { liquidity: number; investment: number; liabilities: number; net: number }

const KPI_LABEL: Record<DashboardKpiKind, string> = {
  income: 'Ingresos',
  expense: 'Gastos',
  investment: 'Ahorro o inversión',
}
const KPI_GOOD_WHEN_UP: Record<DashboardKpiKind, boolean> = {
  income: true,
  expense: false,
  investment: true,
}
const KPI_BAR_MONTHS = 6
/** Below this change (in %), a KPI reads as unchanged. */
const FLAT_THRESHOLD = 0.005
const RECENT_LIMIT = 5
const TOP_EXPENSE_LIMIT = 4
/** The net-worth goals; the investment ones live in Objetivos only. */
const SAVINGS_GOALS: GoalKey[] = ['short', 'medium', 'long']

export function buildDashboardViewModelFromState({
  state,
  month,
  heroRange,
  today = todayISO(),
}: {
  state: State
  month: number
  heroRange: DashboardHeroRange
  today?: string
}): DashboardViewModel {
  const safeMonth = MONTHS[month] ? month : 0
  const formatMoney: Money = (value) => formatMoneyIn(value, state.currency || 'EUR')
  const monthTotals = MONTHS.map((_, target) => getCoreMonthTotals(state.transactions, target))
  const wealthByMonth = (target: number): Wealth =>
    getCoreWealthByMonth(
      target,
      state.accounts,
      state.investmentAssets,
      state.liabilities,
      state.transactions,
      state.snapshots,
    )
  const nets = MONTHS.map((_, target) => wealthByMonth(target).net)
  const series = (kind: DashboardKpiKind) => monthTotals.map((totals) => round2(totals[kind]))

  return {
    year: state.year,
    yearOptions: buildDashboardYearOptions(state),
    currency: state.currency,
    month: safeMonth,
    monthName: formatMonthName(safeMonth),
    monthStatus: buildMonthStatus(safeMonth, state.year, today),
    months: MONTHS.map((_, value) => ({ value, label: formatMonthName(value) })),
    ranges: RANGE_OPTIONS,
    netWorth: buildNetWorthBand(nets, safeMonth, state.currency || 'EUR'),
    netWorthChart: buildNetWorthChart(nets, getLatestDataMonth(state, safeMonth), heroRange, formatMoney),
    kpis: (['income', 'expense', 'investment'] as const).map((kind) =>
      buildKpi(kind, series(kind), safeMonth, formatMoney),
    ),
    incomeSplit: buildIncomeSplit(monthTotals[safeMonth], formatMoney),
    topExpenses: buildTopExpenses(state, safeMonth, formatMoney),
    wealthSplit: buildWealthSplit(state, safeMonth, wealthByMonth(safeMonth), formatMoney),
    recentTransactions: buildRecentTransactions(state, formatMoney),
    goals: buildGoals(state, safeMonth, formatMoney),
  }
}

/** One month figure with its change against the previous month and its last six months. */
export function buildKpi(
  kind: DashboardKpiKind,
  totals: number[],
  month: number,
  formatMoney: Money,
): DashboardKpi {
  const current = totals[month] ?? 0
  const previous = month > 0 ? (totals[month - 1] ?? 0) : null
  const window = totals.slice(Math.max(0, month - KPI_BAR_MONTHS + 1), month + 1)
  const highest = Math.max(...window, 0)
  const firstMonth = month - window.length + 1

  return {
    kind,
    label: KPI_LABEL[kind],
    value: formatMoney(current),
    previous:
      previous === null ? null : `${formatMonthName(month - 1)}: ${formatMoney(previous)}`,
    change: previous ? buildChange(current, previous, KPI_GOOD_WHEN_UP[kind]) : null,
    bars: window.map((value, index) => ({
      month: formatMonthName(firstMonth + index),
      height: highest > 0 ? round2((value / highest) * 100) : 0,
      current: index === window.length - 1,
    })),
  }
}

function buildChange(
  current: number,
  previous: number,
  goodWhenUp: boolean,
): NonNullable<DashboardKpi['change']> {
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const trend: DashboardTrend = pct > FLAT_THRESHOLD ? 'up' : pct < -FLAT_THRESHOLD ? 'down' : 'flat'
  const tone: DashboardTone =
    trend === 'flat' ? 'neutral' : (trend === 'up') === goodWhenUp ? 'good' : 'bad'
  return { label: formatPercent(Math.abs(pct)), trend, tone }
}

/** Where the month's income went: expenses, investment and what is left unspent. */
export function buildIncomeSplit(
  totals: MonthTotals,
  formatMoney: Money,
): DashboardIncomeSplit | null {
  if (totals.income <= 0) return null
  const share = (value: number) => round2((Math.max(value, 0) / totals.income) * 100)
  const spent = totals.expense + totals.investment
  // When spending passes the income, the bar shows how the spending split.
  const base = Math.max(totals.income, spent)
  const weight = (value: number) => round2((Math.max(value, 0) / base) * 100)
  const unspent = Math.max(totals.income - spent, 0)

  return {
    segments: [
      { key: 'expense', label: 'Gastos', weight: weight(totals.expense), share: formatPercent(weight(totals.expense)) },
      {
        key: 'investment',
        label: 'Inversión',
        weight: weight(totals.investment),
        share: formatPercent(weight(totals.investment)),
      },
      { key: 'unspent', label: 'Sin gastar', weight: weight(unspent), share: formatPercent(weight(unspent)) },
    ],
    keptPer100: formatMoney(share(unspent)),
    unspent: formatMoney(unspent),
  }
}

/** Net worth of the month, its change against the previous month and since January. */
export function buildNetWorthBand(
  nets: number[],
  month: number,
  currency: string,
): DashboardNetWorthBand {
  const current = nets[month] ?? 0
  const previous = month > 0 ? (nets[month - 1] ?? 0) : null
  const january = month > 0 ? (nets[0] ?? 0) : null
  const change = (from: number) => {
    const amount = round2(current - from)
    return {
      amount: formatSignedMoney(amount, currency),
      share: formatPercent((amount / Math.abs(from)) * 100, { signed: true }),
      tone: (amount >= 0 ? 'gain' : 'loss') as Tone,
    }
  }
  const monthChange = previous ? change(previous) : null
  const yearChange = january ? change(january) : null

  return {
    value: formatMoneyIn(current, currency),
    monthChange: monthChange && {
      ...monthChange,
      against: formatMonthName(month - 1).toLowerCase(),
    },
    yearChange: yearChange && {
      label: `${yearChange.amount} · ${yearChange.share}`,
      tone: yearChange.tone,
    },
  }
}

/** "Mes en curso · día 28 de 30" for the current month; closed or upcoming otherwise. */
export function buildMonthStatus(month: number, year: number, today: string): string {
  const todayYear = Number(today.slice(0, 4))
  const todayMonth = Number(today.slice(5, 7)) - 1
  const order = year * 12 + month - (todayYear * 12 + todayMonth)
  if (order < 0) return 'Mes cerrado'
  if (order > 0) return 'Mes por empezar'
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `Mes en curso · día ${Number(today.slice(8, 10))} de ${daysInMonth}`
}

const RANGE_OPTIONS: DashboardRangeOption[] = [
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1a', label: '1A' },
]

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

function getLatestDataMonth(state: State, fallbackMonth: number): number {
  let latest = -1
  const consider = (month: number | null) => {
    if (month !== null && Number.isInteger(month) && month >= 0 && month < MONTHS.length) {
      latest = Math.max(latest, month)
    }
  }

  state.transactions.forEach((item) => consider(Number(item.month)))
  Object.keys(state.snapshots || {}).forEach((monthKey) => consider(Number(monthKey)))
  state.contributions.forEach((entry) => consider(monthFromISO(entry.portfolioDate || entry.date)))

  return latest >= 0 ? latest : fallbackMonth
}

function buildNetWorthChart(
  nets: number[],
  latestDataMonth: number,
  heroRange: DashboardHeroRange,
  formatMoney: Money,
): DashboardLineChart {
  const fullMonths = MONTHS.slice(0, latestDataMonth + 1)
  const fullNets = nets.slice(0, latestDataMonth + 1)
  const rangeCount: Record<DashboardHeroRange, number> = { '1m': 2, '6m': 6, '1a': 12 }
  const start = Math.max(0, fullNets.length - Math.max(2, rangeCount[heroRange]))
  const values = fullNets.slice(start)
  return {
    labels: Array.from(fullMonths.slice(start)),
    values,
    max: formatMoney(values.length ? Math.max(...values) : 0),
  }
}

function buildTopExpenses(state: State, month: number, formatMoney: Money): DashboardTopExpenses {
  const actuals = getCoreCategoryActuals(
    state.transactions,
    'expense',
    month,
    getCategoriesForType(state, 'expense'),
  )
  const entries = Object.entries(actuals)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0)
  const largest = entries[0]?.[1] ?? 0
  const counts = new Map<string, number>()
  state.transactions
    .filter((item) => item.type === 'expense' && Number(item.month) === month)
    .forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1))
  const categories = entries.length === 1 ? 'categoría' : 'categorías'

  return {
    summary: entries.length ? `${formatMoney(total)} en ${entries.length} ${categories}` : '',
    items: entries.slice(0, TOP_EXPENSE_LIMIT).map(([category, amount], index) => {
      const count = counts.get(category) ?? 0
      return {
        category,
        rank: String(index + 1).padStart(2, '0'),
        amount: formatMoney(amount),
        share: formatPercent((amount / total) * 100, { digits: 1 }),
        width: round2((amount / largest) * 100),
        detail: `${count} ${count === 1 ? 'movimiento' : 'movimientos'}`,
      }
    }),
  }
}

function buildWealthSplit(
  state: State,
  month: number,
  wealth: Wealth,
  formatMoney: Money,
): DashboardWealthSplit {
  const { fundsValue, cryptoValue } = getInvestmentBuckets(
    state.investmentAssets,
    month,
    (assetId, target) =>
      computeCoreInvestmentValue(
        assetId,
        target,
        state.investmentAssets,
        state.transactions,
        state.snapshots,
      ),
  )
  const buckets: Array<Pick<DashboardWealthSplitItem, 'kind' | 'label' | 'value'>> = [
    { kind: 'cash', label: 'Efectivo', value: wealth.liquidity },
    { kind: 'funds', label: 'Fondos', value: fundsValue },
    { kind: 'crypto', label: 'Cripto', value: cryptoValue },
    { kind: 'other', label: 'Otras inversiones', value: wealth.investment - fundsValue - cryptoValue },
  ]
  const items = buckets
    .map((item) => ({ ...item, value: Math.max(round2(item.value), 0) }))
    .filter((item) => item.value > 0)
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return {
    total: formatMoney(total),
    items: items.map((item) => {
      const weight = total > 0 ? (item.value / total) * 100 : 0
      return {
        ...item,
        weight,
        amount: formatMoney(item.value),
        share: formatPercent(weight, { digits: 1 }),
      }
    }),
  }
}

function buildRecentTransactions(state: State, formatMoney: Money): DashboardRecentTransaction[] {
  return [...state.transactions]
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)),
    )
    .slice(0, RECENT_LIMIT)
    .map((transaction) => {
      const description = transaction.description || '—'
      return {
        id: transaction.id,
        date: formatDayMonth(transaction.date),
        description,
        category: transaction.category || 'Sin categoría',
        initial: description.charAt(0).toUpperCase(),
        amount: `${transaction.type === 'income' ? '+' : '−'}${formatMoney(Math.abs(transaction.amount))}`,
        tone: transaction.type,
      }
    })
}

function buildGoals(state: State, month: number, formatMoney: Money): DashboardGoals {
  const goals = buildGoalsViewModel(state, month).progressItems.filter(
    (item) => SAVINGS_GOALS.includes(item.key) && item.target > 0,
  )
  const saved = goals.reduce((sum, item) => sum + Math.max(Math.min(item.current, item.target), 0), 0)
  const target = goals.reduce((sum, item) => sum + item.target, 0)

  return {
    summary: goals.length ? `${formatMoney(saved)} de ${formatMoney(target)}` : '',
    items: goals.map((item) => ({
      key: item.key,
      name: item.goal.name || item.title,
      progress: Math.max(item.progress, 0),
      progressLabel: formatPercent(Math.max(item.progress, 0), { digits: 0 }),
      saved: formatMoney(Math.max(item.current, 0)),
      target: formatMoney(item.target),
      detail:
        item.remaining > 0
          ? `${item.goal.targetYear} · ${formatMoney(item.monthlyNeeded)} al mes`
          : 'Objetivo alcanzado',
    })),
  }
}
