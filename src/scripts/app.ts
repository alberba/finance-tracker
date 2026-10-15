import { isDemoMode } from './demo-mode'
import { watch } from 'vue'
import { type State } from './types'
import { setupDashboardBudgetGoalsSection } from './app/dashboard-budget-goals-section'
import { getEventElement } from './app/dom-helpers'
import { getAppElements } from './app/elements'
import { type UiState } from './app/ui-state'
import { clone, todayISO } from './utils'
import { BASE_SEED, loadPersistedState, persistState, sortTransactionsInState } from './state'
import { materializeDueSubscriptions } from './subscriptions'
import { useFinancialStateStore } from '../stores/financial-state'
import { pinia } from '../stores/pinia'
import { useUiStore } from '../stores/ui'
import { useRecurringStore } from '../stores/recurring'
import { useSyncStore } from '../stores/sync'
import { registerFinanceTools, type FinanceModelContext } from '../lib/client/webmcp'

;(() => {
  'use strict'

  const financialStateStore = useFinancialStateStore(pinia)
  const uiStore = useUiStore(pinia)
  const recurringStore = useRecurringStore(pinia)
  let state: State = financialStateStore.state
  const ui = uiStore.ui as UiState

  const el = getAppElements()

  const dashboardBudgetGoalsSection = setupDashboardBudgetGoalsSection({
    ui,
    el,
  })

  void init().catch(() => {
    financialStateStore.failLoad('No se pudo cargar tu sesión. Recarga para volver a conectar.')
  })

  async function init() {
    await hydrateState()
    if (isDemoMode()) {
      watch(
        () => financialStateStore.state,
        (nextState) => persistState(nextState),
        { deep: true },
      )
    }
    ui.activeSection = dashboardBudgetGoalsSection.getSectionFromPath(window.location.pathname)
    bindEvents()
    dashboardBudgetGoalsSection.switchSection(ui.activeSection, {
      updateHistory: false,
    })
    const context = (document as Document & { modelContext?: FinanceModelContext }).modelContext
    try {
      await registerFinanceTools(context, () => {
        if (!isDemoMode() && !useSyncStore(pinia).userId) {
          throw new Error('La sesión ya no está activa.')
        }
        return financialStateStore.state
      })
    } catch {
      console.warn('No se pudieron registrar las herramientas WebMCP.')
    }
    document.documentElement.dataset.financeReady = 'true'
  }

  /** Authenticated sessions hydrate from sync v2; only demo uses localStorage. */
  async function hydrateState() {
    if (!isDemoMode()) {
      const response = await fetch('/api/session')
      if (!response.ok) throw new Error('No se pudo resolver la sesión para sync v2.')
      const session = (await response.json()) as { user?: { id?: string; email?: string } }
      if (!session.user?.id) throw new Error('La sesión no contiene una identidad válida.')
      await useSyncStore(pinia).init(session.user.id, { email: session.user.email ?? null })
      state = financialStateStore.state
      recurringStore.refreshPending()
      return
    }

    const localState = loadPersistedState()
    state = financialStateStore.replaceState(localState ?? clone(BASE_SEED))

    const dueSubscriptions = materializeDueSubscriptions(state, todayISO())
    if (dueSubscriptions.advancedCount > 0) {
      sortTransactionsInState(state)
    }
    recurringStore.refreshPending()
    persistState(state)
  }

  function bindEvents() {
    dashboardBudgetGoalsSection.bindNavigationEvents()
    bindChartTooltipEvents()
  }

  function bindChartTooltipEvents() {
    const hideTooltip = () => {
      delete el.chartTooltip.dataset.visible
      el.chartTooltip.setAttribute('aria-hidden', 'true')
    }

    const showTooltip = (message: string, x: number, y: number) => {
      el.chartTooltip.textContent = message
      el.chartTooltip.dataset.visible = ''
      el.chartTooltip.setAttribute('aria-hidden', 'false')

      const offset = 14
      const maxLeft = window.innerWidth - el.chartTooltip.offsetWidth - 8
      const maxTop = window.innerHeight - el.chartTooltip.offsetHeight - 8
      const left = Math.min(Math.max(8, x + offset), Math.max(8, maxLeft))
      const top = Math.min(Math.max(8, y + offset), Math.max(8, maxTop))
      el.chartTooltip.style.left = `${left}px`
      el.chartTooltip.style.top = `${top}px`
    }

    document.addEventListener('pointermove', (event) => {
      const target = getEventElement(event.target)
      const withTooltip = target?.closest<SVGElement>('[data-chart-tooltip]')
      if (!withTooltip) {
        const insideChart = target?.closest('svg') || target?.closest('canvas')
        if (insideChart) {
          return
        }
        hideTooltip()
        return
      }
      const message = withTooltip.getAttribute('data-chart-tooltip')
      if (!message) {
        hideTooltip()
        return
      }
      showTooltip(message, event.clientX, event.clientY)
    })

    document.addEventListener('pointerdown', hideTooltip)
    window.addEventListener('blur', hideTooltip)
  }
})()
