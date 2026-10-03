<script setup lang="ts">
import { computed } from 'vue'

import ChartCanvas from '../charts/ChartCanvas.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import { INK_TONE_TEXT } from '../ui/tone'
import type {
  DashboardHeroRange,
  DashboardLineChart,
  DashboardNetWorthBand,
  DashboardRangeOption,
} from '../../domain/dashboard/view-model'
import { splitDecimals } from '../../lib/format'
import { renderLineChart } from '../../scripts/charts'
import { resolveCssColor } from '../../scripts/css-color'
import { formatCompactMoneyForCurrency, formatMoneyForCurrency } from '../../scripts/money-format'

// The ink band in two halves: the net worth with its changes on the left and
// its evolution as an area chart, with a range control, on the right.
const props = defineProps<{
  band: DashboardNetWorthBand
  chart: DashboardLineChart
  ranges: DashboardRangeOption[]
  currency: string
}>()

const range = defineModel<DashboardHeroRange>('range', { required: true })

const parts = computed(() => splitDecimals(props.band.value))
// Long figures step down a size so they stay on one line at phone width.
const size = computed(() => {
  const length = props.band.value.replace(/\s/g, '').length
  if (length >= 16) return { whole: 'text-3xl lg:text-4xl', rest: 'text-xl' }
  if (length >= 13) return { whole: 'text-4xl lg:text-5xl', rest: 'text-xl lg:text-2xl' }
  return { whole: 'text-5xl lg:text-6xl', rest: 'text-2xl lg:text-3xl' }
})

const drawChart = computed(() => {
  const { values, labels } = props.chart
  const currency = props.currency
  return (canvas: HTMLCanvasElement) => {
    const line = resolveCssColor('--primary', '#5e8bff', canvas)
    renderLineChart(canvas, values, {
      color: line,
      fill: line,
      fillOpacity: 0.22,
      borderWidth: 2.5,
      axisColor: resolveCssColor('--ink-muted', '#8195b2', canvas),
      gridColor: 'rgba(255, 255, 255, 0.07)',
      pointBorderColor: resolveCssColor('--ink-surface', '#0b1120', canvas),
      labels,
      formatValue: (value) => formatMoneyForCurrency(value, currency),
      formatAxisValue: (value) => formatCompactMoneyForCurrency(value, currency),
      includeZeroBaseline: false,
      yPaddingRatio: 0.12,
    })
  }
})
</script>

<template>
  <section
    class="bg-ink border-ink-line text-ink-text grid overflow-hidden rounded-lg border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"
    aria-labelledby="dashboard-net-worth-title"
    data-net-worth-band
  >
    <div class="flex flex-col justify-between gap-7 px-5 py-6 sm:px-9 sm:py-8">
      <div class="grid gap-3">
        <h3 id="dashboard-net-worth-title" class="text-ink-muted text-[0.9375rem] font-semibold">
          Patrimonio neto
        </h3>
        <p
          id="kpi-net-worth"
          class="font-display leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums"
          :class="size.whole"
        >
          {{ parts.whole }}<span class="text-ink-muted" :class="size.rest">{{ parts.rest }}</span>
        </p>
        <p
          v-if="band.monthChange"
          id="kpi-net-worth-change"
          class="text-ink-muted flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm"
        >
          <span
            class="bg-ink-text/10 font-display rounded-full px-2.5 py-0.5 font-semibold tabular-nums"
            :class="INK_TONE_TEXT[band.monthChange.tone]"
          >
            {{ band.monthChange.share }}
          </span>
          <span class="font-display tabular-nums" :class="INK_TONE_TEXT[band.monthChange.tone]">
            {{ band.monthChange.amount }}
          </span>
          frente a {{ band.monthChange.against }}
        </p>
      </div>
      <dl v-if="band.yearChange" class="border-ink-text/10 grid gap-1 border-t pt-4">
        <dt class="text-ink-muted text-sm">Variación desde enero</dt>
        <dd
          class="font-display text-lg font-medium tabular-nums"
          :class="INK_TONE_TEXT[band.yearChange.tone]"
        >
          {{ band.yearChange.label }}
        </dd>
      </dl>
    </div>

    <figure
      class="border-ink-text/10 m-0 flex min-w-0 flex-col gap-3 border-t px-5 pt-5 pb-6 sm:px-9 lg:border-t-0 lg:pt-8 lg:pr-9 lg:pl-3"
    >
      <figcaption class="text-ink-muted flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>Evolución · <span class="font-display tabular-nums">máx. {{ chart.max }}</span></span>
        <SegmentedControl
          v-model="range"
          :options="ranges"
          label="Rango temporal del gráfico"
          variant="ink"
          data-key="range"
        />
      </figcaption>
      <div class="relative h-52 w-full sm:h-56">
        <ChartCanvas
          id="chart-networth"
          class="absolute inset-0 h-full! w-full!"
          aria-label="Evolución del patrimonio neto"
          :draw="drawChart"
        />
      </div>
    </figure>
  </section>
</template>
