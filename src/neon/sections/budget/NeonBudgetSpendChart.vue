<script setup lang="ts">
import { computed } from 'vue'

import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import NeonCents from './NeonCents.vue'
import { chartLabel, deltaText, polyline, type SpendChart } from './month-view-model'

// «Gastado en octubre»: the month's expenses added up day by day, against the
// month before (grey) when the year has one, with today marked on both lines.
const props = defineProps<{ chart: SpendChart; day: number }>()

const { formatMoney } = useMoneyFormatter()

const monthTitle = computed(
  () => `${props.chart.monthName.charAt(0).toUpperCase()}${props.chart.monthName.slice(1)}`,
)
const previousTitle = computed(() => {
  const name = props.chart.previous?.name ?? ''
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`
})
</script>

<template>
  <section
    aria-labelledby="budget-spent-title"
    class="bg-panel border-line grid min-w-0 gap-[18px] rounded-[22px] border px-6 py-[22px]"
  >
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div class="grid min-w-0 gap-1">
        <h2 id="budget-spent-title" class="text-[18px] font-extrabold">
          Gastado en {{ chart.monthName }}
        </h2>
        <span
          class="font-display text-[clamp(34px,3.4cqi,44px)] leading-none font-semibold tracking-[-0.04em]"
        >
          <NeonCents :text="formatMoney(chart.total)" />
        </span>
        <span
          v-if="chart.delta !== null && chart.previous"
          class="text-[14px] font-extrabold"
          :class="chart.delta > 0.005 ? 'text-loss' : 'text-gain'"
        >
          {{ deltaText(chart.delta, chart.previous.name, day) }}
        </span>
      </div>
      <ul class="flex flex-wrap gap-x-5 gap-y-1.5" aria-hidden="true">
        <li class="text-soft inline-flex items-center gap-2 text-[13px] font-bold">
          <span class="bg-accent h-[3px] w-4 rounded-[2px]"></span>{{ monthTitle }}
        </li>
        <li
          v-if="chart.previous"
          class="text-soft inline-flex items-center gap-2 text-[13px] font-bold"
        >
          <span class="bg-neutral-bar h-[3px] w-4 rounded-[2px]"></span>{{ previousTitle }}
        </li>
      </ul>
    </div>
    <div class="grid gap-2">
      <div
        role="img"
        :aria-label="chartLabel(chart, day)"
        class="border-grid relative h-[200px] border-b"
      >
        <span
          class="border-line absolute inset-y-0 border-s border-dashed"
          :style="{ insetInlineStart: `${chart.todayLeft}%` }"
          aria-hidden="true"
        ></span>
        <svg
          viewBox="0 0 300 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          class="absolute inset-0 size-full overflow-visible"
        >
          <polyline
            v-if="chart.previous"
            class="stroke-neutral-bar"
            :points="polyline(chart.previous.points)"
            fill="none"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
          <polyline
            class="stroke-accent"
            :points="polyline(chart.points)"
            fill="none"
            stroke-width="2.5"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <span
          v-if="chart.previousBottom !== null"
          class="border-neutral-bar bg-panel absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2"
          :style="{
            insetInlineStart: `${chart.todayLeft}%`,
            insetBlockEnd: `${chart.previousBottom}%`,
          }"
          aria-hidden="true"
        ></span>
        <span
          v-if="day > 0"
          class="bg-accent ring-panel absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full ring-4"
          :style="{
            insetInlineStart: `${chart.todayLeft}%`,
            insetBlockEnd: `${chart.todayBottom}%`,
          }"
          aria-hidden="true"
        ></span>
      </div>
      <div class="relative h-[18px]" aria-hidden="true">
        <span
          v-for="tick in chart.ticks"
          :key="tick.day"
          class="absolute text-[12px] font-bold"
          :class="[
            tick.today ? 'text-text' : 'text-muted',
            tick.day === 1 ? '' : '-translate-x-1/2',
          ]"
          :style="{ insetInlineStart: `${tick.left}%` }"
        >
          {{ tick.day }}
        </span>
      </div>
    </div>
  </section>
</template>
