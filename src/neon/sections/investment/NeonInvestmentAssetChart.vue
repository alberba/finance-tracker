<script setup lang="ts">
import { computed } from 'vue'

import NeonChartSeries from '../../ui/NeonChartSeries.vue'

import type { AssetChart } from './asset-view-model'

// The price of an asset against the operations that were made (#439, #440):
// the line through each operation's price, its area, the average buy price
// dashed, a dot per operation (filled for a buy, hollow for a sale) and the point being read. `hot` is that
// point, null at rest (the newest operation, with no marker of its own). The arrow keys walk it; the
// desktop reads it with the mouse, the `touch` one (mobile) with a finger
// sliding sideways, the page still scrolling up and down, and draws a cursor.
const props = withDefaults(defineProps<{ chart: AssetChart; touch?: boolean }>(), {
  touch: false,
})
const hot = defineModel<number | null>('hot', { required: true })

const points = computed(() => props.chart.points)
const current = computed(() => hot.value ?? points.value.length - 1)
const reading = computed(() => points.value[current.value])

function nearest(event: PointerEvent): number {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const share = ((event.clientX - box.left) / box.width) * 100
  let best = 0
  points.value.forEach((point, index) => {
    if (Math.abs(point.left - share) < Math.abs(points.value[best].left - share)) best = index
  })
  return best
}

function onDown(event: PointerEvent): void {
  if (props.touch) hot.value = nearest(event)
}

function onMove(event: PointerEvent): void {
  if (event.pointerType === 'mouse' || (props.touch && event.buttons)) hot.value = nearest(event)
}

function onKey(event: KeyboardEvent): void {
  const last = points.value.length - 1
  let next: number | null = null
  if (event.key === 'ArrowLeft') next = Math.max(0, current.value - 1)
  else if (event.key === 'ArrowRight') next = Math.min(last, current.value + 1)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = last
  else if (event.key === 'Escape') hot.value = null
  if (next === null) return
  event.preventDefault()
  hot.value = next
}
</script>

<template>
  <div
    class="outline-accent relative min-w-0 focus-visible:outline-2"
    :class="touch ? 'focus-visible:-outline-offset-2' : 'rounded-md focus-visible:outline-offset-4'"
    tabindex="0"
    role="group"
    aria-roledescription="gráfica interactiva"
    aria-label="Gráfica del precio. Flechas izquierda y derecha para recorrer las operaciones, Escape para volver a hoy."
    data-asset-chart
    @keydown="onKey"
    @blur="hot = null"
  >
    <svg
      :viewBox="chart.viewBox"
      width="100%"
      role="img"
      :aria-label="chart.label"
      class="block h-auto overflow-visible"
    >
      <path
        v-if="chart.average"
        :d="chart.average.d"
        fill="none"
        stroke="var(--color-faint)"
        stroke-width="1"
        stroke-dasharray="4 4"
      />
      <!-- Price draws itself (`anim-draw`); the operations light up as it
           reaches the newest (`anim-dot`). -->
      <NeonChartSeries
        class="motion-safe:animate-draw"
        :style="{ animationDuration: '800ms', animationDelay: '60ms' }"
        :line="chart.line"
        :area="chart.area"
      />
      <template v-for="(point, index) in points" :key="index">
        <circle
          class="motion-safe:animate-dot origin-center [transform-box:fill-box]"
          :style="{ animationDelay: '620ms' }"
          :cx="point.x"
          :cy="point.y"
          r="5.5"
          :fill="point.operation === 'sell' ? 'var(--color-bg)' : 'var(--color-text)'"
          stroke="var(--color-text)"
          stroke-width="2"
        />
      </template>
      <circle
        v-if="hot !== null"
        :cx="reading.x"
        :cy="reading.y"
        r="6"
        fill="var(--color-bg)"
        stroke="var(--color-text)"
        stroke-width="2.5"
      />
    </svg>
    <span
      v-if="touch && hot !== null"
      class="bg-ctrl-line pointer-events-none absolute inset-bs-[9%] inset-be-[13%] w-[1.5px] -translate-x-1/2"
      :style="{ insetInlineStart: `${reading.left}%` }"
      aria-hidden="true"
    ></span>
    <span
      v-if="chart.average && !touch"
      class="text-muted pointer-events-none absolute inset-s-2 -translate-y-full pb-1.5 text-xs font-bold"
      :style="{ insetBlockStart: `${chart.average.top}%` }"
      aria-hidden="true"
    >
      Tu precio medio
    </span>
    <span
      v-for="tick in chart.ticks"
      :key="tick.left"
      class="text-muted pointer-events-none absolute inset-bs-[97%] -translate-x-1/2 -translate-y-1/2 text-xs leading-none font-bold"
      :style="{ insetInlineStart: `${tick.left}%` }"
      aria-hidden="true"
    >
      {{ tick.text }}
    </span>
    <div
      class="absolute inset-0 cursor-crosshair"
      :class="touch && 'touch-pan-y select-none'"
      aria-hidden="true"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="touch && (hot = null)"
      @pointercancel="hot = null"
      @pointerleave="hot = null"
    ></div>
  </div>
</template>
