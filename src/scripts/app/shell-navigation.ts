import { type SectionId } from '../types'
import {
  getPathFromSection,
  getSectionFromPath,
  isReportsPath,
  normalizeSectionId,
} from './dashboard-section-routing'
import { pinia } from '../../stores/pinia'
import type { Month } from '../../lib/month'
import { useUiStore } from '../../stores/ui'

const MOBILE_PRIMARY_SECTIONS: SectionId[] = ['dashboard', 'transactions', 'budget', 'investment']

interface DashboardNavigationUi {
  activeSection: SectionId
  month: Month
}

interface DashboardNavigationElements {
  navTabs: HTMLElement
}

interface DashboardNavigationDeps {
  ui: DashboardNavigationUi
  el: DashboardNavigationElements
}

export function setupShellNavigation(deps: DashboardNavigationDeps) {
  const { ui, el } = deps
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
      if (isReportsPath(window.location.pathname)) {
        uiStore.setPage('reports')
        clearActiveNavigation()
        return
      }
      uiStore.setPage('section')
      const sectionId = getSectionFromPath(window.location.pathname)
      switchSection(sectionId, { updateHistory: false })
    })
  }

  /** Quita la marca de la sección activa: en `/reportes` no hay ninguna. */
  function clearActiveNavigation() {
    Array.from(el.navTabs.querySelectorAll<HTMLElement>('[data-nav-item]')).forEach((button) => {
      button.removeAttribute('aria-current')
    })
    const mobileMoreTrigger = el.navTabs.querySelector<HTMLElement>('[data-mobile-more-trigger]')
    if (mobileMoreTrigger) mobileMoreTrigger.dataset.active = 'false'
  }

  function switchSection(sectionId: SectionId | string, options: { updateHistory?: boolean } = {}) {
    const { updateHistory = true } = options
    const normalizedSectionId = normalizeSectionId(sectionId)
    ui.activeSection = normalizedSectionId
    uiStore.setActiveSection(normalizedSectionId)
    uiStore.setPage('section')

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

  return {
    bindNavigationEvents,
    switchSection,
    getSectionFromPath,
  }
}
