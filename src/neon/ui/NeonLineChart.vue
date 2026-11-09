<script setup lang="ts">
import { computed, useId } from 'vue'

import { CHART_HEIGHT, CHART_WIDTH, type LabelledLineChart } from './line-chart'

// Evolution chart (DESIGN.md, Gráfico de evolución): the line with the area
// fading under it, round gridlines with their value at the end, the months
// below and a dot on today's value. `tone` picks the series color: the lamp
// for net worth, lilac for the portfolio.
const props = defineProps<{
  chart: LabelledLineChart
  tone?: 'accent' | 'lilac'
}>()

const color = computed(() =>
  props.tone === 'lilac' ? 'var(--color-lilac)' : 'var(--color-accent)',
)

const gradientId = `chart-area-${useId()}`
</script>

<template>
  <figure class="m-0 flex min-h-48 flex-1 flex-col gap-2">
    <div class="relative min-h-44 flex-1">
      <div
        v-for="(tick, index) in chart.ticks"
        :key="tick.value"
        class="border-grid absolute inset-x-0 border-t"
        :style="{ top: `${tick.top}%` }"
        aria-hidden="true"
      >
        <span class="text-muted absolute inset-e-0 bottom-0.75 text-xs font-semibold">
          {{ chart.tickLabels[index] }}
        </span>
      </div>
      <svg
        :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="chart.label"
        class="absolute inset-y-0 inset-s-0 h-full w-[calc(100%-56px)] overflow-visible"
      >
        <defs>
          <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="color" stop-opacity="0.42" />
            <stop offset="0.55" :stop-color="color" stop-opacity="0.14" />
            <stop offset="1" :stop-color="color" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="chart.area" :fill="`url(#${gradientId})`" stroke="none" />
        <path
          :d="chart.line"
          fill="none"
          :stroke="color"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span
        v-if="chart.line"
        class="ring-panel absolute inset-s-[calc(100%-56px)] -ms-1.5 -mt-1.5 size-3 rounded-full ring-3"
        :class="tone === 'lilac' ? 'bg-lilac' : 'bg-accent'"
        :style="{ top: `${chart.lastTop}%` }"
        aria-hidden="true"
      />
    </div>
    <div class="text-muted me-14 flex justify-between text-xs font-semibold" aria-hidden="true">
      <span v-for="(label, index) in chart.labels" :key="index">{{ label }}</span>
    </div>
  </figure>
</template>
