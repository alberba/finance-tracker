import {
  MONTHS,
  isGoalField,
  isGoalKey,
  type BudgetType,
  type Goal,
  type GoalKey,
  type MonthTotals,
  type SectionId,
  type State,
} from '../types'
import {
  renderGroupedBarChart,
  renderLineChart,
  renderSparkline,
} from '../charts'
import { decorateCategoryLabel, getCategoryEmoji } from '../category-emoji'
import {
  escapeAttr,
  escapeHtml,
  formatPercent,
  monthFromISO,
  parseFloatSafe,
  parseIntSafe,
  round2,
  todayISO,
} from '../utils'
import {
  buildDashboardInvestmentProgressItems,
  renderDashboardInvestmentProgressList,
} from './dashboard-investment-progress-list'
import {
  getPathFromSection,
  getSectionFromPath,
  normalizeSectionId,
} from './dashboard-section-routing'
import { publishTopExpenses } from './dashboard-top-expenses-bridge'
import { publishDashboardWealthSplit } from './dashboard-wealth-split-bridge'

interface DashboardBudgetGoalsUi {
  activeSection: SectionId
  month: number
  budgetType: BudgetType
  budgetMonth: number
  txFilterMonth: number
  snapshotMonth: number
  investmentMonth: number
  investmentOnlyUndeclared: boolean
  contributionWorkflowMonth: number
  contributionWorkflowDate: string
}

interface DashboardBudgetGoalsElements {
  navTabs: HTMLElement
  panels: HTMLElement[]
  yearDisplay: HTMLInputElement
  dashboardMonth: HTMLSelectElement
  txMonthFilter: HTMLSelectElement
  txForm: HTMLFormElement & {
    elements: HTMLFormControlsCollection & { date: HTMLInputElement; month: HTMLSelectElement }
  }
  budgetBody: HTMLElement
  budgetPlanned: HTMLElement
  budgetActual: HTMLElement
  budgetDiff: HTMLElement
  snapshotMonth: HTMLSelectElement
  investmentMonth: HTMLSelectElement
  investmentMovementDate: HTMLInputElement
  investmentMovementTime: HTMLInputElement
  investmentMovementCurrency: HTMLInputElement
  investmentOnlyUndeclared: HTMLInputElement
  contributionWorkflowMonth: HTMLSelectElement
  contributionWorkflowDate: HTMLInputElement
  goalsProgress: HTMLElement
  kpiIncome: HTMLElement
  kpiExpense: HTMLElement
  kpiInvestment: HTMLElement
  kpiNetWorth: HTMLElement
  kpiNetWorthChange: HTMLElement
  kpiAnnualSavings: HTMLElement
  kpiIncomeDelta: HTMLElement
  kpiExpenseDelta: HTMLElement
  kpiInvestmentDelta: HTMLElement
  sparkIncome: HTMLCanvasElement
  sparkExpense: HTMLCanvasElement
  sparkInvestment: HTMLCanvasElement
  chartNetWorth: HTMLCanvasElement
  chartCashflow: HTMLCanvasElement
  networthEndpoint: HTMLElement
  investmentProgressList: HTMLElement
  recentTxBody: HTMLElement
  savingsGoal: HTMLElement
  settingsYear: HTMLInputElement
}

interface DashboardBudgetGoalsDeps {
  getState: () => State
  ui: DashboardBudgetGoalsUi
  el: DashboardBudgetGoalsElements
  saveState: () => void
  renderAll: () => void
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
  ensureBudgetCategory: (type: BudgetType, category: string) => void
  getCategoriesForType: (type: BudgetType) => string[]
  getWealthByMonth: (month: number) => {
    liquidity: number
    investment: number
    liabilities: number
    net: number
  }
  computeInvestmentValue: (assetId: string, month: number) => number
  formatMoney: (value: number) => string
  formatMoneyCompact: (value: number) => string
}

const MONTHS_PER_YEAR = 12

export function setupDashboardBudgetGoalsSection(deps: DashboardBudgetGoalsDeps) {
  const { ui, el } = deps
  const budgetTypes: BudgetType[] = ['income', 'expense', 'investment']
  const budgetTypeMeta: Record<BudgetType, { title: string; description: string }> = {
    income: { title: 'Ingresos', description: 'Planifica cuánto esperas ingresar cada mes.' },
    expense: {
      title: 'Gastos',
      description: 'Controla el gasto previsto y el real acumulado por categoría.',
    },
    investment: {
      title: 'Inversión',
      description: 'Ajusta las aportaciones mensuales y compara la ejecución real.',
    },
  }

  function bindNavigationEvents() {
    el.navTabs.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLButtonElement>('button[data-section]')
      const section = button?.dataset.section
      if (!section) {
        return
      }
      switchSection(section)
    })

    window.addEventListener('popstate', () => {
      const sectionId = getSectionFromPath(window.location.pathname)
      switchSection(sectionId, { updateHistory: false })
    })

    el.yearDisplay.addEventListener('change', () => {
      const state = deps.getState()
      state.year = parseIntSafe(el.yearDisplay.value, state.year)
      el.settingsYear.value = String(state.year)
      deps.saveState()
      deps.renderAll()
    })

    el.dashboardMonth.addEventListener('change', () => {
      ui.month = parseIntSafe(el.dashboardMonth.value, ui.month)
      renderDashboard()
    })

    const dashboardSection = document.getElementById('dashboard')
    dashboardSection?.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) {
        return
      }

      const goto = target.closest<HTMLElement>('[data-goto]')?.dataset.goto
      if (goto) {
        switchSection(goto)
        return
      }

      const rangeBtn = target.closest<HTMLButtonElement>('.dash-range-btn[data-range]')
      if (rangeBtn?.dataset.range) {
        heroRange = rangeBtn.dataset.range as HeroRange
        dashboardSection
          .querySelectorAll<HTMLButtonElement>('.dash-range-btn')
          .forEach((btn) => btn.classList.toggle('is-active', btn === rangeBtn))
        renderNetWorthChart()
      }
    })
  }

  function bindBudgetEvents() {
    el.budgetBody.addEventListener('input', (event) => {
      const target = event.target
      const rawType = target instanceof HTMLInputElement ? target.dataset.type : ''
      const rawMonth = target instanceof HTMLInputElement ? target.dataset.month : ''
      if (!(target instanceof HTMLInputElement) || !target.dataset.category || !rawType) {
        return
      }
      const type = rawType === 'expense' || rawType === 'investment' ? rawType : 'income'
      const month = parseIntSafe(rawMonth, 0)
      const state = deps.getState()
      const category = target.dataset.category
      deps.ensureBudgetCategory(type, category)
      state.budget[type][category][month] = round2(parseFloatSafe(target.value, 0))
      deps.saveState()
      renderBudget()
    })
  }

  function bindGoalEvents() {
    document.querySelectorAll<HTMLInputElement>('[data-goal][data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = String(input.dataset.goal || '')
        const field = String(input.dataset.field || '')
        if (!isGoalKey(key) || !isGoalField(field)) {
          return
        }
        const state = deps.getState()
        let value: string | number = input.value
        if (field === 'targetYear') {
          value = parseIntSafe(value, state.year)
        }
        if (field === 'targetAmount') {
          value = round2(parseFloatSafe(value, 0))
        }
        state.goals[key][field] = value as never
        deps.saveState()
        renderGoals()
      })
    })
  }

  function switchSection(sectionId: SectionId | string, options: { updateHistory?: boolean } = {}) {
    const { updateHistory = true } = options
    const normalizedSectionId = normalizeSectionId(sectionId)
    ui.activeSection = normalizedSectionId
    el.panels.forEach((panel) => {
      const isActive = panel.id === normalizedSectionId
      panel.classList.toggle('is-active', isActive)
      panel.setAttribute('aria-hidden', String(!isActive))
    })

    Array.from(el.navTabs.querySelectorAll('.nav-btn')).forEach((button) => {
      const isActive = (button as HTMLElement).dataset.section === normalizedSectionId
      button.classList.toggle('is-active', isActive)
      if (isActive) {
        button.setAttribute('aria-current', 'page')
      } else {
        button.removeAttribute('aria-current')
      }
    })

    if (updateHistory) {
      const nextPath = getPathFromSection(normalizedSectionId)
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath)
      }
    }
  }

  function populateMonthSelects() {
    const state = deps.getState()
    const monthSelects = [
      el.dashboardMonth,
      el.txMonthFilter,
      el.txForm.elements.month,
      el.snapshotMonth,
      el.investmentMonth,
      el.contributionWorkflowMonth,
    ]

    monthSelects.forEach((select) => {
      const current = String(select.value || '')
      select.innerHTML = MONTHS.map(
        (name, index) => `<option value="${index}">${name}</option>`,
      ).join('')
      if (current && Number.isFinite(Number(current))) {
        select.value = current
      }
    })

    el.yearDisplay.value = String(state.year)
    if (!MONTHS[ui.month]) ui.month = 0
    if (!MONTHS[ui.txFilterMonth]) ui.txFilterMonth = ui.month
    if (!MONTHS[ui.snapshotMonth]) ui.snapshotMonth = ui.month
    if (!MONTHS[ui.investmentMonth]) ui.investmentMonth = ui.month
    if (!MONTHS[ui.contributionWorkflowMonth]) ui.contributionWorkflowMonth = ui.investmentMonth

    el.dashboardMonth.value = String(ui.month)
    el.txMonthFilter.value = String(ui.txFilterMonth)
    el.txForm.elements.month.value = String(ui.txFilterMonth)
    if (!el.txForm.elements.date.value) el.txForm.elements.date.value = todayISO()
    if (!el.investmentMovementDate.value) el.investmentMovementDate.value = todayISO()
    if (!el.investmentMovementTime.value) {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      el.investmentMovementTime.value = `${hh}:${mm}`
    }
    if (!el.investmentMovementCurrency.value) {
      el.investmentMovementCurrency.value = String(state.currency || 'EUR').toUpperCase()
    }
    if (!ui.contributionWorkflowDate) {
      ui.contributionWorkflowDate = todayISO()
      const contributionMonthFromToday = monthFromISO(ui.contributionWorkflowDate)
      if (contributionMonthFromToday !== null) {
        ui.contributionWorkflowMonth = contributionMonthFromToday
      }
    }
    el.contributionWorkflowDate.value = ui.contributionWorkflowDate
    el.investmentOnlyUndeclared.checked = ui.investmentOnlyUndeclared
    el.snapshotMonth.value = String(ui.snapshotMonth)
    el.investmentMonth.value = String(ui.investmentMonth)
    el.contributionWorkflowMonth.value = String(ui.contributionWorkflowMonth)
  }

  type HeroRange = '7d' | '1m' | '6m' | '1a'
  let heroRange: HeroRange = '1a'

  const cssColor = (name: string, fallback: string): string =>
    (typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      : '') || fallback

  const MONTH_ABBR = MONTHS.map((name) => name.slice(0, 3))
  const TYPE_LABEL: Record<BudgetType, string> = {
    income: 'Ingreso',
    expense: 'Gasto',
    investment: 'Inversión',
  }
  const DASH_EMPTY_CLASS = 'dash-empty py-2 text-sm text-[var(--text-faint)]'
  const DELTA_TONE_CLASSES = [
    'is-flat',
    'text-[var(--text-faint)]',
    'text-good',
    'text-[var(--income)]',
    'text-bad',
    'text-[var(--expense)]',
  ]
  const NET_WORTH_CHANGE_BASE_CLASS =
    "kpi-networth-change rounded-full px-[9px] py-[3px] [font-family:'DM_Mono',monospace] text-[0.875rem] font-medium tabular-nums"
  const NET_WORTH_CHANGE_STATE_CLASS = {
    neutral: 'bg-[var(--bg-subtle)] text-[var(--text-faint)]',
    good: 'bg-[var(--income-bg)] text-[var(--income)]',
    bad: 'bg-[var(--expense-bg)] text-[var(--expense)]',
  } as const
  const RECENT_TX_EMPTY_CLASS = 'recent-tx-empty py-4 text-center text-[var(--text-faint)]'
  const RECENT_DATE_CLASS =
    "rt-date whitespace-nowrap [font-family:'DM_Mono',monospace] text-[0.8rem] text-[var(--text-muted)]"
  const RECENT_DESC_CLASS = 'rt-desc font-semibold text-[var(--text-main)]'
  const RECENT_PILL_CLASS =
    'rt-pill inline-block max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-2.5 py-[3px] text-[0.72rem] font-semibold'
  const RECENT_TYPE_CLASS = 'rt-type text-[0.78rem] font-semibold'
  const RECENT_AMOUNT_CLASS =
    "rt-amount whitespace-nowrap [font-family:'DM_Mono',monospace] font-medium tabular-nums"
  const SAVINGS_RING_CLASS =
    'savings-ring relative aspect-square w-[clamp(118px,13vw,144px)] flex-none rounded-full bg-[conic-gradient(var(--income)_calc(var(--p)*1%),var(--track-bg)_0)]'
  const SAVINGS_RING_INNER_CLASS = 'absolute inset-[13px] rounded-full bg-[var(--bg-panel)]'
  const SAVINGS_RING_PCT_CLASS =
    'savings-ring-pct absolute inset-0 grid place-items-center text-2xl font-bold text-[var(--text-main)]'
  const SAVINGS_GOAL_INFO_CLASS = 'savings-goal-info grid min-w-0 flex-1 gap-[5px]'
  const SAVINGS_GOAL_NAME_CLASS =
    'savings-goal-name text-[0.78rem] font-semibold text-[var(--text-faint)]'
  const SAVINGS_GOAL_LINE_CLASS =
    'savings-goal-line text-[0.85rem] text-[var(--text-muted)] [&_strong]:font-bold [&_strong]:text-[var(--text-main)]'
  const SAVINGS_GOAL_CURRENT_CLASS =
    'savings-goal-current text-[clamp(1.4rem,2.4vw,1.9rem)] leading-[1.15] font-bold text-[var(--income)]'
  const SAVINGS_GOAL_SUB_CLASS = 'savings-goal-sub text-[0.82rem] text-[var(--text-muted)]'
  const SAVINGS_GOAL_REMAINING_CLASS =
    'savings-goal-remaining text-[0.82rem] text-[var(--text-faint)]'

  function formatDeltaPct(pct: number): string {
    return `${Math.abs(pct).toFixed(1).replace('.', ',')}%`
  }

  function renderStatDelta(
    target: HTMLElement,
    cur: number,
    prev: number | null,
    prevAbbr: string,
    goodWhenUp: boolean,
  ) {
    const delta = target.querySelector<HTMLElement>('[data-delta-tag]')
    const post = target.querySelector<HTMLElement>('[data-delta-post]')

    if (!delta || !post) {
      return
    }

    if (prev === null || prev === 0) {
      delta.hidden = true
      post.hidden = true
      return
    }

    const pct = ((cur - prev) / Math.abs(prev)) * 100
    const up = pct > 0.05
    const down = pct < -0.05
    const arrow = up ? '▲' : down ? '▼' : '—'
    const isGood = up ? goodWhenUp : down ? !goodWhenUp : null
    const toneClass =
      isGood === null
        ? 'is-flat text-[var(--text-faint)]'
        : isGood
          ? 'text-good text-[var(--income)]'
          : 'text-bad text-[var(--expense)]'

    delta.hidden = false
    delta.classList.remove(...DELTA_TONE_CLASSES)
    delta.classList.add(...toneClass.split(' '))
    delta.textContent = `${arrow} ${formatDeltaPct(pct)}`
    post.hidden = false
    post.textContent = `vs. ${prevAbbr}`
  }

  function formatTxDate(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
    if (!match) {
      return escapeHtml(String(iso || ''))
    }
    const monthIdx = Math.min(Math.max(parseIntSafe(match[2], 1) - 1, 0), 11)
    return `${match[3]} ${MONTH_ABBR[monthIdx]} ${match[1]}`
  }

  function getInvestmentBuckets(month: number) {
    const state = deps.getState()
    const fundsValue = state.investmentAssets
      .filter((asset) => /fond|index/i.test(asset.name))
      .reduce((sum, asset) => sum + deps.computeInvestmentValue(asset.id, month), 0)
    const cryptoValue = state.investmentAssets
      .filter((asset) => /crypto|btc|eth/i.test(asset.name))
      .reduce((sum, asset) => sum + deps.computeInvestmentValue(asset.id, month), 0)
    return { fundsValue, cryptoValue }
  }

  function goalCurrentMap(month: number): Record<GoalKey, number> {
    const wealth = deps.getWealthByMonth(month)
    const { fundsValue, cryptoValue } = getInvestmentBuckets(month)
    return {
      short: wealth.net,
      medium: wealth.net,
      long: wealth.net,
      investmentTotal: wealth.investment,
      investmentFunds: fundsValue,
      investmentCrypto: cryptoValue,
    }
  }

  function getNearestSavingsGoal(): { key: GoalKey; goal: Goal } | null {
    const goals = deps.getState().goals
    const candidates = (['short', 'medium', 'long'] as GoalKey[])
      .map((key) => ({ key, goal: goals[key] }))
      .filter((candidate) => candidate.goal && (candidate.goal.targetAmount || 0) > 0)
    if (!candidates.length) {
      return null
    }
    candidates.sort((a, b) => (a.goal.targetYear || 0) - (b.goal.targetYear || 0))
    return candidates[0]
  }

  function renderNetWorthChart() {
    const wealthSeries = deps.getWealthSeries()
    const latestDataMonth = deps.getLatestDataMonth()
    const fullMonths = MONTHS.slice(0, latestDataMonth + 1)
    const fullNets = wealthSeries.slice(0, latestDataMonth + 1).map((item) => item.net)
    const rangeCount: Record<HeroRange, number> = { '7d': 2, '1m': 2, '6m': 6, '1a': 12 }
    const start = Math.max(0, fullNets.length - Math.max(2, rangeCount[heroRange]))
    const accent = cssColor('--primary', '#3B6BF0')
    renderLineChart(el.chartNetWorth, fullNets.slice(start), {
      color: accent,
      fill: accent + '22',
      labels: fullMonths.slice(start),
      formatValue: deps.formatMoney,
      formatAxisValue: deps.formatMoneyCompact,
      includeZeroBaseline: false,
      yPaddingRatio: 0.12,
    })
    el.networthEndpoint.textContent = deps.formatMoney(
      fullNets.length ? fullNets[fullNets.length - 1] : 0,
    )
  }

  function renderWealthSplit(month: number) {
    const wealth = deps.getWealthByMonth(month)
    const { fundsValue, cryptoValue } = getInvestmentBuckets(month)
    const otherInvest = Math.max(round2(wealth.investment - fundsValue - cryptoValue), 0)
    const items = [
      {
        label: 'Efectivo',
        color: cssColor('--primary', '#3B6BF0'),
        value: Math.max(round2(wealth.liquidity), 0),
      },
      {
        label: 'Fondos',
        color: cssColor('--invest', '#6A52E8'),
        value: Math.max(round2(fundsValue), 0),
      },
      {
        label: 'Cripto',
        color: cssColor('--accent', '#F59E0B'),
        value: Math.max(round2(cryptoValue), 0),
      },
      { label: 'Otras inversiones', color: cssColor('--income', '#0E9F6E'), value: otherInvest },
    ].filter((item) => item.value > 0)

    const total = items.reduce((sum, item) => sum + item.value, 0)
    publishDashboardWealthSplit(
      items.map((item) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0
        return {
          ...item,
          amount: deps.formatMoney(item.value),
          pct: `${pct.toFixed(0)}%`,
        }
      }),
    )
  }

  function renderRecentTransactions() {
    const recent = [...deps.getState().transactions]
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)),
      )
      .slice(0, 5)

    if (!recent.length) {
      el.recentTxBody.innerHTML = `<tr><td colspan="5" class="${RECENT_TX_EMPTY_CLASS}">Sin movimientos registrados.</td></tr>`
      return
    }

    el.recentTxBody.innerHTML = recent
      .map((tx) => {
        const sign = tx.type === 'income' ? '+' : '−'
        const amountCls =
          tx.type === 'income'
            ? 'text-good text-[var(--income)]'
            : tx.type === 'expense'
              ? 'text-bad text-[var(--expense)]'
              : 'rt-amount--invest text-[var(--invest)]'
        const badgeCls =
          tx.type === 'income'
            ? 'badge-income bg-[var(--income-bg)] text-[var(--income)]'
            : tx.type === 'expense'
              ? 'badge-expense bg-[var(--expense-bg)] text-[var(--expense)]'
              : 'badge-investment bg-[var(--invest-bg)] text-[var(--invest)]'
        const typeCls =
          tx.type === 'income'
            ? 'rt-type--income text-[var(--income)]'
            : tx.type === 'expense'
              ? 'rt-type--expense text-[var(--expense)]'
              : 'rt-type--investment text-[var(--invest)]'
        return `<tr>
          <td class="${RECENT_DATE_CLASS}">${formatTxDate(tx.date)}</td>
          <td class="${RECENT_DESC_CLASS}">${escapeHtml(tx.description || '—')}</td>
          <td><span class="${RECENT_PILL_CLASS} ${badgeCls}">${escapeHtml(tx.category || 'Sin categoría')}</span></td>
          <td><span class="${RECENT_TYPE_CLASS} ${typeCls}">${escapeHtml(TYPE_LABEL[tx.type] || tx.type)}</span></td>
          <td class="num text-right! pr-0! ${RECENT_AMOUNT_CLASS} ${amountCls}">${sign}${deps.formatMoney(Math.abs(tx.amount))}</td>
        </tr>`
      })
      .join('')
  }

  function renderSavingsGoalRing(month: number) {
    const nearest = getNearestSavingsGoal()
    if (!nearest) {
      el.savingsGoal.innerHTML = `<p class="${DASH_EMPTY_CLASS}">Define un objetivo de ahorro en la sección Objetivos.</p>`
      return
    }
    const current = round2(goalCurrentMap(month)[nearest.key] || 0)
    const target = Math.max(round2(nearest.goal.targetAmount || 0), 0)
    const progress = target <= 0 ? 0 : Math.min(Math.max((current / target) * 100, 0), 100)
    const remaining = round2(Math.max(target - current, 0))
    el.savingsGoal.innerHTML = `
      <div class="${SAVINGS_RING_CLASS}" style="--p:${progress.toFixed(1)}">
        <span class="${SAVINGS_RING_INNER_CLASS}" aria-hidden="true"></span>
        <span class="${SAVINGS_RING_PCT_CLASS}">${progress.toFixed(0)}%</span>
      </div>
      <div class="${SAVINGS_GOAL_INFO_CLASS}">
        <p class="${SAVINGS_GOAL_NAME_CLASS}">${escapeHtml(nearest.goal.name || 'Objetivo')} · ${nearest.goal.targetYear}</p>
        <p class="${SAVINGS_GOAL_LINE_CLASS}">Objetivo: <strong>${deps.formatMoney(target)}</strong></p>
        <strong class="${SAVINGS_GOAL_CURRENT_CLASS}">${deps.formatMoney(current)}</strong>
        <p class="${SAVINGS_GOAL_SUB_CLASS}">Ahorrado de ${deps.formatMoney(target)}</p>
        <p class="${SAVINGS_GOAL_REMAINING_CLASS}">${
          remaining > 0
            ? `Te quedan ${deps.formatMoney(remaining)} para alcanzar tu objetivo.`
            : '¡Objetivo alcanzado! 🎉'
        }</p>
      </div>`
  }

  function renderDashboard() {
    const month = ui.month
    const monthTotals = deps.getMonthTotals(month)
    const yearTotals = deps.getYearTotals()
    const wealthSeries = deps.getWealthSeries()
    const latestDataMonth = deps.getLatestDataMonth()
    const chartMonths = MONTHS.slice(0, latestDataMonth + 1)
    const currentWealth = wealthSeries[month] || {
      liquidity: 0,
      investment: 0,
      liabilities: 0,
      net: 0,
    }
    const previousYearIndex = month - MONTHS_PER_YEAR
    const previousYearNet = previousYearIndex >= 0 ? (wealthSeries[previousYearIndex]?.net ?? 0) : 0
    const hasPreviousYearData = previousYearNet !== 0
    const netWorthChange = hasPreviousYearData
      ? ((currentWealth.net - previousYearNet) / Math.abs(previousYearNet)) * 100
      : null

    el.kpiIncome.textContent = deps.formatMoney(monthTotals.income)
    el.kpiExpense.textContent = deps.formatMoney(monthTotals.expense)
    el.kpiInvestment.textContent = deps.formatMoney(monthTotals.investment)
    el.kpiNetWorth.textContent = deps.formatMoney(currentWealth.net)
    el.kpiNetWorthChange.textContent =
      netWorthChange === null ? '--' : formatPercent(netWorthChange)
    el.kpiNetWorthChange.className = `${NET_WORTH_CHANGE_BASE_CLASS} ${
      netWorthChange === null
        ? NET_WORTH_CHANGE_STATE_CLASS.neutral
        : netWorthChange >= 0
          ? `text-good ${NET_WORTH_CHANGE_STATE_CLASS.good}`
          : `text-bad ${NET_WORTH_CHANGE_STATE_CLASS.bad}`
    }`
    el.kpiAnnualSavings.textContent = deps.formatMoney(
      yearTotals.income - yearTotals.expense - yearTotals.investment,
    )

    const prevMonth = month - 1
    const prevTotals = prevMonth >= 0 ? deps.getMonthTotals(prevMonth) : null
    const prevAbbr = prevMonth >= 0 ? `${(MONTHS[prevMonth] || '').slice(0, 3).toLowerCase()}.` : ''
    renderStatDelta(
      el.kpiIncomeDelta,
      monthTotals.income,
      prevTotals ? prevTotals.income : null,
      prevAbbr,
      true,
    )
    renderStatDelta(
      el.kpiExpenseDelta,
      monthTotals.expense,
      prevTotals ? prevTotals.expense : null,
      prevAbbr,
      false,
    )
    renderStatDelta(
      el.kpiInvestmentDelta,
      monthTotals.investment,
      prevTotals ? prevTotals.investment : null,
      prevAbbr,
      true,
    )

    renderNetWorthChart()

    const cashflowSeries = deps.getMonthlyCashflowSeries()
    renderSparkline(
      el.sparkIncome,
      cashflowSeries.income.slice(0, latestDataMonth + 1),
      cssColor('--income', '#0E9F6E'),
    )
    renderSparkline(
      el.sparkExpense,
      cashflowSeries.expense.slice(0, latestDataMonth + 1),
      cssColor('--expense', '#E0463F'),
    )
    renderSparkline(
      el.sparkInvestment,
      cashflowSeries.investment.slice(0, latestDataMonth + 1),
      cssColor('--invest', '#6A52E8'),
    )
    const dashboardCashflowSeries = {
      income: cashflowSeries.income.slice(0, latestDataMonth + 1),
      expense: cashflowSeries.expense.slice(0, latestDataMonth + 1),
      investment: cashflowSeries.investment.slice(0, latestDataMonth + 1),
    }
    renderGroupedBarChart(
      el.chartCashflow,
      chartMonths,
      [
        { name: 'Ingresos', color: '#059669', values: dashboardCashflowSeries.income },
        { name: 'Gastos', color: '#ef4444', values: dashboardCashflowSeries.expense },
        { name: 'Inversión', color: '#2563eb', values: dashboardCashflowSeries.investment },
      ],
      deps.formatMoney,
    )

    const expenseActuals = deps.getCategoryActuals('expense', month)
    const expenseTotal = Object.values(expenseActuals).reduce((sum, value) => sum + value, 0)
    const topExpenses = Object.entries(expenseActuals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    publishTopExpenses(
      topExpenses.map(([category, amount]) => {
        const pct = expenseTotal > 0 ? (amount / expenseTotal) * 100 : 0
        return {
          category,
          emoji: getCategoryEmoji('expense', category),
          amount: deps.formatMoney(amount),
          pct: `${pct.toFixed(1).replace('.', ',')}%`,
          pctValue: pct,
        }
      }),
    )

    renderDashboardInvestmentProgressList(
      el.investmentProgressList,
      buildDashboardInvestmentProgressItems({
        actuals: deps.getCategoryActuals('investment', month),
        month,
        getBudgetValue: (category, budgetMonth) =>
          deps.getBudgetValue('investment', category, budgetMonth),
        formatMoney: deps.formatMoney,
      }),
    )

    renderWealthSplit(month)
    renderRecentTransactions()
    renderSavingsGoalRing(month)
  }

  function renderBudget() {
    let annualPlanned = 0
    let annualActual = 0

    el.budgetBody.innerHTML = budgetTypes
      .map((type) => {
        const categories = deps.getCategoriesForType(type)
        if (!categories.length) {
          return `
            <article class="budget-block" data-budget-type="${escapeAttr(type)}">
              <header class="budget-block-head">
                <div>
                  <h3>${budgetTypeMeta[type].title}</h3>
                  <p>${budgetTypeMeta[type].description}</p>
                </div>
              </header>
              <p class="budget-empty">No hay categorías para este bloque.</p>
            </article>
          `
        }

        let blockPlanned = 0
        let blockActual = 0

        const rows = categories
          .map((category) => {
            const monthlyCells = MONTHS.map((monthName, monthIndex) => {
              const planned = deps.getBudgetValue(type, category, monthIndex)
              const actual = round2(deps.getCategoryActuals(type, monthIndex)[category] || 0)
              const diff = round2(actual - planned)
              const diffClass =
                type === 'income'
                  ? diff >= 0
                    ? 'text-good'
                    : 'text-bad'
                  : diff > 0
                    ? 'text-bad'
                    : 'text-good'
              blockPlanned += planned
              blockActual += actual
              return `
                <td class="budget-month-cell" data-month="${monthIndex}">
                  <label class="budget-cell-input">
                    <span class="sr-only">${monthName} para ${escapeHtml(category)}</span>
                    <input
                      type="number"
                      name="budget-${escapeAttr(type)}-${escapeAttr(category)}-${monthIndex}"
                      autocomplete="off"
                      step="0.01"
                      min="0"
                      data-category="${escapeAttr(category)}"
                      data-type="${escapeAttr(type)}"
                      data-month="${monthIndex}"
                      value="${planned}"
                      aria-label="Presupuesto ${monthName} para ${escapeAttr(category)}"
                    />
                  </label>
                  <div class="budget-cell-meta">
                    <span class="budget-cell-actual">${deps.formatMoney(actual)}</span>
                    <span class="${diffClass}">${deps.formatMoney(diff)}</span>
                  </div>
                </td>
              `
            }).join('')

            const categoryPlanned = round2(
              MONTHS.reduce(
                (sum, _item, monthIndex) => sum + deps.getBudgetValue(type, category, monthIndex),
                0,
              ),
            )
            const categoryActual = round2(
              MONTHS.reduce(
                (sum, _item, monthIndex) =>
                  sum + round2(deps.getCategoryActuals(type, monthIndex)[category] || 0),
                0,
              ),
            )
            const categoryDiff = round2(categoryActual - categoryPlanned)
            const categoryDiffClass =
              type === 'income'
                ? categoryDiff >= 0
                  ? 'text-good'
                  : 'text-bad'
                : categoryDiff > 0
                  ? 'text-bad'
                  : 'text-good'

            return `
              <tr>
                <th scope="row">${escapeHtml(decorateCategoryLabel(type, category))}</th>
                ${monthlyCells}
                <td class="budget-total-cell">
                  <strong>${deps.formatMoney(categoryPlanned)}</strong>
                  <div class="budget-cell-meta">
                    <span class="budget-cell-actual">${deps.formatMoney(categoryActual)}</span>
                    <span class="${categoryDiffClass}">${deps.formatMoney(categoryDiff)}</span>
                  </div>
                </td>
              </tr>
            `
          })
          .join('')

        annualPlanned += blockPlanned
        annualActual += blockActual

        const blockDiff = round2(blockActual - blockPlanned)
        const blockDiffClass =
          type === 'income'
            ? blockDiff >= 0
              ? 'text-good'
              : 'text-bad'
            : blockDiff > 0
              ? 'text-bad'
              : 'text-good'

        return `
          <article class="budget-block" data-budget-type="${escapeAttr(type)}">
            <header class="budget-block-head">
              <div>
                <h3>${budgetTypeMeta[type].title}</h3>
                <p>${budgetTypeMeta[type].description}</p>
              </div>
              <dl class="budget-block-totals">
                <div>
                  <dt>Presupuestado</dt>
                  <dd>${deps.formatMoney(blockPlanned)}</dd>
                </div>
                <div>
                  <dt>Real</dt>
                  <dd>${deps.formatMoney(blockActual)}</dd>
                </div>
                <div>
                  <dt>Diferencia</dt>
                  <dd class="${blockDiffClass}">${deps.formatMoney(blockDiff)}</dd>
                </div>
              </dl>
            </header>
            <div class="table-wrap budget-table-wrap">
              <table class="budget-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    ${MONTHS.map((monthName) => `<th>${monthName.slice(0, 3)}</th>`).join('')}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
          </article>
        `
      })
      .join('')

    const annualDiff = round2(annualActual - annualPlanned)
    const annualDiffClass = annualDiff > 0 ? 'text-bad' : 'text-good'
    el.budgetPlanned.textContent = deps.formatMoney(annualPlanned)
    el.budgetActual.textContent = deps.formatMoney(annualActual)
    el.budgetDiff.textContent = deps.formatMoney(annualDiff)
    el.budgetDiff.className = annualDiffClass
  }

  function renderGoals() {
    const state = deps.getState()
    const currentMap = goalCurrentMap(ui.investmentMonth)

    document.querySelectorAll('[data-goal][data-field]').forEach((input) => {
      const goalInput = input as HTMLInputElement
      const key = String(goalInput.dataset.goal || '')
      const field = String(goalInput.dataset.field || '')
      if (!isGoalKey(key) || !isGoalField(field)) {
        return
      }
      const goal = state.goals[key]
      goalInput.value = String(goal[field] ?? '')
    })

    el.goalsProgress.innerHTML = (Object.entries(state.goals) as Array<[GoalKey, Goal]>)
      .map(([key, goal]) => {
        const current = round2(currentMap[key] || 0)
        const target = Math.max(round2(goal.targetAmount || 0), 0)
        const progress = target <= 0 ? 0 : Math.min((current / target) * 100, 100)
        const remaining = round2(target - current)
        const monthsLeft = monthsUntilGoal(goal.targetYear)
        const monthlyNeeded = monthsLeft <= 0 ? remaining : round2(remaining / monthsLeft)
        return `
          <article class="goal-progress-item">
            <strong>${escapeHtml(goal.name || key)}</strong>
            <small>${goal.targetYear}</small>
            <div class="progress-track"><div class="progress-fill" style="width:${progress.toFixed(2)}%"></div></div>
            <div class="list-item"><span>Actual</span><strong>${deps.formatMoney(current)}</strong></div>
            <div class="list-item"><span>Objetivo</span><strong>${deps.formatMoney(target)}</strong></div>
            <div class="list-item"><span>Progreso</span><strong>${progress.toFixed(2)}%</strong></div>
            <div class="list-item"><span>Faltan</span><strong class="${remaining <= 0 ? 'text-good' : 'text-bad'}">${deps.formatMoney(remaining)}</strong></div>
            <div class="list-item"><span>Necesitas/mes</span><strong>${deps.formatMoney(monthlyNeeded)}</strong></div>
          </article>
        `
      })
      .join('')
  }

  function monthsUntilGoal(targetYear: number) {
    const safeYear = parseIntSafe(targetYear, deps.getState().year)
    const now = new Date()
    const end = new Date(safeYear, 11, 31)
    const diffMonths =
      (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
    return Math.max(diffMonths, 1)
  }

  return {
    bindNavigationEvents,
    bindBudgetEvents,
    bindGoalEvents,
    switchSection,
    getSectionFromPath,
    populateMonthSelects,
    renderDashboard,
    renderBudget,
    renderGoals,
  }
}
