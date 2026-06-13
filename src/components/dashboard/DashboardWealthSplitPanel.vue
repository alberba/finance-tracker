<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import { renderDonutChart } from '../../scripts/charts'
import type { DashboardWealthSplitItem } from '../../domain/dashboard/view-model'
import { formatMoneyForCurrency } from '../../scripts/money-format'

const props = defineProps<{
  currency: string
  items: DashboardWealthSplitItem[]
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

const chartItems = computed(() =>
  props.items.length
    ? props.items.map((item) => ({
        ...item,
        color: cssColor(item.colorVar, item.fallbackColor),
      }))
    : [{ label: 'Sin datos', color: cssColor('--line-strong', '#CCD4E1'), value: 0 }],
)

watch(() => [props.items, props.currency] as const, renderChart, { deep: true, immediate: true })

async function renderChart(): Promise<void> {
  await nextTick()
  if (!canvas.value) {
    return
  }
  renderDonutChart(
    canvas.value,
    chartItems.value,
    (value) => formatMoneyForCurrency(value, props.currency),
    { showLegend: false },
  )
}

function cssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
</script>

<template>
  <div class="relative h-40">
    <canvas
      id="chart-wealth-split"
      ref="canvas"
      class="absolute inset-0 h-full w-full"
      aria-label="Distribución del patrimonio"
    ></canvas>
  </div>

  <div id="wealth-split-legend" class="grid gap-1">
    <div v-for="item in props.items" :key="item.label" class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span
          class="block h-2.25 w-2.25 rounded-[3px]"
          :style="{ background: cssColor(item.colorVar, item.fallbackColor) }"
        ></span>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap text-(--text-muted)">
          {{ item.label }}
        </span>
      </div>
      <div class="flex gap-1">
        <strong class="font-['DM_Mono',monospace] text-xs font-medium">
          {{ item.amount }}
        </strong>
        <span class="text-xs text-(--text-faint)">
          {{ item.pct }}
        </span>
      </div>
    </div>
    <p v-if="!props.items.length" class="dash-empty py-2 text-sm text-(--text-faint)">
      Configura tus cuentas e inversiones en Patrimonio.
    </p>
  </div>
</template>
