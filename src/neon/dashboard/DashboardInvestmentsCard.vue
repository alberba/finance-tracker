<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import NeonLineChart from '../ui/NeonLineChart.vue'
import { useQuotesNote } from './quotes-note'
import type { ChartSide } from './layout/engine'
import type { NeonDashboardViewModel } from './view-model'

// Inversiones: what the portfolio is worth, against what was put in, what it is
// made of and how its value went over the range picked in the header. Laid out
// as Patrimonio (DESIGN.md, «Patrimonio en el inicio de escritorio»): the figure
// and its baseline on the left, the evolution beside them. Quotes are never
// shown as real time: the note beside the title says when they were taken, or
// that they are late.
const props = defineProps<{
  investments: NeonDashboardViewModel['investments']
  /** Which side of the figures the chart goes on (the home's layout, edited per widget). */
  chartSide?: ChartSide
}>()
// With the chart first, the figures' column moves to the right and the chart
// keeps clear of the title row (it only rises into it when it is on the right).
const chartFirst = computed(() => props.chartSide !== 'end')

const quotes = useQuotesNote()
const hovered = shallowRef<number | null>(null)
// The figure follows the point being read on the chart.
const figure = computed(() =>
  hovered.value !== null
    ? (props.investments.chart.readings[hovered.value]?.value ?? props.investments.value)
    : props.investments.value,
)

// Positions in hues that tell apart at a glance (lilac, peach, deep violet, sand);
// «Otros» is always the neutral grey, so it never reads as a holding.
const SWATCHES = ['bg-lilac', 'bg-peach', 'bg-lilac3', 'bg-soft'] as const
function swatch(name: string, index: number): string {
  return name === 'Otros' ? 'bg-neutral-bar' : SWATCHES[index % SWATCHES.length]
}
/** The tooltip leans in at the ends of the bar so it never leaves the card. */
function lean(index: number): string {
  const last = props.investments.positions.length - 1
  return index === 0 ? 'start-0' : index === last ? 'end-0' : 'start-1/2 -translate-x-1/2'
}

const TONE_PILL = {
  gain: 'text-gain bg-gain/12',
  loss: 'text-loss bg-loss/12',
  neutral: 'text-text bg-text/8',
} as const
// The gain and what was put in are today's: while another point is read they
// step back so they are not taken for that point's.
const FADE = 'motion-safe:transition-opacity motion-safe:duration-160'
</script>

<template>
  <NeonCard title="Inversiones" title-id="dashboard-investments-title" data-dashboard-investments>
    <template v-if="quotes && !investments.empty" #badge>
      <span class="text-meta" :class="quotes.late ? 'text-soft' : 'text-muted'">
        {{ quotes.short }}
      </span>
    </template>
    <NeonEmptyState v-if="investments.empty">
      Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
    </NeonEmptyState>
    <div v-else class="flex min-h-0 flex-1">
      <div
        class="flex min-w-0 flex-1 flex-col gap-4 @xl:gap-7"
        :class="chartFirst ? '@xl:flex-row-reverse' : '@xl:flex-row'"
      >
        <!-- Flush with the card title on the left, bottom-aligned with the plot (the pb
             is the month row under it). -->
        <div
          class="flex flex-col gap-4 @xl:w-[clamp(16rem,36cqi,21rem)] @xl:shrink-0 @xl:justify-end @xl:pb-6"
          :class="chartFirst ? '@xl:items-end @xl:ps-8 @xl:text-right' : '@xl:pe-8'"
        >
          <NeonFigure
            :value="figure"
            class="text-text text-[clamp(38px,3.9cqi,50px)] font-semibold"
          />
          <div
            v-if="investments.gain"
            class="flex flex-col items-start gap-3"
            :class="[FADE, chartFirst && '@xl:items-end', hovered !== null && 'opacity-40']"
          >
            <span class="text-muted text-note whitespace-nowrap">
              <b
                class="rounded-pill me-1 px-2 py-0.5 font-extrabold"
                :class="TONE_PILL[investments.gain.tone]"
                >{{ investments.gain.text }}</b
              >
              sobre lo aportado
            </span>
            <span v-if="investments.invested" class="text-muted text-note whitespace-nowrap">
              <b class="text-soft font-extrabold tabular-nums">{{ investments.invested }}</b>
              aportados
            </span>
          </div>
          <!-- What the portfolio is made of: one bar, no legend. Each share names
               itself on hover or keyboard focus. -->
          <ul
            v-if="investments.positions.length"
            aria-label="Reparto de la cartera"
            class="group/bar motion-safe:animate-wipe flex h-1.5 w-full gap-0.75"
            style="animation-delay: 220ms"
          >
            <li
              v-for="(position, index) in investments.positions"
              :key="position.name"
              tabindex="0"
              class="group outline-accent first:rounded-s-pill last:rounded-e-pill relative h-full cursor-default group-has-[li:focus-visible]/bar:opacity-35 group-has-[li:hover]/bar:opacity-35 before:absolute before:inset-x-0 before:-inset-y-2.5 hover:opacity-100! focus-visible:opacity-100! focus-visible:outline-2 focus-visible:outline-offset-3 motion-safe:transition-opacity motion-safe:duration-160"
              :class="swatch(position.name, index)"
              :style="{ flex: `${position.weight} 1 0px` }"
            >
              <span class="sr-only">{{ position.name }} {{ position.share }}</span>
              <span
                class="bg-sel-bg text-sel-text text-meta rounded-pill pointer-events-none absolute bottom-full z-10 mb-2.5 hidden px-2.5 py-1 font-extrabold whitespace-nowrap tabular-nums shadow-(--shadow-float) group-hover:block group-focus-visible:block"
                :class="lean(index)"
                aria-hidden="true"
              >
                {{ position.name }} <span class="opacity-65">{{ position.share }}</span>
              </span>
            </li>
          </ul>
        </div>
        <NeonLineChart
          v-if="investments.chart.line"
          v-model:active="hovered"
          :chart="investments.chart"
          :axis="chartFirst ? 'end' : 'start'"
          reframe
          tone="lilac"
          class="@xl:min-w-0 @xl:flex-1"
          :class="!chartFirst && '@xl:-mt-10'"
        />
      </div>
    </div>
  </NeonCard>
</template>
