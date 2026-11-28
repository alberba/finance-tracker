<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import {
  formatCompactMoney,
  formatMoney,
  formatMonthName,
  formatSignedMoney,
} from '../../../lib/format'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonLineChart from '../../ui/NeonLineChart.vue'
import { buildLineChart, type LabelledLineChart } from '../../ui/line-chart'
import {
  availableRanges,
  EVOLUTION_RANGES,
  rangeWindow,
  type EvolutionRange,
  type TimelinePoint,
} from './evolution-range'

// «Evolución del patrimonio»: the net worth of the chosen month, what it moved
// in that month and over the range, and the line of the range. The range is
// part of the title («· 2026 ▾») and opens a small tab of presets, from three
// months to five years. The month is picked on the chart itself.
const props = defineProps<{
  points: TimelinePoint[]
  year: number
  currency: string
  mobile?: boolean
}>()
const range = defineModel<EvolutionRange>('range', { required: true })
const selected = ref<string | null>(null)
const active = ref<number | null>(null)
const expanded = ref(false)

const key = (point: TimelinePoint) => `${point.year}-${point.month}`
const shown = computed(() => rangeWindow(props.points, range.value, props.year))
const visible = computed(() => shown.value.points)
const crossesYears = computed(() => visible.value[0]?.year !== visible.value.at(-1)?.year)
const chosen = computed(
  () => visible.value.find((point) => key(point) === selected.value) ?? visible.value.at(-1),
)
const reading = computed(
  () => (active.value === null ? null : visible.value[active.value]) ?? chosen.value,
)
const selectedIndex = computed(() => visible.value.findIndex((point) => point === chosen.value))
const option = computed(
  () => EVOLUTION_RANGES.find((item) => item.value === range.value) ?? EVOLUTION_RANGES[2],
)
const available = computed(() => availableRanges(props.points, props.year))

const money = (value: number) => formatMoney(value, props.currency)
const signed = (value: number) => formatSignedMoney(value, props.currency)
const tone = (value: number) => (value < 0 ? 'text-loss' : value > 0 ? 'text-gain' : 'text-text')
const monthName = (point: TimelinePoint) =>
  crossesYears.value
    ? `${formatMonthName(point.month)} ${point.year}`
    : formatMonthName(point.month)

/** What the month moved from the one before it, when there is one. */
const monthChange = computed(() => {
  const point = reading.value
  if (!point) return null
  const index = props.points.indexOf(point)
  return index > 0 ? point.value - props.points[index - 1].value : null
})
/** What it moved over the range: from the month before it, or its first. */
const rangeChange = computed(() => {
  const point = reading.value
  const start = shown.value.base ?? visible.value[0]
  return point && start ? point.value - start.value : null
})

const lineChart = computed<LabelledLineChart>(() => {
  const points = visible.value
  const geometry = buildLineChart(points.map((point) => point.value))
  const short = (point: TimelinePoint) => formatMonthName(point.month).slice(0, 3).toLowerCase()
  return {
    ...geometry,
    label: 'Patrimonio por mes',
    labels: points.map((point) =>
      crossesYears.value ? `${short(point)} ${String(point.year).slice(2)}` : short(point),
    ),
    tickLabels: geometry.ticks.map((tick) => formatCompactMoney(tick.value, props.currency)),
    readings: points.map((point) => ({
      name: monthName(point),
      value: money(point.value),
      open: point.open,
      note: point.open ? 'saldo sin cerrar' : undefined,
    })),
  }
})

watch(visible, () => {
  active.value = null
})
watch(
  () => props.year,
  () => {
    selected.value = null
  },
)

function pickPoint(index: number): void {
  const point = visible.value[index]
  if (!point) return
  selected.value = key(point)
  active.value = null
}

// The tab of ranges, under the title.
const menuOpen = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')

// The tab stays open on a pick, so ranges can be compared one after another;
// Escape, a press outside or the title close it.
function pickRange(next: EvolutionRange): void {
  range.value = next
}

function closeMenu(focus = true): void {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (focus) void nextTick(() => trigger.value?.focus())
}

function onPointerDown(event: PointerEvent): void {
  if (event.target instanceof Node && root.value?.contains(event.target)) return
  closeMenu(false)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  closeMenu()
}

watch(menuOpen, async (open) => {
  if (!open) {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
    return
  }
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  await nextTick()
  menu.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <section
    class="bg-panel border-line rounded-card frame:gap-[18px] frame:px-7 frame:pbs-6 frame:pbe-5 @container/evolution grid min-w-0 content-start gap-3 border px-4 py-4"
    aria-labelledby="wealth-evolution-title"
  >
    <header class="flex items-center justify-between gap-x-4 gap-y-2">
      <div ref="root" class="relative min-w-0">
        <div class="text-block-title flex flex-wrap items-center font-extrabold">
          <h2 id="wealth-evolution-title">Evolución del patrimonio</h2>
          <span class="inline-flex items-center whitespace-nowrap">
            <span class="text-muted mx-1" aria-hidden="true">·</span>
            <button
              ref="trigger"
              type="button"
              class="text-accent-text outline-accent decoration-ctrl-line inline-flex min-h-11 items-center gap-1 rounded-sm whitespace-nowrap underline decoration-2 underline-offset-[5px] focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[text-decoration-color] pointer-fine:hover:decoration-current"
              :class="menuOpen && 'decoration-current'"
              :aria-expanded="menuOpen"
              aria-haspopup="dialog"
              :aria-label="`Rango: ${option.title || year}. Cambiar`"
              data-wealth-range
              @click="menuOpen = !menuOpen"
            >
              {{ option.title || year }}
              <svg
                class="size-4 motion-safe:transition-transform motion-safe:duration-200"
                :class="menuOpen && 'rotate-180'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </span>
        </div>

        <div
          v-if="menuOpen"
          ref="menu"
          role="dialog"
          aria-label="Rango de la gráfica"
          class="bg-panel border-line rounded-popover shadow-float motion-safe:animate-pop-in absolute inset-s-0 z-30 mbs-1.5 grid w-max max-w-[calc(100cqi-8px)] origin-top-left border p-1.5"
        >
          <div class="grid grid-cols-7 gap-1" role="group" aria-label="Rangos">
            <button
              v-for="item in EVOLUTION_RANGES"
              :key="item.value"
              type="button"
              :aria-pressed="range === item.value"
              :disabled="!available.has(item.value)"
              :aria-label="item.label"
              class="outline-accent pointer-fine:hover:bg-panel2 grid min-h-11 min-w-11 place-items-center rounded-[10px] px-2 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-35 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.96]"
              :class="
                range === item.value
                  ? 'bg-sel-bg text-sel-text pointer-fine:hover:bg-sel-bg'
                  : 'text-soft'
              "
              @click="pickRange(item.value)"
            >
              {{ item.short }}
            </button>
          </div>
        </div>
      </div>

      <button
        v-if="mobile && lineChart.line"
        type="button"
        :aria-pressed="expanded"
        :aria-label="expanded ? 'Volver a la vista compacta' : 'Ver el gráfico completo'"
        class="border-ctrl-line text-soft outline-accent grid size-11 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
        @click="expanded = !expanded"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="expanded ? 'M6 6l12 12M18 6 6 18' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'" />
        </svg>
      </button>
    </header>

    <template v-if="reading && chosen">
      <div class="flex flex-wrap items-end gap-x-7 gap-y-2.5">
        <p
          class="font-display text-[clamp(1.25rem,6cqi,2.75rem)] leading-[1.05] font-semibold tracking-[-0.035em] wrap-anywhere tabular-nums"
          data-wealth-evolution-value
        >
          {{ money(reading.value) }}
        </p>
        <dl class="flex gap-6 pbe-1">
          <div class="grid min-w-0 gap-px">
            <dt class="text-muted text-meta">En {{ monthName(reading).toLowerCase() }}</dt>
            <dd
              class="font-display text-[15px] font-semibold whitespace-nowrap tabular-nums"
              :class="monthChange === null ? 'text-muted' : tone(monthChange)"
              data-wealth-month-change
            >
              <span v-if="monthChange === null" aria-label="Sin mes anterior">—</span>
              <template v-else>{{ signed(monthChange) }}</template>
            </dd>
          </div>
          <div
            v-if="rangeChange !== null"
            :key="range"
            class="motion-safe:animate-swap grid min-w-0 gap-px"
          >
            <dt class="text-muted text-meta">{{ option.since }}</dt>
            <dd
              class="font-display text-[15px] font-semibold whitespace-nowrap tabular-nums"
              :class="tone(rangeChange)"
              data-wealth-year-change
            >
              {{ signed(rangeChange) }}
            </dd>
          </div>
        </dl>
      </div>

      <NeonLineChart
        v-if="lineChart.line"
        v-model:active="active"
        :chart="lineChart"
        :selected="selectedIndex"
        :hold-to-explore="mobile"
        :compact="mobile"
        reframe
        axis="start"
        class="min-w-0"
        :class="expanded ? 'min-h-60' : mobile ? 'min-h-32' : 'min-h-60'"
        @select="pickPoint"
      />
      <NeonEmptyState v-else> La gráfica aparece cuando haya datos de dos meses. </NeonEmptyState>
    </template>
    <NeonEmptyState v-else>Aún no hay datos de patrimonio para el año.</NeonEmptyState>
  </section>
</template>
