import { MONTHS, type SectionId } from '../types'
import { parseIntSafe } from '../utils'
import {
  getPathFromSection,
  getSectionFromPath,
  normalizeSectionId,
} from './dashboard-section-routing'
import { useDashboardStore } from '../../stores/dashboard'
import { useFinancialStateStore } from '../../stores/financial-state'
import { pinia } from '../../stores/pinia'
import { useUiStore } from '../../stores/ui'

const MOBILE_PRIMARY_SECTIONS: SectionId[] = ['dashboard', 'transactions', 'budget', 'investment']

interface DashboardNavigationUi {
  activeSection: SectionId
  month: number
}

interface DashboardNavigationElements {
  navTabs: HTMLElement
}

interface DashboardNavigationDeps {
  ui: DashboardNavigationUi
  el: DashboardNavigationElements
}

export function setupDashboardBudgetGoalsSection(deps: DashboardNavigationDeps) {
  const { ui, el } = deps
  const dashboardStore = useDashboardStore(pinia)
  const uiStore = useUiStore(pinia)
  const financialStateStore = useFinancialStateStore(pinia)

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
        financialStateStore.commitState((draft) => {
          draft.year = parseIntSafe(year, draft.year)
        })
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

    Array.from(el.navTabs.querySelectorAll<HTMLElement>('[data-nav-item]')).forEach((button) => {
      const isActive = button.dataset.section === normalizedSectionId
      if (isActive) {
        button.setAttribute('aria-current', 'page')
      } else {
        button.removeAttribute('aria-current')
      }
    })

    const mobileMoreTrigger = el.navTabs.querySelector<HTMLElement>('[data-mobile-more-trigger]')
    if (mobileMoreTrigger) {
      mobileMoreTrigger.dataset.active = String(
        !MOBILE_PRIMARY_SECTIONS.includes(normalizedSectionId),
      )
    }

    if (updateHistory) {
      const nextPath = getPathFromSection(normalizedSectionId)
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath)
      }
    }
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
    publishDashboard,
  }
}
