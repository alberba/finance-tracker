<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'

import NeonChartSeries from './NeonChartSeries.vue'
import { nearestPoint, useChartScrub } from './chart-scrub'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  chartPaths,
  frameMap,
  reframe as reframeLine,
  type LabelledLineChart,
} from './line-chart'

// Evolution chart (DESIGN.md, Gráfico de evolución): the line with the area
// fading under it, round gridlines with their value at the end, the months
// below and a dot on today's value. `tone` picks the series color: the lamp
// for net worth, lilac for the portfolio.
const props = defineProps<{
  chart: LabelledLineChart
  tone?: 'accent' | 'lilac'
  /** Which side the value column sits on: the right (default) or the left. */
  axis?: 'start' | 'end'
  /**
   * The chart is one series seen over a range that ends today: a new range
   * reframes the line (DESIGN.md, «Cambio de periodo») instead of redrawing it.
   */
  reframe?: boolean
  /** The resting point when the caller lets the user select one. */
  selected?: number
  /** On touch, a hold explores the chart without taking over vertical scroll. */
  holdToExplore?: boolean
  /** On narrow charts, let the caller supply shorter amounts and a smaller gutter. */
  compact?: boolean
}>()
const emit = defineEmits<{ select: [index: number] }>()

// Reframing: the line travels from the old frame to the new one in REFRAME_MS,
// a frame at a time; the gridlines, the months and today's dot follow by CSS
// with the same duration and curve. While it travels the plot clips at its
// sides, as months leave by the left.
const REFRAME_MS = 700
const shown = shallowRef({ line: props.chart.line, area: props.chart.area })
const travelling = shallowRef(false)
let frame = 0

function ease(progress: number): number {
  // cubic-bezier(0.23, 1, 0.32, 1), close enough: a quint ease-out.
  return 1 - (1 - progress) ** 5
}

watch(
  () => props.chart,
  (next, previous) => {
    cancelAnimationFrame(frame)
    const settle = () => {
      travelling.value = false
      shown.value = { line: next.line, area: next.area }
    }
    const path =
      props.reframe &&
      previous?.line &&
      next.line &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
        ? reframeLine(previous.points, next.points)
        : null
    if (!path) return settle()
    // What the gridlines and months that come or go need to travel with the line.
    travel = {
      map: frameMap(previous!.points, next.points)!,
      fromCount: previous!.labels.length,
      toCount: next.labels.length,
    }
    const start = performance.now()
    travelling.value = true
    const step = (now: number) => {
      const progress = Math.min((now - start) / REFRAME_MS, 1)
      if (progress >= 1) return settle()
      shown.value = chartPaths(path(ease(progress)))
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  },
)
onBeforeUnmount(() => cancelAnimationFrame(frame))

// A gridline or a month that only one of the frames has comes in from, or
// leaves to, where it would sit in the other frame, fading as it goes; the
// ones both frames have glide by CSS. `back` is a month's place from today.
let travel: {
  map: { scale: number; shift: number }
  fromCount: number
  toCount: number
} | null = null
const GLIDE = { duration: REFRAME_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
const monthAt = (back: number, count: number) => `${100 - (back / Math.max(count - 1, 1)) * 100}%`

function axisEnter(element: Element, done: () => void): void {
  const el = element as HTMLElement
  if (!travelling.value || !travel) return done()
  const back = Number(el.dataset.back)
  const keyframes: Keyframe[] = Number.isNaN(back)
    ? [{ top: `${(parseFloat(el.style.top) - travel.map.shift) / travel.map.scale}%` }, {}]
    : [{ insetInlineStart: monthAt(back, travel.fromCount) }, {}]
  keyframes[0].opacity = 0
  el.animate(keyframes, GLIDE).onfinish = done
}

function axisLeave(element: Element, done: () => void): void {
  const el = element as HTMLElement
  if (!travelling.value || !travel) return done()
  const back = Number(el.dataset.back)
  const keyframes: Keyframe[] = Number.isNaN(back)
    ? [{}, { top: `${parseFloat(el.style.top) * travel.map.scale + travel.map.shift}%` }]
    : [{}, { insetInlineStart: monthAt(back, travel.toCount) }]
  keyframes[1].opacity = 0
  el.animate(keyframes, { ...GLIDE, fill: 'forwards' }).onfinish = done
}

const color = computed(() =>
  props.tone === 'lilac' ? 'var(--color-lilac)' : 'var(--color-accent-bright)',
)

// Exploring the chart (DESIGN.md, «Recorrido»): the pointer or a finger over
// the plot reads the point nearest to it, and the arrow keys do the same from
// the keyboard. At rest only today's dot shows; leaving the plot clears it.
// The plot is a slider (the point being read is its value) so a screen reader
// announces each step; the column on the right for the gridline values is one
// CSS length (`--chart-gutter`, in rem so it grows with the text, and wide enough
// for the longest value) that the line, the dots and the axis share.
const svg = useTemplateRef<SVGSVGElement>('svg')
const plot = useTemplateRef<HTMLElement>('plot')
/** The point being read, or null at rest: the card follows it, swapping its figure for that value. */
const active = defineModel<number | null>('active', { default: null })
const reading = computed(() =>
  active.value === null ? null : (props.chart.readings[active.value] ?? null),
)
const lastIndex = computed(() => props.chart.points.length - 1)
const lastOpen = computed(() => props.chart.readings[lastIndex.value]?.open)
const tail = computed(() => lastOpen.value && !travelling.value ? chartPaths(props.chart.points.slice(-2)).line : '')
const solidLine = computed(() => tail.value ? chartPaths(props.chart.points.slice(0, -1)).line : shown.value.line)
const current = computed(() => active.value ?? props.selected ?? lastIndex.value)
const marker = computed(() =>
  active.value === null && current.value === lastIndex.value ? null : props.chart.points[current.value],
)
/** Room for the longest gridline value plus a gap, so the last dot never lands on it. */
const gutter = computed(() => {
  const longest = Math.max(0, ...props.chart.tickLabels.map((label) => label.length))
  return `${Math.max(props.compact ? 2.5 : 3.5, longest * 0.42 + 0.75).toFixed(2)}rem`
})
// What a screen reader hears for the current point: its date and its value.
const valueText = computed(() => {
  const read = props.chart.readings[current.value]
  return read ? `${read.name}: ${read.value}${read.note ? `, ${read.note}` : ''}` : ''
})

/** Leans the date in near the edges so it never leaves the card. */
function lean(x: number): string {
  return x < 10 ? '0%' : x > 90 ? '-100%' : '-50%'
}
// Where the plot begins: after the value column when that one is on the left.
const plotStart = computed(() => (props.axis === 'start' ? 'var(--chart-gutter)' : '0px'))
const at = (x: number) => `calc(var(--plot-start) + (100% - var(--chart-gutter)) * ${x / 100})`
/** Where a month label sits: under its point (evenly spread when the counts differ). */
function labelX(index: number): number {
  const points = props.chart.points
  const labels = props.chart.labels
  if (points.length === labels.length) return points[index].x
  return labels.length > 1 ? (index / (labels.length - 1)) * 100 : 0
}

/** Whether a narrow plot drops this label: every other one counting back from today,
 *  keeping «inicio» and dropping the month right after it, which would sit on top. */
const axisLabels = computed(() => {
  const labels = props.chart.labels
  const entries = labels.map((label, index) => ({ label, index }))
  if (labels.length <= 13) return entries
  const last = labels.length - 1
  const step = Math.ceil(last / 4)
  return entries.filter(({ index }) => (last - index) % step === 0)
})

function thinned(index: number): boolean {
  const labels = props.chart.labels
  if (labels[0] === 'inicio')
    return index === 1 || (index > 1 && (labels.length - 1 - index) % 2 === 1)
  return (labels.length - 1 - index) % 2 === 1
}

function nearest(clientX: number): number | null {
  const rect = svg.value?.getBoundingClientRect()
  if (!rect || !positions.value.length) return null
  const percent = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100
  return nearestPoint(positions.value, percent)
}

const positions = computed(() => props.chart.points.map((point) => point.x))
const touchHost = computed(() => props.holdToExplore ? plot.value : null)
const { index: scrubbed } = useChartScrub(touchHost, svg, () => positions.value, (index) => {
  if (props.selected !== undefined) emit('select', index)
})
watch(scrubbed, (index) => { active.value = index })

function explore(event: PointerEvent): void {
  if (props.holdToExplore && event.pointerType === 'touch') return
  active.value = nearest(event.clientX)
}

function release(event: PointerEvent): void {
  if (event.pointerType === 'touch' && props.holdToExplore) return
  if (props.selected !== undefined && event.button === 0) {
    const index = nearest(event.clientX)
    if (index !== null) emit('select', index)
  }
  if (event.pointerType === 'touch') leave()
}

function leave(): void {
  active.value = null
}

function step(event: KeyboardEvent): void {
  const last = lastIndex.value
  if (last < 0) return
  // As any slider: left/down step back, right/up forward, the page keys jump three.
  const moves: Record<string, number> = {
    ArrowLeft: current.value - 1,
    ArrowDown: current.value - 1,
    ArrowRight: current.value + 1,
    ArrowUp: current.value + 1,
    PageDown: current.value - 3,
    PageUp: current.value + 3,
    Home: 0,
    End: last,
  }
  const next = event.key in moves ? Math.min(Math.max(moves[event.key], 0), last) : null
  if (event.key === 'Escape') {
    active.value = null
    return
  }
  if (props.selected !== undefined && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    emit('select', current.value)
    return
  }
  if (next === null) return
  event.preventDefault()
  active.value = next
}
</script>

<template>
  <figure
    class="@container/chart m-0 flex min-h-32 flex-1 flex-col gap-2"
    :class="reframe && 'chart-reframe'"
    :style="{ '--chart-gutter': gutter, '--plot-start': plotStart, '--chart-series': color }"
  >
    <div
      ref="plot"
      class="outline-accent relative min-h-28 flex-1 cursor-crosshair touch-pan-y rounded-xs select-none focus-visible:outline-2 focus-visible:outline-offset-4"
      :class="travelling && 'overflow-y-clip'"
      tabindex="0"
      role="slider"
      :aria-label="`${chart.label}. Flechas izquierda y derecha para recorrer los valores.${selected === undefined ? '' : ' Pulsa Intro para seleccionar el mes.'}`"
      aria-valuemin="0"
      :aria-valuemax="Math.max(lastIndex, 0)"
      :aria-valuenow="current"
      :aria-valuetext="valueText"
      @pointermove="explore"
      @pointerdown="explore"
      @pointerleave="leave"
      @pointercancel="leave"
      @pointerup="release"
      @keydown="step"
      @blur="leave"
    >
      <!-- The value axis: a hairline per round value across the plot only, stopping
           where the line does, and its figure in the column to the right, centered on
           the hairline's height, so no rule runs through or under the numbers. -->
      <TransitionGroup :css="false" @enter="axisEnter" @leave="axisLeave">
        <div
          v-for="(tick, index) in chart.ticks"
          :key="tick.value"
          class="chart-glide absolute inset-x-0 h-0"
          :style="{ top: `${tick.top}%` }"
          aria-hidden="true"
        >
          <span
            class="border-ctrl-line absolute inset-s-(--plot-start) top-0 w-[calc(100%-var(--chart-gutter))] border-t"
          />
          <span
            class="text-muted absolute top-0 -translate-y-1/2 text-xs leading-none font-semibold whitespace-nowrap tabular-nums"
            :class="
              axis === 'start'
                ? 'inset-s-0 w-(--chart-gutter) pe-3 text-end'
                : 'inset-s-[calc(100%-var(--chart-gutter))] ps-3'
            "
          >
            {{ chart.tickLabels[index] }}
          </span>
        </div>
      </TransitionGroup>
      <svg
        ref="svg"
        :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
        preserveAspectRatio="none"
        aria-hidden="true"
        class="motion-safe:animate-draw absolute inset-y-0 inset-s-(--plot-start) h-full w-[calc(100%-var(--chart-gutter))] overflow-visible"
        :class="travelling && '[clip-path:inset(-10%_-2px_-10%_0)]'"
      >
        <NeonChartSeries :line="solidLine" :area="shown.area" :tail="tail" :color="color" />
      </svg>
      <span
        v-if="chart.line"
        v-show="!marker"
        class="ring-panel motion-safe:animate-dot chart-glide absolute -ms-1.5 -mt-1.5 size-3 rounded-full ring-3"
        :class="lastOpen ? 'border-(--chart-series) bg-panel border-2' : 'bg-(--chart-series)'"
        :style="{ insetInlineStart: at(100), top: `${chart.lastTop}%` }"
        aria-hidden="true"
      />
      <span
        v-if="marker || selected !== undefined"
        class="pointer-events-none absolute inset-y-0"
        :class="selected === undefined ? 'bg-ctrl-line w-px' : 'border-faint/60 border-s border-dashed'"
        :style="{ insetInlineStart: at(marker?.x ?? 100) }"
        aria-hidden="true"
      />
      <template v-if="marker">
        <span
          class="ring-panel pointer-events-none absolute -ms-1.5 -mt-1.5 size-3 rounded-full ring-3"
          :class="chart.readings[current]?.open ? 'border-(--chart-series) bg-panel border-2' : 'bg-(--chart-series)'"
          :style="{
            insetInlineStart: at(marker.x),
            top: `${marker.top}%`,
          }"
          aria-hidden="true"
        />
      </template>
    </div>
    <div
      class="text-muted relative h-4 overflow-x-clip text-xs font-semibold"
      :class="axis === 'start' ? 'ms-(--chart-gutter)' : 'me-(--chart-gutter)'"
      aria-hidden="true"
    >
      <TransitionGroup :css="false" @enter="axisEnter" @leave="axisLeave">
        <span
          v-for="{ label, index } in axisLabels"
          :key="reframe ? label : index"
          :data-back="chart.labels.length - 1 - index"
          class="chart-label absolute top-0 leading-4 whitespace-nowrap"
          :class="[
            reading && marker && Math.abs(labelX(index) - marker.x) < 12 && 'opacity-0',
            // Narrow plot: every other month, counting back from today, so they keep air.
            chart.labels.length <= 13 &&
              thinned(index) &&
              (chart.labels.length > 11
                ? '@max-[40rem]/chart:hidden'
                : '@max-[26rem]/chart:hidden'),
          ]"
          :style="{ insetInlineStart: `${labelX(index)}%`, translate: `${lean(labelX(index))} 0` }"
          >{{ label }}</span
        >
      </TransitionGroup>
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

<style scoped>
/* The month labels hide quickly under the readout; on a new range they, the
   gridlines and today's dot glide with the line (REFRAME_MS, same curve). */
.chart-label {
  transition: opacity 160ms ease-out;
}

@media (prefers-reduced-motion: no-preference) {
  .chart-reframe .chart-label {
    transition:
      opacity 160ms ease-out,
      inset-inline-start 700ms cubic-bezier(0.23, 1, 0.32, 1),
      translate 700ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .chart-reframe .chart-glide {
    transition: top 700ms cubic-bezier(0.23, 1, 0.32, 1);
  }
}
</style>
