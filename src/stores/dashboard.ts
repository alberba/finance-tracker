import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import type {
  DashboardCashflowChart,
  DashboardHeroRange,
  DashboardLineChart,
  DashboardSavingsGoal,
  DashboardViewModel,
} from '../domain/dashboard/view-model'
import { MONTHS, isSectionId } from '../scripts/types'
import type { SectionId } from '../scripts/types'

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

interface DashboardControllerActions {
  changeYear: (year: number) => void
  changeMonth: (month: number) => void
  changeRange: (range: DashboardHeroRange) => void
  navigate: (sectionId: SectionId) => void
}

export const useDashboardStore = defineStore('dashboard', () => {
  const viewModel = shallowRef<DashboardViewModel | null>(null)
  let controllerActions: DashboardControllerActions | null = null

  const currentCurrency = computed(() => viewModel.value?.currency || 'EUR')
  const currentYear = computed(() => viewModel.value?.year ?? new Date().getFullYear())
  const currentMonth = computed(() =>
    viewModel.value?.month ?? Math.min(new Date().getMonth(), MONTHS.length - 1),
  )
  const monthOptions = computed(() => viewModel.value?.months ?? fallbackMonths)
  const rangeOptions = computed(() => viewModel.value?.ranges ?? fallbackRanges)
  const kpis = computed(() => viewModel.value?.kpis)
  const netWorthChart = computed(() => viewModel.value?.netWorthChart ?? emptyNetWorthChart)
  const cashflowChart = computed(() => viewModel.value?.cashflowChart ?? emptyCashflowChart)
  const topExpenses = computed(() => viewModel.value?.topExpenses ?? [])
  const wealthSplit = computed(() => viewModel.value?.wealthSplit ?? [])
  const investmentProgress = computed(() => viewModel.value?.investmentProgress ?? [])
  const recentTransactions = computed(() => viewModel.value?.recentTransactions ?? [])
  const savingsGoal = computed(() => viewModel.value?.savingsGoal ?? emptySavingsGoal)

  function setViewModel(nextViewModel: DashboardViewModel): void {
    viewModel.value = nextViewModel
  }

  function registerControllerActions(actions: DashboardControllerActions): void {
    controllerActions = actions
  }

  function requestYearChange(year: number): void {
    controllerActions?.changeYear(year)
  }

  function requestMonthChange(month: number): void {
    controllerActions?.changeMonth(month)
  }

  function requestRangeChange(range: DashboardHeroRange): void {
    controllerActions?.changeRange(range)
  }

  function requestNavigation(target: string): void {
    if (isSectionId(target)) {
      controllerActions?.navigate(target)
    }
  }

  return {
    viewModel,
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
    setViewModel,
    registerControllerActions,
    requestYearChange,
    requestMonthChange,
    requestRangeChange,
    requestNavigation,
  }
})
