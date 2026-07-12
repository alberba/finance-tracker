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
import AppSection from '../ui/AppSection.vue'
import MarketQuotesPanel from '../market/MarketQuotesPanel.vue'
import PendingMovementsPanel from '../recurring/PendingMovementsPanel.vue'

const props = withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: true },
)

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
  changeYear,
  changeMonth,
  changeRange,
  navigate,
} = useDashboardViewModel()
</script>

<template>
  <AppSection id="dashboard" :is-active="props.isActive">
    <header class="flex flex-col items-start justify-between gap-4 md:flex-row">
      <div class="grid gap-1">
        <p class="text-primary font-mono text-xs tracking-widest uppercase">
          ¡Bienvenido de nuevo!
        </p>
        <h2
          id="dashboard-title"
          class="font-display text-text-main text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.05]"
        >
          Resumen financiero
        </h2>
        <p class="text-text-muted">Aquí tienes una visión completa de tu situación financiera.</p>
      </div>
      <DashboardPeriodControls
        :year="currentYear"
        :years="yearOptions"
        :month="currentMonth"
        :months="monthOptions"
        @change-year="changeYear"
        @change-month="changeMonth"
      />
    </header>

    <PendingMovementsPanel compact />
    <MarketQuotesPanel title="Cartera a precio de mercado" />

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

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <DashboardPanel
        title="Objetivo de ahorro"
        action-label="Ver todos los objetivos"
        action-target="goals"
        class="xl:col-span-2"
        @navigate="navigate"
      >
        <DashboardSavingsGoalPanel :goal="savingsGoal" />
      </DashboardPanel>
      <DashboardPanel
        title="Ingresos, gastos e inversión"
        action-label="Ver análisis detallado"
        action-target="reports"
        class="xl:col-span-3"
        @navigate="navigate"
      >
        <DashboardCashflowPanel :chart="cashflowChart" :currency="currentCurrency" />
      </DashboardPanel>
    </section>

    <DashboardPanel
      title="Últimos movimientos"
      action-label="Ver todos los movimientos"
      action-target="transactions"
      class="mt-4"
      @navigate="navigate"
    >
      <DashboardRecentTransactionsPanel :transactions="recentTransactions" @navigate="navigate" />
    </DashboardPanel>
  </AppSection>
</template>
