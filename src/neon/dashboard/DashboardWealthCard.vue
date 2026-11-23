<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import NeonCard from '../ui/NeonCard.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import NeonLineChart from '../ui/NeonLineChart.vue'
import type { ChartSide } from './layout/engine'
import type { NeonDashboardViewModel } from './view-model'

// Patrimonio: today's net worth, its change this month and this year, and its
// evolution over the range picked in the header (DESIGN.md, Gráfico).
const props = defineProps<{
  wealth: NeonDashboardViewModel['wealth']
  /** Which side of the figures the chart goes on (the home's layout, edited per widget). */
  chartSide?: ChartSide
}>()
// With the chart first, the figures' column moves to the right and the chart
// keeps clear of the title row (it only rises into it when it is on the right).
const chartFirst = computed(() => props.chartSide !== 'end')

const hovered = shallowRef<number | null>(null)
// The figure follows the point being read on the chart.
const figure = computed(() =>
  hovered.value !== null
    ? (props.wealth.chart.readings[hovered.value]?.value ?? props.wealth.value)
    : props.wealth.value,
)
const TONE_PILL = {
  gain: 'text-gain bg-gain/12',
  loss: 'text-loss bg-loss/12',
  neutral: 'text-text bg-text/8',
} as const
// The two changes follow the figure: today's at rest, the read month's while
// exploring (against the month before it and against the start of the range).
const monthChange = computed(() => {
  if (hovered.value !== null) return props.wealth.steps[hovered.value]?.month ?? null
  const change = props.wealth.monthChange
  return change && { ...change, label: 'este mes' }
})
const periodChange = computed(() =>
  hovered.value === null
    ? props.wealth.periodChange
    : (props.wealth.steps[hovered.value]?.period ?? null),
)
// While exploring, a point with no change keeps its row's room so nothing moves.
const exploring = computed(() => hovered.value !== null)
</script>

<template>
  <NeonCard title="Patrimonio" title-id="dashboard-wealth-title" data-dashboard-wealth>
    <!-- The figure and its two changes on the left, the evolution beside them: the
         stretch the chart draws is what the changes summarise. In a narrow card the
         chart drops below. -->
    <div class="flex min-h-0 flex-1">
      <div
        class="flex min-w-0 flex-1 flex-col gap-4 @xl:gap-7"
        :class="chartFirst ? '@xl:flex-row-reverse' : '@xl:flex-row'"
      >
        <!-- Flush with the card title on the left, bottom-aligned with the plot (the pb
             is the month row under it). -->
        <div
          class="flex flex-col gap-4 @xl:min-w-[clamp(16rem,36cqi,21rem)] @xl:shrink-0 @xl:justify-end @xl:pb-6"
          :class="chartFirst ? '@xl:items-end @xl:ps-8 @xl:text-right' : '@xl:pe-8'"
        >
          <NeonFigure
            :value="figure"
            class="text-text text-[clamp(38px,3.9cqi,50px)] font-semibold"
          />
          <div class="flex flex-col items-start gap-3" :class="chartFirst && '@xl:items-end'">
            <span
              v-if="monthChange || (exploring && wealth.monthChange)"
              class="text-muted text-note whitespace-nowrap"
              :class="!monthChange && 'invisible'"
            >
              <b
                class="rounded-pill me-1 px-2 py-0.5 font-extrabold"
                :class="TONE_PILL[monthChange?.tone ?? 'neutral']"
                >{{ monthChange?.text ?? '—' }}</b
              >
              {{ monthChange?.label }}
            </span>
            <!-- A new range settles its change in (`anim-swap`); while exploring
                 the change just follows the pointer. -->
            <span
              v-if="periodChange || (exploring && wealth.periodChange)"
              :key="exploring ? 'exploring' : `${periodChange?.text} ${periodChange?.label}`"
              class="text-muted text-note whitespace-nowrap"
              :class="[!periodChange && 'invisible', !exploring && 'motion-safe:animate-swap']"
            >
              <b
                class="rounded-pill me-1 px-2 py-0.5 font-extrabold"
                :class="TONE_PILL[periodChange?.tone ?? 'neutral']"
                >{{ periodChange?.text ?? '—' }}</b
              >
              {{ periodChange?.label }}
            </span>
          </div>
        </div>
        <NeonLineChart
          v-if="wealth.chart.line"
          v-model:active="hovered"
          :chart="wealth.chart"
          :axis="chartFirst ? 'end' : 'start'"
          reframe
          class="@xl:min-w-0 @xl:flex-1"
          :class="!chartFirst && '@xl:-mt-10'"
        />
        <p
          v-else
          class="border-line text-muted text-note m-0 flex flex-1 items-center rounded-[22px] border border-dashed px-6 py-5.5"
        >
          La evolución aparece cuando haya al menos dos meses con patrimonio.
        </p>
      </div>
    </div>
  </NeonCard>
</template>
