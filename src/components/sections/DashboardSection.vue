<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'

import {
  requestDashboardMonthChange,
  requestDashboardNavigation,
  requestDashboardRangeChange,
  requestDashboardYearChange,
  subscribeDashboardViewModel,
} from '../../scripts/app/dashboard-view-model-bridge'
import type {
  DashboardCashflowChart,
  DashboardHeroRange,
  DashboardLineChart,
  DashboardSavingsGoal,
  DashboardViewModel,
} from '../../scripts/app/dashboard-view-model'
import { MONTHS, isSectionId } from '../../scripts/types'
import DashboardHeroNetWorth from '../dashboard/DashboardHeroNetWorth.vue'
import DashboardOverviewPanels from '../dashboard/DashboardOverviewPanels.vue'
import DashboardPeriodControls from '../dashboard/DashboardPeriodControls.vue'
import DashboardRecentTransactionsPanel from '../dashboard/DashboardRecentTransactionsPanel.vue'
import DashboardSavingsGoalPanel from '../dashboard/DashboardSavingsGoalPanel.vue'
import DashboardStatsGrid from '../dashboard/DashboardStatsGrid.vue'

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

const dashboard = shallowRef<DashboardViewModel | null>(null)
let unsubscribeDashboard: (() => void) | undefined

const fallbackMonths = MONTHS.map((label, value) => ({ label, value }))
const currentCurrency = computed(() => dashboard.value?.currency || 'EUR')
const currentYear = computed(() => dashboard.value?.year ?? new Date().getFullYear())
const currentMonth = computed(() => dashboard.value?.month ?? Math.min(new Date().getMonth(), 11))
const monthOptions = computed(() => dashboard.value?.months ?? fallbackMonths)
const rangeOptions = computed(
  () =>
    dashboard.value?.ranges ?? [
      { value: '7d' as const, label: '7D', active: false },
      { value: '1m' as const, label: '1M', active: false },
      { value: '6m' as const, label: '6M', active: false },
      { value: '1a' as const, label: '1A', active: true },
    ],
)
const kpis = computed(() => dashboard.value?.kpis)
const netWorthChart = computed(() => dashboard.value?.netWorthChart ?? emptyNetWorthChart)
const cashflowChart = computed(() => dashboard.value?.cashflowChart ?? emptyCashflowChart)
const topExpenses = computed(() => dashboard.value?.topExpenses ?? [])
const wealthSplit = computed(() => dashboard.value?.wealthSplit ?? [])
const investmentProgress = computed(() => dashboard.value?.investmentProgress ?? [])
const recentTransactions = computed(() => dashboard.value?.recentTransactions ?? [])
const savingsGoal = computed(() => dashboard.value?.savingsGoal ?? emptySavingsGoal)

onMounted(() => {
  unsubscribeDashboard = subscribeDashboardViewModel((nextDashboard) => {
    dashboard.value = nextDashboard
  })
})

onUnmounted(() => {
  unsubscribeDashboard?.()
})

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
</script>

<template>
  <section
    id="dashboard"
    class="panel is-active dash gap-[clamp(18px,2.6vw,28px)]"
    aria-labelledby="dashboard-title"
  >
    <header
      class="dash-masthead flex flex-wrap items-start justify-between gap-5 max-[640px]:flex-col"
    >
      <div class="dash-masthead-titles grid gap-1.5">
        <p
          class="dash-eyebrow font-['DM_Mono',monospace] text-[0.66rem] font-medium tracking-[0.22em] text-(--primary) uppercase"
        >
          ¡Bienvenido de nuevo!
        </p>
        <h2
          id="dashboard-title"
          class="font-['Syne',sans-serif] text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.05] tracking-[-0.035em] text-(--text-main)"
        >
          Resumen financiero
        </h2>
        <p class="dash-subtitle text-[0.92rem] text-(--text-muted)">
          Aquí tienes una visión completa de tu situación financiera.
        </p>
      </div>
      <DashboardPeriodControls
        :year="currentYear"
        :month="currentMonth"
        :months="monthOptions"
        @change-year="changeYear"
        @change-month="changeMonth"
      />
    </header>

    <DashboardHeroNetWorth
      :kpis="kpis"
      :chart="netWorthChart"
      :ranges="rangeOptions"
      :currency="currentCurrency"
      @change-range="changeRange"
    />

    <DashboardStatsGrid :kpis="kpis" />

    <DashboardOverviewPanels
      :currency="currentCurrency"
      :wealth-split="wealthSplit"
      :top-expenses="topExpenses"
      :investment-progress="investmentProgress"
      :cashflow-chart="cashflowChart"
      @navigate="navigate"
    />

    <section
      class="dash-panels-2 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-[clamp(14px,1.6vw,20px)] max-[1200px]:grid-cols-1"
    >
      <DashboardRecentTransactionsPanel :transactions="recentTransactions" @navigate="navigate" />
      <DashboardSavingsGoalPanel :goal="savingsGoal" @navigate="navigate" />
    </section>
  </section>
</template>
