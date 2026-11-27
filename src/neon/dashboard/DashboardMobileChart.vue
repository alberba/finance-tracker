<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'

import NeonChartSeries from '../ui/NeonChartSeries.vue'
import { CHART_HEIGHT, CHART_WIDTH } from '../ui/line-chart'
import { nearestPoint, useChartScrub } from '../ui/chart-scrub'
import { spreadLabels, type MobileLine } from './mobile-chart'

// A chart of the mobile home (DESIGN.md, «Inicio en móvil»): edge to edge, no
// gridlines and no values beside it, four labels on the axis and today's dot.
// The first line is the main one, with the area under it; the others are
// dashed references (last month, what was put in). It is read with a held
// finger, the mouse or the arrows: `active` is the point being read, null at
// rest, and the slide shows that point's figures. A quick swipe still moves
// the carousel, for the hold only starts after a moment without moving.
const props = withDefaults(
  defineProps<{
    lines: MobileLine[]
    /** Where the main area closes (share of the height); the bottom by default. */
    baseTop?: number | null
    /** One per slot of the x axis; four of them are shown. */
    labels: readonly string[]
    /** What the readout under the cursor says for each point of the main line. */
    names: readonly string[]
    /** What the chart shows, for screen readers. */
    label: string
    /** What a screen reader hears for each point of the main line. */
    valueTexts: readonly string[]
    tone?: 'accent' | 'lilac'
    /** A name written at the end of a line, by index of `lines`, so no legend is needed. */
    ends?: ReadonlyArray<string | null>
  }>(),
  { baseTop: null, tone: 'accent', ends: () => [] },
)
const active = defineModel<number | null>('active', { default: null })

const color = computed(() =>
  props.tone === 'lilac' ? 'var(--color-lilac)' : 'var(--color-accent-bright)',
)
const main = computed(() => props.lines[0]?.points ?? [])
const last = computed(() => main.value.length - 1)
const current = computed(() => active.value ?? last.value)

const toPath = (points: MobileLine['points']) =>
  points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'}${(point.x / 100) * CHART_WIDTH} ${(point.top / 100) * CHART_HEIGHT}`,
    )
    .join(' ')
const paths = computed(() =>
  props.lines.map((line) => ({ d: toPath(line.points), dashed: line.dashed })),
)
const area = computed(() => {
  const points = main.value
  if (points.length < 2) return ''
  const base = ((props.baseTop ?? 100) / 100) * CHART_HEIGHT
  const end = (points[points.length - 1]!.x / 100) * CHART_WIDTH
  const start = (points[0]!.x / 100) * CHART_WIDTH
  return `${toPath(points)} L${end} ${base} L${start} ${base} Z`
})

const axis = computed(() => {
  const count = props.labels.length
  return spreadLabels(count).map((index) => ({
    text: props.labels[index]!,
    x: (index / Math.max(count - 1, 1)) * 100,
    edge: index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle',
  }))
})
/** The readout leans in near the edges so it never leaves the slide. */
function lean(x: number): string {
  return x < 12 ? '0%' : x > 88 ? '-100%' : '-50%'
}
const reading = computed(() => {
  if (active.value === null) return null
  const point = main.value[active.value]
  return point ? { x: point.x, name: props.names[active.value] ?? '' } : null
})
const endNotes = computed(() =>
  props.lines.flatMap((line, index) => {
    const text = props.ends[index]
    const point = line.points[line.points.length - 1]
    // Above its line, unless the main line ends higher: then below, clear of today's dot.
    const today = main.value[main.value.length - 1]
    const below = index > 0 && today !== undefined && point !== undefined && point.top >= today.top
    return text && point ? [{ text, below, ...point }] : []
  }),
)
const cursors = computed(() =>
  active.value === null
    ? []
    : props.lines
        .map((line) => line.points[active.value!])
        .filter((point): point is MobileLine['points'][number] => Boolean(point)),
)

const plot = useTemplateRef<HTMLElement>('plot')
const svg = useTemplateRef<SVGSVGElement>('svg')
const positions = () => main.value.map((point) => point.x)
const { index: held } = useChartScrub(plot, svg, positions, () => {})
watch(held, (index) => {
  active.value = index
})

function hover(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return
  const rect = svg.value?.getBoundingClientRect()
  if (!rect?.width) return
  const found = nearestPoint(positions(), ((event.clientX - rect.left) / rect.width) * 100)
  active.value = found < 0 ? null : found
}

function leave(event: PointerEvent): void {
  if (event.pointerType === 'mouse') active.value = null
}

function step(event: KeyboardEvent): void {
  const moves: Record<string, number> = {
    ArrowLeft: current.value - 1,
    ArrowRight: current.value + 1,
    Home: 0,
    End: last.value,
  }
  if (event.key === 'Escape') {
    active.value = null
    return
  }
  if (!(event.key in moves)) return
  event.preventDefault()
  active.value = Math.min(Math.max(moves[event.key]!, 0), last.value)
}
</script>

<template>
  <figure class="m-0 flex w-full flex-col gap-1.5 px-4" :style="{ '--chart-series': color }">
    <div
      ref="plot"
      class="outline-accent relative h-40 cursor-crosshair rounded-xs select-none focus-visible:outline-2 focus-visible:outline-offset-4"
      tabindex="0"
      role="slider"
      :aria-label="`${label}. Flechas izquierda y derecha para recorrer los valores.`"
      aria-valuemin="0"
      :aria-valuemax="Math.max(last, 0)"
      :aria-valuenow="current"
      :aria-valuetext="valueTexts[current]"
      @pointermove="hover"
      @pointerleave="leave"
      @keydown="step"
      @blur="active = null"
    >
      <svg
        ref="svg"
        :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
        preserveAspectRatio="none"
        aria-hidden="true"
        class="motion-safe:animate-draw absolute inset-0 size-full overflow-visible"
      >
        <path
          v-for="(path, index) in paths.slice(1)"
          :key="index"
          :d="path.d"
          fill="none"
          stroke="var(--color-faint)"
          stroke-width="1.5"
          stroke-dasharray="4 4"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
        <NeonChartSeries :line="paths[0]?.d ?? ''" :area="area" :color="color" />
      </svg>
      <span
        v-if="active === null && main.length"
        class="border-bg motion-safe:animate-dot pointer-events-none absolute size-3.5 -translate-1/2 rounded-full border-2 bg-(--chart-series)"
        :style="{ insetInlineStart: `${main[last]!.x}%`, top: `${main[last]!.top}%` }"
        aria-hidden="true"
      />
      <span
        v-for="note in endNotes"
        v-show="!reading"
        :key="note.text"
        class="text-muted pointer-events-none absolute -translate-x-full text-xs font-semibold whitespace-nowrap"
        :class="note.below ? 'translate-y-1.5' : '-translate-y-[calc(100%+6px)]'"
        :style="{ insetInlineStart: `${note.x}%`, top: `${note.top}%` }"
        aria-hidden="true"
        >{{ note.text }}</span
      >
      <template v-if="reading">
        <span
          class="bg-ctrl-line pointer-events-none absolute inset-y-0 w-px"
          :style="{ insetInlineStart: `${reading.x}%` }"
          aria-hidden="true"
        />
        <span
          v-for="(point, index) in cursors"
          :key="index"
          class="border-bg pointer-events-none absolute size-3.5 -translate-1/2 rounded-full border-2"
          :class="index === 0 ? 'bg-(--chart-series)' : 'bg-faint'"
          :style="{ insetInlineStart: `${point.x}%`, top: `${point.top}%` }"
          aria-hidden="true"
        />
      </template>
    </div>
    <div class="text-muted relative h-5 text-xs font-semibold" aria-hidden="true">
      <span
        v-for="tick in axis"
        :key="tick.x"
        class="absolute top-0.5 leading-4 whitespace-nowrap"
        :class="reading && Math.abs(tick.x - reading.x) < 16 && 'opacity-0'"
        :style="{
          insetInlineStart: `${tick.x}%`,
          translate: tick.edge === 'start' ? '0' : tick.edge === 'end' ? '-100%' : '-50%',
        }"
        >{{ tick.text }}</span
      >
      <span
        v-if="reading"
        class="text-text bg-panel2 border-line rounded-pill absolute top-0 border px-2.5 leading-[18px] font-extrabold whitespace-nowrap"
        :style="{ insetInlineStart: `${reading.x}%`, translate: `${lean(reading.x)} 0` }"
        data-chart-readout
        >{{ reading.name }}</span
      >
    </div>
  </figure>
</template>
