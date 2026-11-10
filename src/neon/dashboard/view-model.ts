import { ALL_MONTHS, monthIndex, type Month } from '../../lib/month'
import { getWealthByMonth } from '../../lib/finance-core'
import {
  formatCompactMoney,
  formatDayMonth,
  formatMoney as formatMoneyIn,
  formatMonthName,
  formatPercent,
  formatSignedMoney as formatSignedMoneyIn,
  formatWeekdayDate,
} from '../../lib/format'
import type { PendingMovement, State, Transaction, TransactionType } from '../../scripts/types'
import { accountingYear, monthTotals, signedAmount } from '../../domain/transactions/registry'
import { buildGoalsViewModel } from '../../domain/goals/view-model'
import { buildInvestmentDashboardViewModel } from '../../domain/investment/view-model'
import { buildLineChart, type LabelledLineChart } from '../ui/line-chart'

/**
 * The home of the new design (DESIGN.md, «Inicio en escritorio»): what is left
 * this month, what waits for a yes, net worth, investments, the latest
 * movements, spending by category and goals. Always one month, with no picker:
 * the current one while the configured year is this year, December for a past
 * year and January for a coming one (the year lives in Configuración).
 */

export type WealthRange = '1m' | '6m' | '1a'
export type RecentFilter = 'all' | TransactionType
/** Gain, loss or neither: the text color of a figure. */
export type FigureTone = 'gain' | 'loss' | 'neutral'

export interface MonthBar {
  month: string
  value: string
  /** Share of the highest of the six months, 0–100. */
  height: number
  current: boolean
}

export interface MonthRow {
  kind: 'income' | 'expense' | 'investment'
  label: string
  amount: string
  bars: MonthBar[]
  /** The six months read aloud, for the bars are decoration to a screen reader. */
  history: string
}

export interface SpendingPace {
  lead: string
  emphasis: string
  tail: string
  tone: FigureTone
}

export type DashboardChart = LabelledLineChart

export interface NeonDashboardViewModel {
  /** «Jueves, 9 de octubre» */
  date: string
  title: string
  lede: string
  month: {
    name: string
    status: string
    /** «Te quedan», or «Te quedaron» once the month is closed. */
    leftLabel: string
    left: { text: string; tone: FigureTone }
    income: string
    pendingNote: string
    split: {
      segments: Array<{ key: 'expense' | 'investment' | 'unspent'; weight: number }>
      label: string
    } | null
    rows: MonthRow[]
    pace: SpendingPace | null
  }
  pending: {
    count: number
    items: Array<{ id: string; description: string; amount: string; due: string; tone: FigureTone }>
    moreLabel: string | null
  }
  wealth: {
    value: string
    monthChange: { text: string; tone: FigureTone } | null
    yearChange: { text: string; tone: FigureTone } | null
    chart: DashboardChart
  }
  investments: {
    value: string
    gain: { text: string; tone: FigureTone } | null
    positions: Array<{ name: string; weight: number; share: string }>
    chart: DashboardChart
    empty: boolean
  }
  recent: {
    items: Array<{
      id: string
      type: TransactionType
      description: string
      category: string
      date: string
      amount: string
    }>
    empty: string
  }
  categories: Array<{
    category: string
    spent: string
    limit: string | null
    /** Share of the limit spent, 0–100; 0 without a limit. */
    width: number
    over: boolean
  }>
  goals: Array<{ key: string; name: string; progress: string; width: number; detail: string }>
}

export const WEALTH_RANGES: ReadonlyArray<{ value: WealthRange; label: string }> = [
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1a', label: '1A' },
]

export const RECENT_FILTERS: ReadonlyArray<{ value: RecentFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'investment', label: 'Inversión' },
  { value: 'saving', label: 'Ahorro' },
]

const SHORT_MONTHS = [
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
] as const
const RANGE_POINTS: Record<WealthRange, number> = { '1m': 2, '6m': 6, '1a': 12 }
const HISTORY_MONTHS = 6
const PENDING_SHOWN = 3
const RECENT_LIMIT = 7
const CATEGORY_LIMIT = 5
const POSITION_LIMIT = 4
const ROW_LABEL = { income: 'Ingresos', expense: 'Gastos', investment: 'Inversión' } as const
/** Below this change (in %), the pace reads as the same. */
const SAME_PACE = 0.05

type Period = { year: number; month: Month }

const round2 = (value: number) => Math.round(value * 100) / 100

function previous({ year, month }: Period): Period {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: (month - 1) as Month }
}

/** The month the dashboard is about, and how far into it today is. */
function shownPeriod(
  year: number,
  today: string,
): Period & { phase: 'open' | 'closed' | 'coming' } {
  const todayYear = Number(today.slice(0, 4))
  if (year < todayYear) return { year, month: 12, phase: 'closed' }
  if (year > todayYear) return { year, month: 1, phase: 'coming' }
  return { year, month: Number(today.slice(5, 7)) as Month, phase: 'open' }
}

function inPeriod(tx: Transaction, { year, month }: Period): boolean {
  return Number(tx.month) === month && accountingYear(tx) === year
}

export function buildNeonDashboardViewModel({
  state,
  pending,
  range,
  recentFilter,
  today,
}: {
  state: State
  /** The open pending movements, in the order to show them. */
  pending: readonly PendingMovement[]
  range: WealthRange
  recentFilter: RecentFilter
  today: string
}): NeonDashboardViewModel {
  const currency = state.currency || 'EUR'
  const money = (value: number) => formatMoneyIn(value, currency)
  const signed = (value: number) => formatSignedMoneyIn(value, currency)
  const period = shownPeriod(state.year, today)
  const monthName = formatMonthName(period.month)
  const totals = monthTotals(state.transactions, period.year, period.month)
  const left = totals.net
  const pendingTotal = round2(pending.reduce((sum, item) => sum + signedAmount(item), 0))
  const pendingCount = pending.length
  const pendingWords = `${pendingCount} ${pendingCount === 1 ? 'movimiento' : 'movimientos'}`

  const lede =
    period.phase === 'closed'
      ? `Te quedaron ${money(left)} de lo que entró en ${monthName.toLowerCase()}.`
      : `Te quedan ${money(left)} para el resto del mes${
          pendingCount ? ` y ${pendingWords} por confirmar.` : '. No queda nada por confirmar.'
        }`

  return {
    date: formatWeekdayDate(today),
    title: `${period.phase === 'closed' ? 'Así fue' : 'Así va'} ${monthName.toLowerCase()}`,
    lede,
    month: {
      name: monthName,
      status: monthStatus(period, today),
      leftLabel: period.phase === 'closed' ? 'Te quedaron' : 'Te quedan',
      left: { text: money(left), tone: left < 0 ? 'loss' : 'neutral' },
      income: money(totals.income),
      pendingNote: pendingCount ? `${signed(pendingTotal)} por confirmar` : 'nada por confirmar',
      split: incomeSplit(totals),
      rows: monthRows(state.transactions, period, money),
      pace: spendingPace(state.transactions, period, today),
    },
    pending: {
      count: pendingCount,
      items: pending.slice(0, PENDING_SHOWN).map((item) => {
        const amount = signedAmount(item)
        return {
          id: item.id,
          description: item.description,
          amount: item.type === 'saving' ? money(Math.abs(item.amount)) : signed(amount),
          due: `vence el ${formatDayMonth(item.occurrenceDate)}`,
          tone: amount > 0 ? 'gain' : 'neutral',
        }
      }),
      moreLabel: pendingCount > PENDING_SHOWN ? `Ver los ${pendingCount} pendientes` : null,
    },
    wealth: wealthBlock(state, period, range, money, signed),
    investments: investmentsBlock(state, period, money, signed),
    recent: recentBlock(state.transactions, period, recentFilter, money),
    categories: categoriesBlock(state, period, money),
    goals: goalsBlock(state, period, money, today),
  }
}

function monthStatus(period: ReturnType<typeof shownPeriod>, today: string): string {
  if (period.phase === 'closed') return 'Mes cerrado'
  if (period.phase === 'coming') return 'Mes por empezar'
  const days = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate()
  return `día ${Number(today.slice(8, 10))} de ${days}`
}

function incomeSplit(
  totals: ReturnType<typeof monthTotals>,
): NeonDashboardViewModel['month']['split'] {
  if (totals.income <= 0) return null
  const spent = totals.expense + totals.investment
  // When spending passes the income, the bar shows how the spending split.
  const base = Math.max(totals.income, spent)
  const weight = (value: number) => round2((Math.max(value, 0) / base) * 100)
  const segments = [
    { key: 'expense' as const, label: 'gastos', weight: weight(totals.expense) },
    { key: 'investment' as const, label: 'inversión', weight: weight(totals.investment) },
    { key: 'unspent' as const, label: 'sin gastar', weight: weight(totals.income - spent) },
  ]
  return {
    segments: segments.map(({ key, weight }) => ({ key, weight })),
    label: `Reparto de los ingresos: ${segments
      .map(({ label, weight }) => `${label} ${formatPercent(weight, { digits: 1 })}`)
      .join(', ')}`,
  }
}

function monthRows(
  transactions: Transaction[],
  period: Period,
  money: (value: number) => string,
): MonthRow[] {
  const periods: Period[] = [period]
  while (periods.length < HISTORY_MONTHS) periods.unshift(previous(periods[0]))
  const history = periods.map((target) => monthTotals(transactions, target.year, target.month))

  return (['income', 'expense', 'investment'] as const).map((kind) => {
    const values = history.map((totals) => totals[kind])
    const highest = Math.max(...values, 0)
    const format = (value: number) =>
      value === 0 ? money(0) : `${kind === 'income' ? '+' : '−'}${money(value)}`
    return {
      kind,
      label: ROW_LABEL[kind],
      amount: format(values[values.length - 1]),
      bars: values.map((value, index) => ({
        month: SHORT_MONTHS[monthIndex(periods[index].month)],
        value: format(value),
        height: highest > 0 ? round2((value / highest) * 100) : 0,
        current: index === values.length - 1,
      })),
      history: `Últimos seis meses: ${values
        .map((value, index) => `${SHORT_MONTHS[monthIndex(periods[index].month)]} ${format(value)}`)
        .join(', ')}.`,
    }
  })
}

/** Expenses of the month against the previous one, both up to the same day of the month. */
function spendingPace(
  transactions: Transaction[],
  period: ReturnType<typeof shownPeriod>,
  today: string,
): SpendingPace | null {
  if (period.phase === 'coming') return null
  const day = period.phase === 'open' ? Number(today.slice(8, 10)) : 31
  const before = previous(period)
  const spentUpTo = (target: Period) =>
    round2(
      transactions
        .filter(
          (tx) =>
            tx.type === 'expense' && inPeriod(tx, target) && Number(tx.date.slice(8, 10)) <= day,
        )
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
    )
  const base = spentUpTo(before)
  if (base <= 0) return null
  const change = ((spentUpTo(period) - base) / base) * 100
  const open = period.phase === 'open'
  const against = formatMonthName(before.month).toLowerCase()
  if (Math.abs(change) < SAME_PACE) {
    return {
      lead: open ? 'Llevas ' : 'Gastaste ',
      emphasis: 'lo mismo',
      tail: open ? ` que a estas alturas de ${against}.` : ` que en ${against}.`,
      tone: 'neutral',
    }
  }
  return {
    lead: open ? 'Llevas un ' : 'Gastaste un ',
    emphasis: `${formatPercent(Math.abs(change), { digits: 1 })} ${change < 0 ? 'menos' : 'más'}`,
    tail: open ? ` de gasto que a estas alturas de ${against}.` : ` que en ${against}.`,
    tone: change < 0 ? 'gain' : 'loss',
  }
}

function chart(
  values: number[],
  labels: string[],
  money: (value: number) => string,
  axis: (value: number) => string,
  name: string,
): DashboardChart {
  const geometry = buildLineChart(values)
  return {
    ...geometry,
    labels,
    tickLabels: geometry.ticks.map((tick) => axis(tick.value)),
    label: values.length
      ? `Evolución ${name}: de ${money(values[0])} a ${money(values[values.length - 1])}`
      : `Evolución ${name}: sin datos`,
  }
}

function change(
  current: number,
  from: number,
  signed: (value: number) => string,
  withShare: boolean,
): { text: string; tone: FigureTone } {
  const amount = round2(current - from)
  const share =
    withShare && from !== 0
      ? ` (${formatPercent((amount / Math.abs(from)) * 100, { digits: 1, signed: true })})`
      : ''
  return { text: `${signed(amount)}${share}`, tone: amount < 0 ? 'loss' : 'gain' }
}

function wealthBlock(
  state: State,
  period: Period,
  range: WealthRange,
  money: (value: number) => string,
  signed: (value: number) => string,
): NeonDashboardViewModel['wealth'] {
  const months = ALL_MONTHS.filter((month) => month <= period.month)
  const nets = months.map(
    (month) =>
      getWealthByMonth(
        month,
        state.accounts,
        state.investmentAssets,
        state.liabilities,
        state.transactions,
        state.snapshots,
      ).net,
  )
  const current = nets[nets.length - 1] ?? 0
  const start = Math.max(0, nets.length - RANGE_POINTS[range])

  return {
    value: money(current),
    monthChange: nets.length > 1 ? change(current, nets[nets.length - 2], signed, true) : null,
    yearChange: nets.length > 1 ? change(current, nets[0], signed, false) : null,
    chart: chart(
      nets.slice(start),
      months.slice(start).map((month) => SHORT_MONTHS[monthIndex(month)]),
      money,
      (value) => formatCompactMoney(value, state.currency || 'EUR'),
      'del patrimonio',
    ),
  }
}

function investmentsBlock(
  state: State,
  period: Period,
  money: (value: number) => string,
  signed: (value: number) => string,
): NeonDashboardViewModel['investments'] {
  const portfolio = buildInvestmentDashboardViewModel(state, period.month, 'simple')
  const ranked = portfolio.positions.filter((position) => position.weight > 0)
  const shown = ranked.slice(0, POSITION_LIMIT).map((position) => ({
    name: position.symbol || position.name,
    weight: round2(position.weight),
  }))
  const rest = ranked.slice(POSITION_LIMIT).reduce((sum, position) => sum + position.weight, 0)
  if (rest > 0) shown.push({ name: 'Otros', weight: round2(rest) })
  const values = portfolio.valueSeries[0]?.values ?? []
  const labels = portfolio.chartLabels.map((label, index) =>
    index === 0 ? 'ini' : SHORT_MONTHS[(index - 1) % 12],
  )

  return {
    value: money(portfolio.portfolioValue),
    gain:
      portfolio.investedCapital > 0
        ? change(portfolio.portfolioValue, portfolio.investedCapital, signed, true)
        : null,
    positions: shown.map((position) => ({
      ...position,
      share: formatPercent(position.weight, { digits: 1 }),
    })),
    chart: chart(
      values,
      labels,
      money,
      (value) => formatCompactMoney(value, state.currency || 'EUR'),
      'de la cartera',
    ),
    empty: portfolio.portfolioValue <= 0 && !ranked.length,
  }
}

function recentBlock(
  transactions: Transaction[],
  period: Period,
  filter: RecentFilter,
  money: (value: number) => string,
): NeonDashboardViewModel['recent'] {
  const items = transactions
    .filter((tx) => inPeriod(tx, period) && (filter === 'all' || tx.type === filter))
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)),
    )
    .slice(0, RECENT_LIMIT)
    .map((tx) => {
      const amount = Math.abs(Number(tx.amount || 0))
      // A saving moves money between accounts: no sign.
      const sign = tx.type === 'income' ? '+' : tx.type === 'saving' ? '' : '−'
      return {
        id: tx.id,
        type: tx.type,
        description: tx.description || '—',
        category: tx.category || 'Sin categoría',
        date: formatDayMonth(tx.date),
        amount: `${sign}${money(amount)}`,
      }
    })

  return {
    items,
    empty:
      filter === 'saving'
        ? 'Aún no has apartado nada este mes.'
        : filter === 'all'
          ? 'Aún no hay movimientos este mes.'
          : 'No hay movimientos de este tipo este mes.',
  }
}

function categoriesBlock(
  state: State,
  period: Period,
  money: (value: number) => string,
): NeonDashboardViewModel['categories'] {
  const spent = new Map<string, number>()
  state.transactions
    .filter((tx) => tx.type === 'expense' && inPeriod(tx, period))
    .forEach((tx) => spent.set(tx.category, (spent.get(tx.category) ?? 0) + Number(tx.amount || 0)))
  const limits = new Map<string, number>()
  Object.entries(state.budget?.expense ?? {}).forEach(([category, months]) => {
    const limit = Number(months?.[monthIndex(period.month)] || 0)
    if (limit > 0) limits.set(category, limit)
  })

  return [...new Set([...spent.keys(), ...limits.keys()])]
    .map((category) => ({
      category,
      amount: round2(spent.get(category) ?? 0),
      limit: limits.get(category) ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount || b.limit - a.limit)
    .slice(0, CATEGORY_LIMIT)
    .map(({ category, amount, limit }) => ({
      category,
      spent: money(amount),
      limit: limit > 0 ? money(limit) : null,
      width: limit > 0 ? round2(Math.min(amount / limit, 1) * 100) : 0,
      over: limit > 0 && amount > limit,
    }))
}

function goalsBlock(
  state: State,
  period: Period,
  money: (value: number) => string,
  today: string,
): NeonDashboardViewModel['goals'] {
  if (!state.goals) return []
  const now = new Date(`${today}T12:00:00`)
  return buildGoalsViewModel(state, period.month, now)
    .net.rows.filter((row) => row.defined)
    .map((row) => {
      const progress = Math.max(row.progress, 0)
      return {
        key: row.key,
        name: row.name,
        progress: formatPercent(progress, { digits: 0 }),
        width: round2(progress),
        detail: row.met
          ? `${money(Math.max(row.current, 0))} · objetivo alcanzado`
          : `${money(Math.max(row.current, 0))} de ${money(row.target)} · para ${row.goal.targetYear}`,
      }
    })
}
