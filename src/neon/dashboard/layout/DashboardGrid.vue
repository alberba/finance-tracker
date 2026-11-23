<script setup lang="ts">
import { computed, onBeforeUpdate, onUpdated, useTemplateRef } from 'vue'

import { GRID_COLUMNS, type ChartSide, type LayoutItem } from './engine'
import { WIDGETS, type WidgetId } from './widgets'

// The home's grid (DESIGN.md, «Inicio en escritorio»): six columns of square
// cells; each widget takes its cells through custom properties that only
// the 56rem container turns into columns and rows, so below it the widgets just
// stack in reading order. Editing draws the cells, one more row than is used,
// and puts a layer over each widget with what it takes to edit it: it can be
// dragged, its corner resized, a button takes it off; the widget itself goes
// inert, so nothing in it takes the focus or the click. A widget with a chart
// also gets a button that moves the chart to the other side of its figures.
const props = defineProps<{
  items: LayoutItem[]
  editing: boolean
  activeId: WidgetId | null
}>()
const emit = defineEmits<{
  moveStart: [item: LayoutItem, event: PointerEvent]
  resizeStart: [item: LayoutItem, event: PointerEvent]
  widgetKey: [item: LayoutItem, event: KeyboardEvent]
  remove: [id: WidgetId]
  chart: [id: WidgetId, side: ChartSide]
}>()

const grid = useTemplateRef<HTMLElement>('grid')
defineExpose({ element: grid })

// When the layout changes (a widget dragged, resized or taken off) the others
// slide to their new cells instead of jumping (DESIGN.md, «Inicio en
// escritorio»): each one is measured before the change and, after it, moved
// back to where it was and let go. A widget whose size changed just takes its
// new box. Offsets, not client rects: they ignore the frame's zoom.
const SLIDE = { duration: 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
const before = new Map<string, { left: number; top: number; width: number; height: number }>()

function widgets(): HTMLElement[] {
  return Array.from(grid.value?.querySelectorAll<HTMLElement>(':scope > [data-widget]') ?? [])
}

function box(widget: HTMLElement) {
  return {
    left: widget.offsetLeft,
    top: widget.offsetTop,
    width: widget.offsetWidth,
    height: widget.offsetHeight,
  }
}

onBeforeUpdate(() => {
  before.clear()
  for (const widget of widgets()) before.set(widget.dataset.widget ?? '', box(widget))
})

onUpdated(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const widget of widgets()) {
    const was = before.get(widget.dataset.widget ?? '')
    if (!was) continue
    const now = box(widget)
    const dx = was.left - now.left
    const dy = was.top - now.top
    if ((!dx && !dy) || was.width !== now.width || was.height !== now.height) continue
    widget.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], SLIDE)
  }
})

const rows = computed(() => props.items.reduce((max, item) => Math.max(max, item.row + item.h), 0))
// While editing there is always an empty row to drag into.
const shownRows = computed(() => Math.max(rows.value + (props.editing ? 1 : 0), 1))

const WIDGET =
  'relative min-h-0 motion-safe:animate-rise @4xl:[grid-column:var(--c)_/_span_var(--w)] @4xl:[grid-row:var(--r)_/_span_var(--h)]'

function cell(item: LayoutItem, index: number) {
  return {
    '--c': item.col + 1,
    '--r': item.row + 1,
    '--w': item.w,
    '--h': item.h,
    animationDelay: `${index * 70}ms`,
  }
}
</script>

<template>
  <div
    ref="grid"
    class="relative grid grid-cols-1 gap-5 [--cell:calc((100cqw-5*1.25rem)/6)] @4xl:[grid-auto-rows:var(--cell)] @4xl:grid-cols-6"
    :class="editing && '@4xl:[grid-template-rows:repeat(var(--rows),var(--cell))]'"
    :style="{ '--rows': shownRows }"
    data-dashboard-grid
  >
    <div
      v-if="editing"
      class="pointer-events-none absolute inset-0 hidden gap-5 @4xl:grid @4xl:[grid-auto-rows:var(--cell)] @4xl:grid-cols-6"
      aria-hidden="true"
    >
      <span
        v-for="n in shownRows * GRID_COLUMNS"
        :key="n"
        class="border-line rounded-card border border-dashed"
      />
    </div>

    <div
      v-for="(item, index) in items"
      :key="item.id"
      :class="[WIDGET, editing && activeId === item.id && 'z-20']"
      :style="cell(item, index)"
      :data-widget="item.id"
    >
      <div class="h-full" :inert="editing || undefined">
        <slot name="widget" :item="item" />
      </div>

      <div
        v-if="editing"
        class="outline-accent rounded-card border-ctrl-line bg-bg/40 absolute inset-0 z-10 hidden cursor-grab touch-none border-2 border-dashed select-none focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[border-color,background-color] motion-safe:duration-160 @4xl:block"
        :class="
          activeId === item.id
            ? 'border-accent! bg-bg/10! shadow-float cursor-grabbing'
            : 'hover:border-muted'
        "
        tabindex="0"
        role="group"
        aria-roledescription="widget movible"
        :aria-label="`${WIDGETS[item.id].title}. Flechas para moverlo, Mayús y flechas para cambiar su tamaño.`"
        :data-widget-edit="item.id"
        @pointerdown="emit('moveStart', item, $event)"
        @keydown="emit('widgetKey', item, $event)"
      >
        <button
          type="button"
          class="bg-panel2 text-muted hover:text-text border-line outline-accent absolute inset-e-2 inset-bs-2 grid size-10 cursor-pointer place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.94] pointer-coarse:size-11"
          :aria-label="`Quitar ${WIDGETS[item.id].title} del inicio`"
          @pointerdown.stop
          @click="emit('remove', item.id)"
        >
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <button
          v-if="WIDGETS[item.id].chart"
          type="button"
          class="bg-panel2 text-muted hover:text-text border-line outline-accent absolute inset-e-14 inset-bs-2 grid size-10 cursor-pointer place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.94] pointer-coarse:inset-e-15 pointer-coarse:size-11"
          :aria-label="`${WIDGETS[item.id].title}: poner la gráfica a la ${item.chart === 'end' ? 'izquierda' : 'derecha'} de las cifras`"
          :title="`Gráfica a la ${item.chart === 'end' ? 'izquierda' : 'derecha'}`"
          data-widget-chart-side
          @pointerdown.stop
          @click="emit('chart', item.id, item.chart === 'end' ? 'start' : 'end')"
        >
          <!-- Two panes swapping places: the chart's side flips. -->
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 8h13l-3-3M20 16H7l3 3" />
          </svg>
        </button>
        <span
          class="text-muted absolute inset-e-1 inset-be-1 grid size-10 cursor-nwse-resize touch-none place-items-center pointer-coarse:size-11"
          aria-hidden="true"
          data-widget-resize
          @pointerdown.stop="emit('resizeStart', item, $event)"
        >
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M20 10 10 20M20 16l-4 4" />
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>
