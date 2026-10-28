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

/**
 * Secciones cuyo clic de navegación devuelve la vista al inicio (#383).
 *
 * Solo Movimientos: su registro largo esconde la cabecera y el alta al
 * revisar meses anteriores. El resto de secciones mantiene su navegación
 * actual, que el alcance de la issue deja explícitamente fuera.
 */
const SECTIONS_THAT_RETURN_TO_START_ON_NAV: readonly SectionId[] = ['transactions']

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
      switchSection(section, { returnToStart: true })
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

  /**
   * Cambia la sección activa, sus marcas y la ruta. El arranque y `popstate`
   * lo llaman sin `returnToStart`, así que conservan la posición del documento;
   * solo el clic de navegación del usuario lo activa (#383).
   */
  function switchSection(
    sectionId: SectionId | string,
    options: { updateHistory?: boolean; returnToStart?: boolean } = {},
  ) {
    const { updateHistory = true, returnToStart = false } = options
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

    if (returnToStart && SECTIONS_THAT_RETURN_TO_START_ON_NAV.includes(normalizedSectionId)) {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }

  return {
    bindNavigationEvents,
    switchSection,
    getSectionFromPath,
  }
}
