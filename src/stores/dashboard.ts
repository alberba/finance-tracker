import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { MONTHS } from '../scripts/types'
import type { DashboardHeroRange } from '../domain/dashboard/view-model'
import { buildDashboardViewModelFromState } from '../domain/dashboard/view-model'
import { isSectionId } from '../scripts/types'
import { parseIntSafe } from '../scripts/utils'
import { useSectionNavigation } from '../composables/useSectionNavigation'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

export const useDashboardStore = defineStore('dashboard', () => {
  const financialStateStore = useFinancialStateStore()
  const uiStore = useUiStore()
  const { navigateTo } = useSectionNavigation()
  const heroRange = shallowRef<DashboardHeroRange>('1a')

  const viewModel = computed(() =>
    buildDashboardViewModelFromState({
      state: financialStateStore.state,
      month: uiStore.ui.month,
      heroRange: heroRange.value,
    }),
  )

  const activeRange = computed(() => heroRange.value)

  function changeYear(year: number): void {
    financialStateStore.commitState((draft) => {
      draft.year = parseIntSafe(year, draft.year)
    })
  }

  function changeMonth(month: number): void {
    const parsedMonth = parseIntSafe(month, uiStore.ui.month)
    uiStore.setDashboardMonth(MONTHS[parsedMonth] ? parsedMonth : 0)
  }

  function changeRange(range: DashboardHeroRange): void {
    heroRange.value = range
  }

  function navigate(target: string): void {
    if (isSectionId(target)) {
      navigateTo(target)
    }
  }

  return {
    viewModel,
    activeRange,
    changeYear,
    changeMonth,
    changeRange,
    navigate,
  }
})
