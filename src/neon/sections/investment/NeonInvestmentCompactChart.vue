<script setup lang="ts">
import { computed, useId } from 'vue'

import type { CompactChart } from './view-model'

// The cover's chart on the mobile frame (artboard «Inversión · móvil · Pixel
// 10»): edge to edge and 266 px tall, the portfolio as a thick line over an
// area that fades out, what went in as a dashed one, only the months on the
// axis and today's dot. It is walked with the finger (or the mouse, or the
// arrows): `hot` is the point being looked at, null at rest, with a cursor
// line and the date on the axis; the cover reads it to show that month's
// figures.
const props = defineProps<{ chart: CompactChart; when: string | null }>()
const hot = defineModel<number | null>('hot', { required: true })

const gradientId = `compact-area-${useId()}`
const last = computed(() => props.chart.points.length - 1)
const current = computed(() => hot.value ?? last.value)
const point = computed(() => props.chart.points[current.value])
// The months that would sit under the cursor give way to its date.
const months = computed(() =>
  hot.value === null
    ? props.chart.months
    : props.chart.months.filter((month) => Math.abs(month.left - point.value.left) > 10),
)

function pointAt(event: PointerEvent): number {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const share = ((event.clientX - box.left) / box.width) * 100
  const end = props.chart.points[last.value]?.left || 100
  return Math.max(0, Math.min(last.value, Math.round((share / end) * last.value)))
}

function onDown(event: PointerEvent): void {
  ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  hot.value = pointAt(event)
}

function onMove(event: PointerEvent): void {
  if (event.pointerType === 'mouse' || event.buttons) hot.value = pointAt(event)
}

function onKey(event: KeyboardEvent): void {
  const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
  if (step) hot.value = Math.max(0, Math.min(last.value, current.value + step))
  else if (event.key === 'Home') hot.value = 0
  else if (event.key === 'End') hot.value = last.value
  else if (event.key === 'Escape') hot.value = null
  else return
  event.preventDefault()
}
</script>

<template>
  <figure class="relative m-0 h-[min(266px,32dvh)] min-w-0" data-investment-chart>
    <svg
      :viewBox="chart.viewBox"
      preserveAspectRatio="none"
      role="img"
      :aria-label="chart.label"
      class="absolute inset-0 block size-full overflow-visible"
    >
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--color-accent)" stop-opacity="0.42" />
          <stop offset="0.55" stop-color="var(--color-accent)" stop-opacity="0.14" />
          <stop offset="1" stop-color="var(--color-accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="chart.area" :fill="`url(#${gradientId})`" stroke="none" />
      <path
        v-for="line in chart.lines"
        :key="line.key"
        :d="line.d"
        fill="none"
        :stroke="line.dashed ? 'var(--color-faint)' : 'var(--color-accent)'"
        :stroke-width="line.dashed ? 1 : 2.5"
        :stroke-dasharray="line.dashed ? '4 4' : undefined"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span
      v-if="hot !== null"
      class="bg-muted pointer-events-none absolute inset-bs-10 inset-be-6.5 w-[1.5px] -translate-x-1/2"
      :style="{ insetInlineStart: `${point.left}%` }"
      aria-hidden="true"
    ></span>
    <span
      class="bg-text border-bg pointer-events-none absolute -translate-1/2 rounded-full border-[3px]"
      :class="hot === null ? 'size-[18px]' : 'size-5'"
      :style="{ insetInlineStart: `${point.left}%`, insetBlockStart: `${point.top}%` }"
      aria-hidden="true"
    ></span>
    <span
      v-for="month in months"
      :key="month.left"
      class="text-muted text-label pointer-events-none absolute inset-be-1.5 -translate-x-1/2 leading-none font-bold"
      :style="{ insetInlineStart: `${month.left}%` }"
      aria-hidden="true"
    >
      {{ month.text }}
    </span>
    <span
      v-if="when"
      class="bg-text text-bg text-label rounded-pill pointer-events-none absolute inset-be-[3px] -translate-x-1/2 px-2 py-[3px] font-extrabold whitespace-nowrap"
      :style="{ insetInlineStart: `${Math.max(12, Math.min(88, point.left))}%` }"
      aria-hidden="true"
    >
      {{ when }}
    </span>
    <div
      role="slider"
      tabindex="0"
      aria-label="Recorrer la evolución"
      aria-valuemin="0"
      :aria-valuemax="last"
      :aria-valuenow="current"
      :aria-valuetext="when ?? 'Hoy'"
      class="outline-accent absolute inset-0 cursor-crosshair touch-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="hot = null"
      @pointercancel="hot = null"
      @pointerleave="hot = null"
      @keydown="onKey"
    ></div>
  </figure>
</template>
