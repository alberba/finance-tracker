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

/** The stretch the charts of the home draw, picked in the header. */
/** A preset of the charts' range, or `from-N`: from month N of the accounting year until today. */
export type ChartPreset = '1m' | '3m' | '6m' | '1a'
export type ChartRange = ChartPreset | `from-${number}`
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
  /** «ene – nov 2026»: the stretch the charts draw, beside the range picker. */
  rangeSpan: string
  /**
   * The picker's options: each preset with the months it would draw, as text
   * and as positions 1–12 in the accounting year (for its little month strip).
   */
  rangeOptions: Array<{ value: ChartRange; label: string; span: string }>
  /** What the picker says for the range in use: «último año», «desde mayo». */
  rangeLabel: string
  /**
   * The accounting year's twelve months for the picker's ruler: the ones the
   * charts draw are lit, and only months before this one can be a start.
   */
  rangeMonths: Array<{
    value: ChartRange
    initial: string
    name: string
    lit: boolean
    disabled: boolean
  }>
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
    /** Change since the start of the chart range, as a share; null on «1m» (it is this month's). */
    periodChange: { text: string; tone: FigureTone; label: string } | null
    /** Per chart point, the same two changes as of that month, for while it is read. */
    steps: Array<{
      month: { text: string; tone: FigureTone; label: string } | null
      period: { text: string; tone: FigureTone; label: string } | null
    }>
    chart: DashboardChart
  }
  investments: {
    value: string
    /** Value against what was put in: the gain or loss the card answers with. */
    gain: { text: string; tone: FigureTone } | null
    /** What was put in («17.167,93 €»), the gain's baseline; null with nothing invested. */
    invested: string | null
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
      /** «21 nov», for the row's accessible name. */
      date: string
      /** The day of the month («21»), shown once per day in the date column. */
      day: string
      /** Under the day: «hoy», the weekday («sáb») or, dated outside the month, the month («oct»). */
      dayLabel: string
      /** The first movement of its day: the date column and the rule above it. */
      newDay: boolean
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

export const CHART_RANGES: ReadonlyArray<{ value: ChartPreset; label: string }> = [
  { value: '1m', label: 'Último mes' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '1a', label: 'Último año' },
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
// Monthly points, one more than the months of the range so it spans them;
// the data is the accounting year, so «1a» draws all of it.
const PERIOD_LABEL: Record<ChartPreset, string> = {
  '1m': 'este mes',
  '3m': 'en 3 meses',
  '6m': 'en 6 meses',
  '1a': 'en lo que va de año',
}
const RANGE_POINTS: Record<ChartPreset, number> = { '1m': 2, '3m': 4, '6m': 7, '1a': 13 }

/** The month a `from-N` range starts on, or null for a preset. */
function customStart(range: ChartRange): Month | null {
  return range.startsWith('from-') ? (Number(range.slice(5)) as Month) : null
}

/** How many monthly points a range draws as of `month`. */
function rangePoints(month: Month, range: ChartRange): number {
  const from = customStart(range)
  return from === null ? RANGE_POINTS[range as ChartPreset] : Math.max(month - from + 1, 1)
}

/** «en lo que va de año», «desde mayo»: what the change since the range's start is labelled. */
function periodLabel(range: ChartRange): string {
  const from = customStart(range)
  return from === null
    ? PERIOD_LABEL[range as ChartPreset]
    : `desde ${formatMonthName(from).toLocaleLowerCase('es')}`
}
const HISTORY_MONTHS = 6
// Ceilings for the lists of the home: the widgets show as many rows as their
// box fits (NeonFitList), so these only stop a very tall widget from running out.
const PENDING_SHOWN = 12
const RECENT_LIMIT = 12
const CATEGORY_LIMIT = 10
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
  today,
}: {
  state: State
  /** The open pending movements, in the order to show them. */
  pending: readonly PendingMovement[]
  range: ChartRange
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
    rangeSpan: rangeSpan(period, range),
    rangeOptions: CHART_RANGES.map((option) => ({
      ...option,
      span: rangeSpan(period, option.value),
    })),
    rangeLabel:
      customStart(range) === null
        ? (CHART_RANGES.find((option) => option.value === range)?.label ?? '').toLocaleLowerCase(
            'es',
          )
        : periodLabel(range),
    rangeMonths: ALL_MONTHS.map((month) => ({
      value: `from-${month}` as const,
      initial: SHORT_MONTHS[monthIndex(month)].charAt(0).toLocaleUpperCase('es'),
      name: formatMonthName(month),
      lit: month >= rangeStart(period, range) && month <= period.month,
      disabled: month >= period.month,
    })),
    month: {
      name: monthName,
      status: monthStatus(period),
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
    investments: investmentsBlock(state, period, range, money, signed),
    recent: recentBlock(state.transactions, period, money, today),
    categories: categoriesBlock(state, period, money),
    goals: goalsBlock(state, period, money, today),
  }
}

/** The first month a range draws: as many back as it has points, never before the year's first. */
function rangeStart(period: Period, range: ChartRange): Month {
  return Math.max(1, period.month - (rangePoints(period.month, range) - 1)) as Month
}

/** «sep – nov 2026»: the months the range covers, inside the accounting year. */
function rangeSpan(period: Period, range: ChartRange): string {
  const first = rangeStart(period, range)
  const from = SHORT_MONTHS[monthIndex(first)]
  const to = SHORT_MONTHS[monthIndex(period.month)]
  return from === to ? `${to} ${period.year}` : `${from} – ${to} ${period.year}`
}

function monthStatus(period: ReturnType<typeof shownPeriod>): string {
  if (period.phase === 'closed') return 'Mes cerrado'
  if (period.phase === 'coming') return 'Mes por empezar'
  // The month in progress needs no label: the title already names it.
  return ''
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
  names: string[],
  money: (value: number) => string,
  axis: (value: number) => string,
  name: string,
): DashboardChart {
  const geometry = buildLineChart(values)
  return {
    ...geometry,
    labels,
    tickLabels: geometry.ticks.map((tick) => axis(tick.value)),
    readings: values.map((value, index) => ({ name: names[index] ?? '', value: money(value) })),
    label: values.length
      ? `Evolución ${name} de ${names[0]?.toLocaleLowerCase('es')} a ${names[values.length - 1]?.toLocaleLowerCase('es')}: de ${money(values[0])} a ${money(values[values.length - 1])}`
      : `Evolución ${name}: sin datos`,
  }
}

/** «+28,0 %»: the change as a share of where it started; the amount if it started at 0. */
function shareChange(
  current: number,
  from: number,
  signed: (value: number) => string,
): { text: string; tone: FigureTone } {
  const amount = round2(current - from)
  const tone = toneOf(amount)
  if (from === 0) return { text: signed(amount), tone }
  return {
    text: formatPercent((amount / Math.abs(from)) * 100, { digits: 1, signed: true }),
    tone,
  }
}

function change(
  current: number,
  from: number,
  signed: (value: number) => string,
): { text: string; tone: FigureTone } {
  const amount = round2(current - from)
  const share =
    from !== 0
      ? ` (${formatPercent((amount / Math.abs(from)) * 100, { digits: 1, signed: true })})`
      : ''
  return { text: `${signed(amount)}${share}`, tone: toneOf(amount) }
}

/** Green up, red down, and neither when nothing moved. */
function toneOf(amount: number): FigureTone {
  return amount < 0 ? 'loss' : amount > 0 ? 'gain' : 'neutral'
}

function wealthBlock(
  state: State,
  period: Period,
  range: ChartRange,
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
  const start = Math.max(0, nets.length - rangePoints(period.month, range))

  // Today's point keeps the words the card shows at rest («este mes», «en lo que va de año»).
  const steps = nets.slice(start).map((net, index) => {
    const at = start + index
    const today = at === nets.length - 1
    const monthLabel = today
      ? 'este mes'
      : `en ${formatMonthName(months[at]).toLocaleLowerCase('es')}`
    const sinceLabel = today
      ? periodLabel(range)
      : `desde ${formatMonthName(months[start]).toLocaleLowerCase('es')}`
    return {
      month: at > 0 ? { ...change(net, nets[at - 1], signed), label: monthLabel } : null,
      period:
        index > 0 && !(today && nets.length - start <= 2)
          ? { ...shareChange(net, nets[start], signed), label: sinceLabel }
          : null,
    }
  })
  const evolution = chart(
    nets.slice(start),
    months.slice(start).map((month) => SHORT_MONTHS[monthIndex(month)]),
    months.slice(start).map((month) => formatMonthName(month)),
    money,
    (value) => formatCompactMoney(value, state.currency || 'EUR'),
    'del patrimonio',
  )
  // What a screen reader hears at each point: its amount, then the same two changes.
  const readings = evolution.readings.map((reading, index) => {
    const step = steps[index]
    const note = [step?.month, step?.period]
      .filter((change) => change !== null && change !== undefined)
      .map((change) => `${change.text} ${change.label}`)
      .join(', ')
    return note ? { ...reading, note } : reading
  })

  return {
    value: money(current),
    monthChange: nets.length > 1 ? change(current, nets[nets.length - 2], signed) : null,
    periodChange:
      nets.length - start > 2
        ? { ...shareChange(current, nets[start], signed), label: periodLabel(range) }
        : null,
    steps,
    chart: { ...evolution, readings },
  }
}

function investmentsBlock(
  state: State,
  period: Period,
  range: ChartRange,
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
  const all = portfolio.valueSeries[0]?.values ?? []
  const start = Math.max(0, all.length - rangePoints(period.month, range))
  const values = all.slice(start)
  // The first point is the start of the year, then one per month; the axis calls
  // it «inicio» (reading it says «Inicio»).
  const indexes = portfolio.chartLabels.map((_, index) => index).slice(start)
  const labels = indexes.map((index) => (index === 0 ? 'inicio' : SHORT_MONTHS[(index - 1) % 12]))

  return {
    value: money(portfolio.portfolioValue),
    gain:
      portfolio.investedCapital > 0
        ? change(portfolio.portfolioValue, portfolio.investedCapital, signed)
        : null,
    invested: portfolio.investedCapital > 0 ? money(portfolio.investedCapital) : null,
    positions: shown.map((position) => ({
      ...position,
      share: formatPercent(position.weight, { digits: 1 }),
    })),
    chart: chart(
      values,
      labels,
      indexes.map((index) =>
        index === 0 ? 'Inicio' : formatMonthName(ALL_MONTHS[(index - 1) % 12]),
      ),
      money,
      (value) => formatCompactMoney(value, state.currency || 'EUR'),
      'de la cartera',
    ),
    empty: portfolio.portfolioValue <= 0 && !ranked.length,
  }
}

const WEEKDAY = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' })

/** «hoy», «sáb», or «oct» for a movement dated in another month than the one it counts in. */
function recentDayLabel(date: string, period: Period, today: string): string {
  if (date === today) return 'hoy'
  const month = Number(date.slice(5, 7))
  if (month !== period.month || Number(date.slice(0, 4)) !== period.year) {
    return SHORT_MONTHS[month - 1] ?? ''
  }
  return WEEKDAY.format(new Date(`${date}T00:00:00Z`))
}

function recentBlock(
  transactions: Transaction[],
  period: Period,
  money: (value: number) => string,
  today: string,
): NeonDashboardViewModel['recent'] {
  const items = transactions
    .filter((tx) => inPeriod(tx, period))
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)),
    )
    .slice(0, RECENT_LIMIT)
    .map((tx, index, list) => {
      const amount = Math.abs(Number(tx.amount || 0))
      // A saving moves money between accounts: no sign.
      const sign = tx.type === 'income' ? '+' : tx.type === 'saving' ? '' : '−'
      const date = String(tx.date)
      return {
        id: tx.id,
        type: tx.type,
        description: tx.description || '—',
        category: tx.category || 'Sin categoría',
        date: formatDayMonth(date),
        day: String(Number(date.slice(8, 10))),
        dayLabel: recentDayLabel(date, period, today),
        newDay: index === 0 || String(list[index - 1]!.date) !== date,
        amount: `${sign}${money(amount)}`,
      }
    })

  return { items, empty: 'Aún no hay movimientos este mes.' }
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
        // The goals are all net worth goals: today's net worth is already in the
        // Patrimonio block, so the row only carries what is left to say.
        detail: row.met
          ? 'Objetivo alcanzado'
          : `de ${money(row.target)} · para ${row.goal.targetYear}`,
      }
    })
}
