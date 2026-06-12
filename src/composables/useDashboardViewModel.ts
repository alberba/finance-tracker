import { computed, onMounted, onUnmounted, shallowRef } from 'vue'

import type {
  DashboardCashflowChart,
  DashboardHeroRange,
  DashboardLineChart,
  DashboardSavingsGoal,
  DashboardViewModel,
} from '../scripts/app/dashboard-view-model'
import {
  requestDashboardMonthChange,
  requestDashboardNavigation,
  requestDashboardRangeChange,
  requestDashboardYearChange,
  subscribeDashboardViewModel,
} from '../scripts/app/dashboard-view-model-bridge'
import { MONTHS, isSectionId } from '../scripts/types'

const emptyNetWorthChart: DashboardLineChart = {
  labels: [],
  values: [],
  endpoint: '0,00 €',
}
const emptyCashflowChart: DashboardCashflowChart = {
  labels: [],
  income: [],
  expense: [],
  investment: [],
}
const emptySavingsGoal: DashboardSavingsGoal = {
  kind: 'empty',
  message: 'Cargando dashboard.',
}
const fallbackMonths = MONTHS.map((label, value) => ({ label, value }))
const fallbackRanges = [
  { value: '7d' as const, label: '7D', active: false },
  { value: '1m' as const, label: '1M', active: false },
  { value: '6m' as const, label: '6M', active: false },
  { value: '1a' as const, label: '1A', active: true },
]

export function useDashboardViewModel() {
  const dashboard = shallowRef<DashboardViewModel | null>(null)
  let unsubscribeDashboard: (() => void) | undefined

  onMounted(() => {
    unsubscribeDashboard = subscribeDashboardViewModel((nextDashboard) => {
      dashboard.value = nextDashboard
    })
  })

  onUnmounted(() => {
    unsubscribeDashboard?.()
    unsubscribeDashboard = undefined
  })

  const currentCurrency = computed(() => dashboard.value?.currency || 'EUR')
  const currentYear = computed(() => dashboard.value?.year ?? new Date().getFullYear())
  const currentMonth = computed(() =>
    dashboard.value?.month ?? Math.min(new Date().getMonth(), MONTHS.length - 1),
  )
  const monthOptions = computed(() => dashboard.value?.months ?? fallbackMonths)
  const rangeOptions = computed(() => dashboard.value?.ranges ?? fallbackRanges)
  const kpis = computed(() => dashboard.value?.kpis)
  const netWorthChart = computed(() => dashboard.value?.netWorthChart ?? emptyNetWorthChart)
  const cashflowChart = computed(() => dashboard.value?.cashflowChart ?? emptyCashflowChart)
  const topExpenses = computed(() => dashboard.value?.topExpenses ?? [])
  const wealthSplit = computed(() => dashboard.value?.wealthSplit ?? [])
  const investmentProgress = computed(() => dashboard.value?.investmentProgress ?? [])
  const recentTransactions = computed(() => dashboard.value?.recentTransactions ?? [])
  const savingsGoal = computed(() => dashboard.value?.savingsGoal ?? emptySavingsGoal)

  function changeYear(year: number): void {
    requestDashboardYearChange(year)
  }

  function changeMonth(month: number): void {
    requestDashboardMonthChange(month)
  }

  function changeRange(range: DashboardHeroRange): void {
    requestDashboardRangeChange(range)
  }

  function navigate(target: string): void {
    if (isSectionId(target)) {
      requestDashboardNavigation(target)
    }
  }

  return {
    currentCurrency,
    currentYear,
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
    changeYear,
    changeMonth,
    changeRange,
    navigate,
  }
}
