import { storeToRefs } from 'pinia'

import { useDashboardStore } from '../stores/dashboard'

export function useDashboardViewModel() {
  const dashboardStore = useDashboardStore()
  const {
    currentCurrency,
    currentYear,
    yearOptions,
    currentMonth,
    monthOptions,
    rangeOptions,
    kpis,
    netWorthChart,
    cashflowChart,
    topExpenses,
    wealthSplit,
    investmentProgress,
    recentTransactions,
    savingsGoal,
  } = storeToRefs(dashboardStore)

  return {
    currentCurrency,
    currentYear,
    yearOptions,
    currentMonth,
    monthOptions,
    rangeOptions,
    kpis,
    netWorthChart,
    cashflowChart,
    topExpenses,
    wealthSplit,
    investmentProgress,
    recentTransactions,
    savingsGoal,
    changeYear: dashboardStore.requestYearChange,
    changeMonth: dashboardStore.requestMonthChange,
    changeRange: dashboardStore.requestRangeChange,
    navigate: dashboardStore.requestNavigation,
  }
}
