<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'

import { renderGroupedBarChart } from '../../scripts/charts'
import type { DashboardCashflowChart } from '../../scripts/app/dashboard-view-model'
import { formatMoneyForCurrency } from '../../scripts/money-format'

const props = defineProps<{
  chart: DashboardCashflowChart
  currency: string
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

watch(() => [props.chart, props.currency] as const, renderChart, { deep: true, immediate: true })

async function renderChart(): Promise<void> {
  await nextTick()
  if (!canvas.value) {
    return
  }
  renderGroupedBarChart(
    canvas.value,
    props.chart.labels,
    [
      { name: 'Ingresos', color: '#059669', values: props.chart.income },
      { name: 'Gastos', color: '#ef4444', values: props.chart.expense },
      { name: 'Inversión', color: '#2563eb', values: props.chart.investment },
    ],
    (value) => formatMoneyForCurrency(value, props.currency),
  )
}
</script>

<template>
  <div class="dash-chart-wrap relative mt-0.5 min-h-52.5 grow">
    <canvas
      id="chart-cashflow"
      ref="canvas"
      class="absolute inset-0 h-full! w-full!"
      aria-label="Flujo mensual de ingresos, gastos e inversión"
    ></canvas>
  </div>
</template>
