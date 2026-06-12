<script setup lang="ts">
import { useDashboardViewModel } from '../../composables/useDashboardViewModel'
import DashboardCashflowPanel from '../dashboard/DashboardCashflowPanel.vue'
import DashboardHeroNetWorth from '../dashboard/DashboardHeroNetWorth.vue'
import DashboardOverviewPanels from '../dashboard/DashboardOverviewPanels.vue'
import DashboardPanel from '../dashboard/DashboardPanel.vue'
import DashboardPeriodControls from '../dashboard/DashboardPeriodControls.vue'
import DashboardRecentTransactionsPanel from '../dashboard/DashboardRecentTransactionsPanel.vue'
import DashboardSavingsGoalPanel from '../dashboard/DashboardSavingsGoalPanel.vue'
import DashboardStatsGrid from '../dashboard/DashboardStatsGrid.vue'

const props = withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: true },
)

const {
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
} = useDashboardViewModel()
</script>

<template>
  <section
    id="dashboard"
    class="panel dash gap-[clamp(18px,2.6vw,28px)]"
    :class="{ 'is-active': props.isActive }"
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
      @navigate="navigate"
    />

    <section
      class="dash-panels-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-stretch gap-[clamp(14px,1.6vw,20px)] max-[1200px]:grid-cols-1"
    >
      <DashboardPanel
        title="Objetivo de ahorro"
        action-label="Ver todos los objetivos"
        action-target="goals"
        @navigate="navigate"
      >
        <DashboardSavingsGoalPanel :goal="savingsGoal" />
      </DashboardPanel>
      <DashboardPanel
        title="Ingresos, gastos e inversión"
        action-label="Ver análisis detallado"
        action-target="reports"
        class="dash-panel--chart justify-start gap-3.5"
        @navigate="navigate"
      >
        <DashboardCashflowPanel :chart="cashflowChart" :currency="currentCurrency" />
      </DashboardPanel>
    </section>

    <DashboardRecentTransactionsPanel :transactions="recentTransactions" @navigate="navigate" />
  </section>
</template>
