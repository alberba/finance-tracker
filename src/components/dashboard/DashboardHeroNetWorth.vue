<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'

import { renderLineChart } from '../../scripts/charts'
import InfoIcon from '../../assets/icons/info.svg?component'
import type {
  DashboardHeroRange,
  DashboardKpis,
  DashboardLineChart,
  DashboardRangeOption,
  DashboardTone,
} from '../../domain/dashboard/view-model'
import { formatCompactMoneyForCurrency, formatMoneyForCurrency } from '../../scripts/money-format'

const props = defineProps<{
  kpis?: DashboardKpis
  chart: DashboardLineChart
  ranges: DashboardRangeOption[]
  currency: string
}>()

const emit = defineEmits<{
  'change-range': [range: DashboardHeroRange]
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

watch([() => props.chart, () => props.currency], renderChart, { deep: true, immediate: true })

async function renderChart(): Promise<void> {
  await nextTick()
  if (!canvas.value) {
    return
  }
  const accent = cssColor('--primary', '#3B6BF0')
  renderLineChart(canvas.value, props.chart.values, {
    color: accent,
    fill: `${accent}22`,
    labels: props.chart.labels,
    formatValue: (value) => formatMoneyForCurrency(value, props.currency),
    formatAxisValue: (value) => formatCompactMoneyForCurrency(value, props.currency),
    includeZeroBaseline: false,
    yPaddingRatio: 0.12,
  })
}

function cssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function netWorthChangeClass(tone: DashboardTone | undefined): string {
  if (tone === 'good') {
    return 'bg-(--income-bg) text-good text-(--income)'
  }
  if (tone === 'bad') {
    return 'bg-(--expense-bg) text-bad text-(--expense)'
  }
  return 'bg-(--bg-subtle) text-(--text-faint)'
}
</script>

<template>
  <section
    class="flex flex-col justify-between lg:flex-row lg:items-center rounded-lg bg-(--bg-panel) [box-shadow:var(--shadow-soft)] gap-8 p-8"
    aria-label="Patrimonio neto"
  >
    <div class="flex flex-col gap-2.5 shrink-0">
      <p
        class="inline-flex items-center gap-1.5 text-lg font-semibold text-(--text-muted)"
      >
        Patrimonio neto
        <InfoIcon />
      </p>
      <strong
        id="kpi-net-worth"
        class="text-6xl font-bold text-(--text-main)"
      >
        {{ kpis?.netWorth ?? '0,00 €' }}
      </strong>
      <p class="flex flex-wrap items-center gap-2.5">
        <span
          id="kpi-net-worth-change"
          class="kpi-networth-change rounded-full px-2.25 py-0.75 font-['DM_Mono',monospace] text-[0.875rem] font-medium tabular-nums"
          :class="netWorthChangeClass(kpis?.netWorthChange.tone)"
        >
          {{ kpis?.netWorthChange.label ?? '--' }}
        </span>
        <span class="text-[0.88rem] text-(--text-muted)">vs. año anterior</span>
      </p>
      <p class="text-[0.9rem] text-(--text-muted)">
        Ahorro anual:
        <strong id="kpi-annual-savings" class="font-bold text-(--primary) tabular-nums">
          {{ kpis?.annualSavings ?? '0,00 €' }}
        </strong>
      </p>
    </div>

    <div class="grid gap-2 flex-1 min-w-0 max-w-4xl">
      <div
        class="gap-0.5 justify-self-end rounded-full bg-(--bg-subtle) p-0.75"
        role="group"
        aria-label="Rango temporal del gráfico"
      >
        <button
          v-for="range in ranges"
          :key="range.value"
          type="button"
          class="rounded-full! text-xs! p-2! px-3! min-h-auto! font-bold text-(--text-muted) hover:text-(--text-main) [&.is-active]:bg-(--bg-panel) [&.is-active]:text-(--primary) [&.is-active]:[box-shadow:var(--shadow-soft)]"
          :class="{ 'is-active': range.active }"
          :data-range="range.value"
          @click="emit('change-range', range.value)"
        >
          {{ range.label }}
        </button>
      </div>
      <div class="relative h-64 w-full">
        <span
          id="networth-endpoint"
          class="absolute top-1 right-1 z-2 rounded-full border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-(--primary-light) px-2.25 py-1 font-['DM_Mono',monospace] text-[0.74rem] font-medium text-(--primary) tabular-nums"
          aria-hidden="true"
        >
          {{ chart.endpoint }}
        </span>
        <canvas
          id="chart-networth"
          ref="canvas"
          class="absolute inset-0 h-full! w-full!"
          aria-label="Evolución de patrimonio neto"
        ></canvas>
      </div>
    </div>
  </section>
</template>
