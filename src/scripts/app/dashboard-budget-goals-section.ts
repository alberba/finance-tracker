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
  escapeHtml,
  monthFromISO,
  parseFloatSafe,
  parseIntSafe,
  round2,
  todayISO,
} from '../utils'
import { buildDashboardViewModel, type DashboardHeroRange } from '../../domain/dashboard/view-model'
import {
  getPathFromSection,
  getSectionFromPath,
  normalizeSectionId,
} from './dashboard-section-routing'
import { useDashboardStore } from '../../stores/dashboard'
import { pinia } from '../../stores/pinia'

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
  txMonthFilter: HTMLSelectElement
  txForm: HTMLFormElement & {
    elements: HTMLFormControlsCollection & { date: HTMLInputElement; month: HTMLSelectElement }
  }
  snapshotMonth: HTMLSelectElement
  investmentMonth: HTMLSelectElement
  investmentMovementDate: HTMLInputElement
  investmentMovementTime: HTMLInputElement
  investmentMovementCurrency: HTMLInputElement
  investmentOnlyUndeclared: HTMLInputElement
  contributionWorkflowMonth: HTMLSelectElement
  contributionWorkflowDate: HTMLInputElement
  goalsProgress: HTMLElement
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
  getWealthByMonth: (month: number) => {
    liquidity: number
    investment: number
    liabilities: number
    net: number
  }
  computeInvestmentValue: (assetId: string, month: number) => number
  formatMoney: (value: number) => string
}

export function setupDashboardBudgetGoalsSection(deps: DashboardBudgetGoalsDeps) {
  const { ui, el } = deps
  const dashboardStore = useDashboardStore(pinia)
  let heroRange: DashboardHeroRange = '1a'

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

    dashboardStore.registerControllerActions({
      changeYear: (year) => {
        const state = deps.getState()
        state.year = parseIntSafe(year, state.year)
        el.settingsYear.value = String(state.year)
        deps.saveState()
        deps.renderAll()
      },
      changeMonth: (month) => {
        ui.month = parseIntSafe(month, ui.month)
        publishDashboard()
      },
      changeRange: (range) => {
        heroRange = range
        publishDashboard()
      },
      navigate: (sectionId) => {
        switchSection(sectionId)
      },
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

    if (!MONTHS[ui.month]) ui.month = 0
    if (!MONTHS[ui.txFilterMonth]) ui.txFilterMonth = ui.month
    if (!MONTHS[ui.snapshotMonth]) ui.snapshotMonth = ui.month
    if (!MONTHS[ui.investmentMonth]) ui.investmentMonth = ui.month
    if (!MONTHS[ui.contributionWorkflowMonth]) ui.contributionWorkflowMonth = ui.investmentMonth

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

  function publishDashboard() {
    dashboardStore.setViewModel(
      buildDashboardViewModel({
        state: deps.getState(),
        month: ui.month,
        heroRange,
        getMonthTotals: deps.getMonthTotals,
        getYearTotals: deps.getYearTotals,
        getWealthSeries: deps.getWealthSeries,
        getLatestDataMonth: deps.getLatestDataMonth,
        getMonthlyCashflowSeries: deps.getMonthlyCashflowSeries,
        getCategoryActuals: deps.getCategoryActuals,
        getBudgetValue: deps.getBudgetValue,
        getWealthByMonth: deps.getWealthByMonth,
        computeInvestmentValue: deps.computeInvestmentValue,
        formatMoney: deps.formatMoney,
      }),
    )
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
    bindGoalEvents,
    switchSection,
    getSectionFromPath,
    populateMonthSelects,
    publishDashboard,
    renderGoals,
  }
}
