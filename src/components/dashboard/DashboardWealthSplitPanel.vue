<script setup lang="ts">
import { computed } from 'vue'

import ChartCanvas from '../charts/ChartCanvas.vue'
import { renderDonutChart } from '../../scripts/charts'
import type { DashboardWealthSplitItem } from '../../domain/dashboard/view-model'
import { formatMoneyForCurrency } from '../../scripts/money-format'
import { resolveCssColor } from '../../scripts/css-color'

type WealthSplitChartItem = Pick<
  DashboardWealthSplitItem,
  'label' | 'colorVar' | 'fallbackColor' | 'value'
>

const props = defineProps<{
  currency: string
  items: DashboardWealthSplitItem[]
}>()

const drawChart = computed(() => {
  const items = props.items.map(({ label, colorVar, fallbackColor, value }) => ({
    label,
    colorVar,
    fallbackColor,
    value,
  }))
  const currency = props.currency

  return (canvas: HTMLCanvasElement) => {
    renderDonutChart(
      canvas,
      chartItemsForTheme(items),
      (value) => formatMoneyForCurrency(value, currency),
      { showLegend: false },
    )
  }
})

function chartItemsForTheme(items: WealthSplitChartItem[]): Array<{
  label: string
  color: string
  value: number
}> {
  if (!items.length) {
    return [{ label: 'Sin datos', color: resolveCssColor('--line-strong', '#CCD4E1'), value: 0 }]
  }

  return items.map((item) => ({
    label: item.label,
    color: resolveCssColor(item.colorVar, item.fallbackColor),
    value: item.value,
  }))
}

</script>

<template>
  <div class="relative h-40">
    <ChartCanvas
      id="chart-wealth-split"
      class="absolute inset-0 h-full w-full"
      aria-label="Distribución del patrimonio"
      :draw="drawChart"
    />
  </div>

  <div id="wealth-split-legend" class="grid gap-1">
    <div v-for="item in props.items" :key="item.label" class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span
          class="block h-2.25 w-2.25 rounded-[3px]"
          :style="{ background: resolveCssColor(item.colorVar, item.fallbackColor) }"
        ></span>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap text-text-muted">
          {{ item.label }}
        </span>
      </div>
      <div class="flex gap-1">
        <strong class="font-mono text-xs font-medium">
          {{ item.amount }}
        </strong>
        <span class="text-xs text-text-faint">
          {{ item.pct }}
        </span>
      </div>
    </div>
    <p v-if="!props.items.length" class="dash-empty py-2 text-sm text-text-faint">
      Configura tus cuentas e inversiones en Patrimonio.
    </p>
  </div>
</template>
