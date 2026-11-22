<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'

import NeonChartSeries from './NeonChartSeries.vue'
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

// Exploring the chart (DESIGN.md, «Recorrido»): the pointer or a finger over
// the plot reads the point nearest to it, and the arrow keys do the same from
// the keyboard. At rest only today's dot shows; leaving the plot clears it.
// The plot is a slider (the point being read is its value) so a screen reader
// announces each step; the column on the right for the gridline values is one
// CSS length (`--chart-gutter`, in rem so it grows with the text, and wide enough
// for the longest value) that the line, the dots and the axis share.
const svg = useTemplateRef<SVGSVGElement>('svg')
/** The point being read, or null at rest: the card follows it, swapping its figure for that value. */
const active = defineModel<number | null>('active', { default: null })
const reading = computed(() =>
  active.value === null ? null : (props.chart.readings[active.value] ?? null),
)
const marker = computed(() => (active.value === null ? null : props.chart.points[active.value]))
const lastIndex = computed(() => props.chart.points.length - 1)
/** Room for the longest gridline value plus a gap, so the last dot never lands on it. */
const gutter = computed(() => {
  const longest = Math.max(0, ...props.chart.tickLabels.map((label) => label.length))
  return `${Math.max(3.5, longest * 0.42 + 0.75).toFixed(2)}rem`
})
const current = computed(() => active.value ?? lastIndex.value)
// What a screen reader hears for the current point: its date and its value.
const valueText = computed(() => {
  const read = props.chart.readings[current.value]
  return read ? `${read.name}: ${read.value}` : ''
})

/** Leans the date in near the edges so it never leaves the card. */
function lean(x: number): string {
  return x < 10 ? '0%' : x > 90 ? '-100%' : '-50%'
}
const at = (x: number) => `calc((100% - var(--chart-gutter)) * ${x / 100})`
/** Where a month label sits: under its point (evenly spread when the counts differ). */
function labelX(index: number): number {
  const points = props.chart.points
  const labels = props.chart.labels
  if (points.length === labels.length) return points[index].x
  return labels.length > 1 ? (index / (labels.length - 1)) * 100 : 0
}

function nearest(clientX: number): number | null {
  const rect = svg.value?.getBoundingClientRect()
  const points = props.chart.points
  if (!rect || !points.length) return null
  const percent = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100
  let best = 0
  points.forEach((point, index) => {
    if (Math.abs(point.x - percent) < Math.abs(points[best].x - percent)) best = index
  })
  return best
}

function explore(event: PointerEvent): void {
  active.value = nearest(event.clientX)
}

function leave(): void {
  active.value = null
}

function step(event: KeyboardEvent): void {
  const last = lastIndex.value
  if (last < 0) return
  const next =
    event.key === 'ArrowLeft'
      ? Math.max(current.value - 1, 0)
      : event.key === 'ArrowRight'
        ? Math.min(current.value + 1, last)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null
  if (event.key === 'Escape') {
    active.value = null
    return
  }
  if (next === null) return
  event.preventDefault()
  active.value = next
}
</script>

<template>
  <figure class="m-0 flex min-h-32 flex-1 flex-col gap-2" :style="{ '--chart-gutter': gutter }">
    <div
      class="outline-accent relative min-h-28 flex-1 cursor-crosshair touch-pan-y rounded-xs select-none focus-visible:outline-2 focus-visible:outline-offset-4"
      tabindex="0"
      role="slider"
      :aria-label="`${chart.label}. Flechas izquierda y derecha para recorrer los valores.`"
      aria-valuemin="0"
      :aria-valuemax="Math.max(lastIndex, 0)"
      :aria-valuenow="current"
      :aria-valuetext="valueText"
      @pointermove="explore"
      @pointerdown="explore"
      @pointerleave="leave"
      @pointercancel="leave"
      @pointerup="(event) => event.pointerType === 'touch' && leave()"
      @keydown="step"
      @blur="leave"
    >
      <!-- The value axis: a hairline per round value across the plot only, stopping
           where the line does, and its figure in the column to the right, centered on
           the hairline's height, so no rule runs through or under the numbers. -->
      <div
        v-for="(tick, index) in chart.ticks"
        :key="tick.value"
        class="absolute inset-x-0 h-0"
        :style="{ top: `${tick.top}%` }"
        aria-hidden="true"
      >
        <span
          class="border-grid absolute inset-s-0 top-0 w-[calc(100%-var(--chart-gutter))] border-t border-dotted"
        />
        <span
          class="text-muted absolute inset-s-[calc(100%-var(--chart-gutter))] top-0 -translate-y-1/2 ps-3 text-xs leading-none font-semibold whitespace-nowrap tabular-nums"
        >
          {{ chart.tickLabels[index] }}
        </span>
      </div>
      <svg
        ref="svg"
        :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
        preserveAspectRatio="none"
        aria-hidden="true"
        class="absolute inset-y-0 inset-s-0 h-full w-[calc(100%-var(--chart-gutter))] overflow-visible"
      >
        <NeonChartSeries :line="chart.line" :area="chart.area" :color="color" />
      </svg>
      <span
        v-if="chart.line && !marker"
        class="ring-panel absolute inset-s-[calc(100%-var(--chart-gutter))] -ms-1.5 -mt-1.5 size-3 rounded-full ring-3"
        :class="tone === 'lilac' ? 'bg-lilac' : 'bg-accent'"
        :style="{ top: `${chart.lastTop}%` }"
        aria-hidden="true"
      />
      <template v-if="marker && reading">
        <span
          class="bg-ctrl-line pointer-events-none absolute inset-y-0 w-px"
          :style="{ insetInlineStart: at(marker.x) }"
          aria-hidden="true"
        />
        <span
          class="ring-panel pointer-events-none absolute -ms-1.5 -mt-1.5 size-3 rounded-full ring-3"
          :class="tone === 'lilac' ? 'bg-lilac' : 'bg-accent'"
          :style="{
            insetInlineStart: at(marker.x),
            top: `${marker.top}%`,
          }"
          aria-hidden="true"
        />
      </template>
    </div>
    <div
      class="text-muted relative me-(--chart-gutter) h-4 text-xs font-semibold"
      aria-hidden="true"
    >
      <span
        v-for="(label, index) in chart.labels"
        :key="index"
        class="absolute top-0 leading-4 whitespace-nowrap motion-safe:transition-opacity motion-safe:duration-160"
        :class="marker && Math.abs(labelX(index) - marker.x) < 12 && 'opacity-0'"
        :style="{ insetInlineStart: `${labelX(index)}%`, translate: `${lean(labelX(index))} 0` }"
        >{{ label }}</span
      >
      <span
        v-if="marker && reading"
        class="text-text bg-panel2 border-line rounded-pill pointer-events-none absolute -top-1 z-10 inline-flex border px-3 py-1 font-extrabold whitespace-nowrap"
        :style="{ insetInlineStart: `${marker.x}%`, translate: `${lean(marker.x)} 0` }"
        data-chart-readout
        >{{ reading.name }}</span
      >
    </div>
  </figure>
</template>
