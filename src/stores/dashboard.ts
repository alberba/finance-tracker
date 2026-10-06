import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import type { DashboardHeroRange } from '../domain/dashboard/view-model'
import { buildDashboardViewModelFromState } from '../domain/dashboard/view-model'
import { isSectionId } from '../scripts/types'
import type { SectionId } from '../scripts/types'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

interface DashboardControllerActions {
  changeYear: (year: number) => void
  changeMonth: (month: number) => void
  changeRange: (range: DashboardHeroRange) => void
  navigate: (sectionId: SectionId) => void
}

export const useDashboardStore = defineStore('dashboard', () => {
  const financialStateStore = useFinancialStateStore()
  const uiStore = useUiStore()
  const heroRange = shallowRef<DashboardHeroRange>('1a')
  let controllerActions: DashboardControllerActions | null = null

  const viewModel = computed(() =>
    buildDashboardViewModelFromState({
      state: financialStateStore.state,
      month: uiStore.ui.month,
      heroRange: heroRange.value,
    }),
  )

  const activeRange = computed(() => heroRange.value)

  function registerControllerActions(actions: DashboardControllerActions): void {
    controllerActions = actions
  }

  function requestYearChange(year: number): void {
    controllerActions?.changeYear(year)
  }

  function requestMonthChange(month: number): void {
    uiStore.setDashboardMonth(month)
    controllerActions?.changeMonth(month)
  }

  function requestRangeChange(range: DashboardHeroRange): void {
    heroRange.value = range
    controllerActions?.changeRange(range)
  }

  function requestNavigation(target: string): void {
    if (isSectionId(target)) {
      controllerActions?.navigate(target)
    }
  }

  return {
    viewModel,
    activeRange,
    registerControllerActions,
    requestYearChange,
    requestMonthChange,
    requestRangeChange,
    requestNavigation,
  }
})
