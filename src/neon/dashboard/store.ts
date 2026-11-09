import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { useSectionNavigation } from '../../composables/useSectionNavigation'
import type { SectionId } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'
import { useUiStore } from '../../stores/ui'
import { buildNeonDashboardViewModel, type RecentFilter, type WealthRange } from './view-model'

/**
 * Presentation state of the new dashboard. A store rather than component
 * state so the net worth range survives leaving the section and coming back:
 * the section unmounts on every navigation, the store does not.
 */
export const useNeonDashboardStore = defineStore('neon-dashboard', () => {
  const financialStateStore = useFinancialStateStore()
  const recurringStore = useRecurringStore()
  const uiStore = useUiStore()
  const { navigateTo } = useSectionNavigation()
  const range = shallowRef<WealthRange>('1a')
  const recentFilter = shallowRef<RecentFilter>('all')

  const viewModel = computed(() =>
    buildNeonDashboardViewModel({
      state: financialStateStore.state,
      pending: recurringStore.openPendingMovements,
      range: range.value,
      recentFilter: recentFilter.value,
      today: recurringStore.resolveToday(),
    }),
  )

  /** Opens Movimientos with the registry already searching for `query`. */
  function searchMovements(query: string): void {
    uiStore.ui.txFilters.search = query.trim()
    navigateTo('transactions')
  }

  /** Confirms every open pending movement, oldest first, as «Confirmar» one by one would. */
  function confirmAllPending(): void {
    for (const id of recurringStore.openPendingMovements.map((item) => item.id)) {
      recurringStore.confirmPending(id)
    }
  }

  return {
    viewModel,
    range,
    recentFilter,
    searchMovements,
    confirmAllPending,
    navigate: (section: SectionId) => navigateTo(section),
  }
})
