import { storeToRefs } from 'pinia'

import { useDashboardStore } from '../stores/dashboard'

export function useDashboardViewModel() {
  const dashboardStore = useDashboardStore()
  const { viewModel, activeRange } = storeToRefs(dashboardStore)

  return {
    viewModel,
    activeRange,
    changeYear: dashboardStore.requestYearChange,
    changeMonth: dashboardStore.requestMonthChange,
    changeRange: dashboardStore.requestRangeChange,
    navigate: dashboardStore.requestNavigation,
  }
}
