<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'

import type { ChartRange, NeonDashboardViewModel } from './view-model'

// Range of the home's charts (DESIGN.md, Selector de periodo): it reads as part
// of the title («Dashboard · último año») and opens the page's own panel (not
// the system's): the presets with the months each draws, and under them the
// year as a ruler of twelve months, where any past month can be the start
// («desde mayo»). Escape or a press outside closes it; Escape and a pick give
// the focus back to the title.
defineProps<{
  label: string
  options: NeonDashboardViewModel['rangeOptions']
  months: NeonDashboardViewModel['rangeMonths']
}>()
const range = defineModel<ChartRange>({ required: true })

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const panelId = useId()

function close(returnFocus: boolean): void {
  open.value = false
  if (returnFocus) void nextTick(() => trigger.value?.focus())
}

function pick(value: ChartRange): void {
  range.value = value
  close(true)
}

function onPointerDown(event: Event): void {
  if (event.target instanceof Node && root.value?.contains(event.target)) return
  close(false)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close(true)
}

function stopListening(): void {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
}

watch(open, (isOpen) => {
  if (!isOpen) return stopListening()
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  void nextTick(() =>
    root.value?.querySelector<HTMLElement>('[role="dialog"] [aria-pressed="true"]')?.focus(),
  )
})

onBeforeUnmount(stopListening)
</script>

<template>
  <div ref="root" class="relative" data-dashboard-range>
    <button
      ref="trigger"
      type="button"
      class="group outline-accent text-muted flex items-center gap-2 rounded-lg font-sans text-[26px] leading-[1.15] font-extrabold tracking-tight whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      :aria-label="`Periodo de los gráficos: ${label}`"
      @click="open = !open"
    >
      <span aria-hidden="true">·</span>
      <span
        class="text-accent-text decoration-ctrl-line underline decoration-2 underline-offset-[6px] group-hover:decoration-current"
        :class="open && 'decoration-current'"
        >{{ label }}</span
      >
      <svg
        class="text-accent-text size-5 shrink-0 motion-safe:transition-transform motion-safe:duration-160"
        :class="open && 'rotate-180'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div
      v-if="open"
      :id="panelId"
      role="dialog"
      aria-label="Periodo de los gráficos"
      class="bg-panel border-line rounded-popover shadow-float text-text motion-safe:animate-pop-in absolute inset-s-0 inset-bs-full z-40 mbs-3 grid w-[min(24rem,calc(100vw-32px))] origin-top-left gap-0.5 border p-1.5"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :aria-pressed="option.value === range"
        class="outline-accent text-note flex min-h-11 items-center justify-between gap-4 rounded-[12px] px-3 font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 active:scale-[0.99]"
        :class="option.value === range ? 'bg-panel2 text-text' : 'text-soft hover:bg-panel2'"
        @click="pick(option.value)"
      >
        <span class="flex items-center gap-2.5">
          <span
            class="size-2 rounded-full"
            :class="option.value === range ? 'bg-accent' : 'bg-transparent'"
            aria-hidden="true"
          />
          {{ option.label }}
        </span>
        <span class="text-muted text-meta font-semibold tabular-nums">{{ option.span }}</span>
      </button>
      <!-- The year as a ruler: a past month starts the range there, until today. -->
      <div class="border-line mbs-1 grid gap-2 border-t px-1.5 pt-3 pb-1">
        <span class="text-muted text-meta px-1.5 font-bold">Desde</span>
        <div class="grid grid-cols-12">
          <button
            v-for="month in months"
            :key="month.value"
            type="button"
            :disabled="month.disabled"
            :aria-pressed="month.value === range"
            :aria-label="`Desde ${month.name.toLocaleLowerCase('es')}`"
            class="outline-accent group/month enabled:hover:bg-panel2 grid min-h-11 content-center justify-items-center gap-1.5 rounded-[8px] px-px focus-visible:outline-2 focus-visible:-outline-offset-2 enabled:active:scale-[0.96]"
            @click="pick(month.value)"
          >
            <span
              class="text-meta font-bold"
              :class="month.lit ? 'text-text' : month.disabled ? 'text-faint' : 'text-muted'"
              aria-hidden="true"
              >{{ month.initial }}</span
            >
            <span
              class="h-1.5 w-full rounded-full"
              :class="
                month.lit
                  ? 'bg-accent'
                  : month.disabled
                    ? 'border-line border border-dashed'
                    : 'bg-ctrl-line group-hover/month:bg-soft'
              "
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
