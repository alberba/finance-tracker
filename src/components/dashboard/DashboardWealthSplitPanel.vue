<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

import { renderDonutChart } from '../../scripts/charts'
import {
  subscribeDashboardWealthSplit,
  type DashboardWealthSplitItem,
} from '../../scripts/app/dashboard-wealth-split-bridge'

const items = ref<DashboardWealthSplitItem[]>([])
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let unsubscribe: (() => void) | undefined

const chartItems = computed(() =>
  items.value.length
    ? items.value
    : [{ label: 'Sin datos', color: cssColor('--line-strong', '#CCD4E1'), value: 0 }],
)

function cssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function formatChartValue(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

async function renderChart(): Promise<void> {
  await nextTick()
  if (!canvas.value) {
    return
  }
  renderDonutChart(canvas.value, chartItems.value, formatChartValue, { showLegend: false })
}

watch(items, renderChart)

onMounted(() => {
  unsubscribe = subscribeDashboardWealthSplit((nextItems) => {
    items.value = nextItems
  })
  void renderChart()
})

onUnmounted(() => {
  unsubscribe?.()
})
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
    <div
      v-for="item in items"
      :key="item.label"
      class="flex justify-between items-center"
    >
      <div class="flex items-center gap-2">
        <span
          class="block h-2.25 w-2.25 rounded-[3px]"
          :style="{ background: item.color }"
        ></span>
        <span
          class="overflow-hidden text-ellipsis whitespace-nowrap text-(--text-muted)"
        >
          {{ item.label }}
        </span>
      </div>
      <div class="flex gap-1">
        <strong
          class="font-['DM_Mono',monospace] text-xs font-medium"
        >
          {{ item.amount }}
        </strong>
        <span class="text-xs text-(--text-faint)">
          {{ item.pct }}
        </span>
        
      </div>
    </div>
    <p v-if="!items.length" class="dash-empty py-2 text-sm text-(--text-faint)">
      Configura tus cuentas e inversiones en Patrimonio.
    </p>
  </div>
</template>
