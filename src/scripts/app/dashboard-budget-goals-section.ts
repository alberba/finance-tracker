import { MONTHS, type BudgetType, type SectionId, type State } from '../types'
import { monthFromISO, parseIntSafe, todayISO } from '../utils'
import {
  getPathFromSection,
  getSectionFromPath,
  normalizeSectionId,
} from './dashboard-section-routing'
import { useDashboardStore } from '../../stores/dashboard'
import { pinia } from '../../stores/pinia'
import { useUiStore } from '../../stores/ui'

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
  settingsYear: HTMLInputElement
}

interface DashboardBudgetGoalsDeps {
  getState: () => State
  ui: DashboardBudgetGoalsUi
  el: DashboardBudgetGoalsElements
  saveState: () => void
  renderAll: () => void
}

export function setupDashboardBudgetGoalsSection(deps: DashboardBudgetGoalsDeps) {
  const { ui, el } = deps
  const dashboardStore = useDashboardStore(pinia)
  const uiStore = useUiStore(pinia)

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
      changeRange: () => {
        publishDashboard()
      },
      navigate: (sectionId) => {
        switchSection(sectionId)
      },
    })
  }

  function switchSection(sectionId: SectionId | string, options: { updateHistory?: boolean } = {}) {
    const { updateHistory = true } = options
    const normalizedSectionId = normalizeSectionId(sectionId)
    ui.activeSection = normalizedSectionId
    uiStore.setActiveSection(normalizedSectionId)
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
    if (!MONTHS[ui.month]) {
      ui.month = 0
    }
  }

  return {
    bindNavigationEvents,
    switchSection,
    getSectionFromPath,
    populateMonthSelects,
    publishDashboard,
  }
}
