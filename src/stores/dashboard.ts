import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import type {
  DashboardHeroRange,
} from '../domain/dashboard/view-model'
import { buildDashboardViewModelFromState } from '../domain/dashboard/view-model'
import { MONTHS, isSectionId } from '../scripts/types'
import type { SectionId } from '../scripts/types'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

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

  const currentCurrency = computed(() => viewModel.value.currency || 'EUR')
  const currentYear = computed(() => viewModel.value.year ?? new Date().getFullYear())
  const yearOptions = computed(() => viewModel.value.yearOptions ?? [currentYear.value])
  const currentMonth = computed(() => viewModel.value.month)
  const monthOptions = computed(() => viewModel.value.months ?? fallbackMonths)
  const rangeOptions = computed(() => viewModel.value.ranges ?? fallbackRanges)
  const kpis = computed(() => viewModel.value.kpis)
  const netWorthChart = computed(() => viewModel.value.netWorthChart)
  const cashflowChart = computed(() => viewModel.value.cashflowChart)
  const topExpenses = computed(() => viewModel.value.topExpenses)
  const wealthSplit = computed(() => viewModel.value.wealthSplit)
  const investmentProgress = computed(() => viewModel.value.investmentProgress)
  const recentTransactions = computed(() => viewModel.value.recentTransactions)
  const savingsGoal = computed(() => viewModel.value.savingsGoal)

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
    registerControllerActions,
    requestYearChange,
    requestMonthChange,
    requestRangeChange,
    requestNavigation,
  }
})
