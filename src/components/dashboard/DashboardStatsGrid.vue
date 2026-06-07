<script setup lang="ts">
import type { DashboardKpis, DashboardStat } from '../../scripts/app/dashboard-view-model'
import DashboardStatCard from './DashboardStatCard.vue'

const props = defineProps<{
  kpis?: DashboardKpis
}>()

const statIconClass = 'h-6 w-6 xl:h-8 xl:w-8'
const emptyStat: DashboardStat = {
  value: '0,00 €',
  delta: null,
  sparkValues: [],
}

function stat(kind: 'income' | 'expense' | 'investment'): DashboardStat {
  return props.kpis?.[kind] ?? emptyStat
}
</script>

<template>
  <section
    class="dash-stats grid grid-cols-3 gap-4 max-[860px]:grid-cols-1"
    aria-label="Resumen del mes"
  >
    <DashboardStatCard
      variant="income"
      label="Ingresos"
      :value="stat('income').value"
      value-id="kpi-income"
      delta-id="kpi-income-delta"
      spark-id="spark-income"
      :delta="stat('income').delta"
      :spark-values="stat('income').sparkValues"
    >
      <template #icon>
        <svg
          :class="statIconClass"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <path d="M10 15V5"></path>
          <path d="M6 9l4-4 4 4"></path>
        </svg>
      </template>
    </DashboardStatCard>

    <DashboardStatCard
      variant="expense"
      label="Gastos"
      :value="stat('expense').value"
      value-id="kpi-expense"
      delta-id="kpi-expense-delta"
      spark-id="spark-expense"
      :delta="stat('expense').delta"
      :spark-values="stat('expense').sparkValues"
    >
      <template #icon>
        <svg
          :class="statIconClass"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <path d="M10 5v10"></path>
          <path d="M6 11l4 4 4-4"></path>
        </svg>
      </template>
    </DashboardStatCard>

    <DashboardStatCard
      variant="investment"
      label="Ahorro o inversión"
      :value="stat('investment').value"
      value-id="kpi-investment"
      delta-id="kpi-investment-delta"
      spark-id="spark-investment"
      :delta="stat('investment').delta"
      :spark-values="stat('investment').sparkValues"
    >
      <template #icon>
        <svg
          :class="statIconClass"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <circle cx="10" cy="10" r="7"></circle>
          <circle cx="10" cy="10" r="3.4"></circle>
          <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none"></circle>
        </svg>
      </template>
    </DashboardStatCard>
  </section>
</template>
