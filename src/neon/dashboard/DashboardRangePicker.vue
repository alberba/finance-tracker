<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'

import { parseDashboardRange, type ChartRange, type NeonDashboardViewModel } from './view-model'

const props = defineProps<{
  label: string
  options: NeonDashboardViewModel['rangeOptions']
  rangeBounds: NeonDashboardViewModel['rangeBounds']
  range: ChartRange
}>()
const emit = defineEmits<{ pick: [range: ChartRange] }>()

const open = ref(false)
const start = ref('')
const invalidStart = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const panelId = useId()
const helpId = useId()

function close(returnFocus: boolean): void {
  open.value = false
  if (returnFocus) void nextTick(() => trigger.value?.focus())
}

function pick(value: ChartRange): void {
  emit('pick', value)
  close(true)
}

function pickStart(): void {
  const value = parseDashboardRange(start.value, props.rangeBounds)
  invalidStart.value = value === null
  if (value) pick(value)
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
  const [, year, month] = props.range.split('-')
  start.value = year ? `${month.padStart(2, '0')}/${year}` : ''
  invalidStart.value = false
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  void nextTick(() =>
    root.value
      ?.querySelector<HTMLElement>('[role="dialog"] :is([aria-pressed="true"], input)')
      ?.focus(),
  )
})

onBeforeUnmount(stopListening)
</script>

<template>
  <div ref="root" class="relative" data-dashboard-range>
    <button
      ref="trigger"
      type="button"
      class="group outline-accent text-muted motion-safe:animate-rise flex items-center gap-2 rounded-lg font-sans text-[26px] leading-[1.15] font-extrabold tracking-tight whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4"
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
      <form
        class="border-line mbs-1 grid gap-1.5 border-bs px-3 pbs-3 pbe-1.5"
        novalidate
        @submit.prevent="pickStart"
      >
        <label :for="`${panelId}-start`" class="text-muted text-[13px] font-bold">Desde</label>
        <div class="flex items-center gap-2">
          <input
            :id="`${panelId}-start`"
            v-model="start"
            type="text"
            placeholder="MM/AAAA o AAAA"
            :aria-describedby="helpId"
            :aria-invalid="invalidStart || undefined"
            class="bg-panel border-ctrl-line text-text placeholder:text-muted outline-accent rounded-field min-h-[46px] w-full min-w-0 border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            @input="invalidStart = false"
          />
          <button
            type="submit"
            class="bg-panel2 border-ctrl-line text-text outline-accent rounded-field text-note active:bg-bg min-h-[46px] border px-3.5 font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Aplicar
          </button>
        </div>
        <p :id="helpId" class="text-muted text-meta" :class="{ 'sr-only': !invalidStart }">
          Usa MM/AAAA o AAAA, desde {{ rangeBounds.firstYear }} hasta
          {{ String(rangeBounds.endMonth).padStart(2, '0') }}/{{ rangeBounds.endYear }}.
        </p>
      </form>
    </div>
  </div>
</template>
