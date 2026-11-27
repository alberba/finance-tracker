<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from 'vue'

import { useEntrySheet } from '../../composables/useEntrySheet'
import { useWindowScroll } from '../../composables/useWindowScroll'
import { splitDecimals } from '../../lib/format'
import { getPathFromSection } from '../../scripts/app/dashboard-section-routing'
import type { SectionId } from '../../scripts/types'
import { usePendingSheet } from '../layout/pending-sheet'
import { categoryIcon } from '../ui/category-icons'
import NeonCategoryIcon from '../ui/NeonCategoryIcon.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import NeonProgressBar from '../ui/NeonProgressBar.vue'
import DashboardMobileChart from './DashboardMobileChart.vue'
import { sharedScale } from './mobile-chart'
import { useNeonDashboardStore } from './store'
import type { ChartPreset, NeonDashboardViewModel } from './view-model'

// Home of the new design in the mobile frame (DESIGN.md, «Inicio en móvil»).
// On top, three figures to swipe through, each with the chart that answers its
// question: what is left this month (spent day by day against last month), net
// worth (its evolution) and the portfolio (what it gains over what was put in).
// Their names sit above them so the other two are in sight. Under them, what
// waits for a yes, and one list at a time in tabs: movements, categories and
// goals. «Apuntar» is the frame's FAB; past 120px of scroll «Te quedan» goes up
// into the top bar.
const props = defineProps<{ viewModel: NeonDashboardViewModel }>()
const emit = defineEmits<{ navigate: [section: SectionId] }>()

const store = useNeonDashboardStore()
const { openEntrySheet } = useEntrySheet()
const { openPendingSheet } = usePendingSheet()

const month = computed(() => props.viewModel.month)
const wealth = computed(() => props.viewModel.wealth)
const investments = computed(() => props.viewModel.investments)
const left = computed(() => splitDecimals(month.value.left.text))
// A long figure steps down so it stays on one line (DESIGN.md, 52px on mobile).
// The figures that follow the chart take the size of the longest value they can
// show, so reading another month never resizes them (nor the slide).
function heroSize(...texts: string[]): string {
  const length = Math.max(...texts.map((text) => splitDecimals(text).whole.length))
  return length > 7 ? 'text-[42px]' : length > 5 ? 'text-[48px]' : 'text-[52px]'
}

/** Scroll (px) past which the figure moves into the top bar (DESIGN.md, «Barra superior móvil»). */
const BAR_FIGURE_FROM = 120
const scrollY = useWindowScroll()
const scrolled = computed(() => scrollY.value > BAR_FIGURE_FROM)
// The top bar is static markup of the frame, already there when this mounts.
const barSlot = shallowRef<HTMLElement | null>(null)
onMounted(() => {
  barSlot.value = document.querySelector<HTMLElement>('[data-bar-figure-slot]')
})

/** A real link, so it opens in a new tab; a plain click moves inside the app. */
function follow(event: MouseEvent, section: SectionId): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  emit('navigate', section)
}

// --- The three figures ---
const SLIDES = [
  { key: 'month', label: 'Este mes' },
  { key: 'wealth', label: 'Patrimonio' },
  { key: 'investments', label: 'Inversión' },
] as const
const track = useTemplateRef<HTMLElement>('track')
const slide = shallowRef(0)
function onScroll(): void {
  const el = track.value
  if (el?.clientWidth) slide.value = Math.round(el.scrollLeft / el.clientWidth)
}
function show(index: number): void {
  const el = track.value
  if (!el) return
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ left: index * el.clientWidth, behavior: instant ? 'auto' : 'smooth' })
}

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
const TONE_PILL = {
  gain: 'text-gain bg-gain/12',
  loss: 'text-loss bg-loss/12',
  neutral: 'text-text bg-text/8',
} as const
const FLOW_TEXT = { income: 'text-gain', expense: 'text-text', investment: 'text-text' } as const
/** The flows under the figure: the label says the direction, so the amount goes without its sign. */
const flows = computed(() =>
  month.value.rows.map((row) => ({ ...row, amount: row.amount.replace(/^[+−-]/, '') })),
)

// This month: spending added up day by day against last month.
const paceHot = shallowRef<number | null>(null)
const pace = computed(() => {
  const chart = month.value.paceChart
  if (!chart) return null
  const { lines } = sharedScale(
    [{ values: chart.current.values }, { values: chart.previous.values, dashed: true }],
    Math.max(chart.days, chart.previous.values.length),
  )
  const short = month.value.name.slice(0, 3).toLowerCase()
  const slots = Math.max(chart.days, chart.previous.values.length)
  const labels = Array.from({ length: slots }, (_, index) =>
    index === 0 ? `1 ${short}` : String(index + 1),
  )
  const names = chart.current.values.map((_, index) => `${index + 1} ${short}`)
  const day = (index: number | null) => (index ?? chart.current.values.length - 1) + 1
  const at = (index: number | null) => ({
    when: index === null ? 'Hoy' : `A día ${day(index)}`,
    current: chart.current.texts[day(index) - 1] ?? '',
    previous: chart.previous.texts[Math.min(day(index), chart.previous.texts.length) - 1] ?? '',
  })
  return {
    chart,
    lines,
    labels,
    names,
    at,
    valueTexts: chart.current.values.map((_, index) => {
      const read = at(index)
      return `${read.when}: ${chart.current.name} ${read.current}, ${chart.previous.name} ${read.previous}`
    }),
  }
})
const paceNow = computed(() => pace.value?.at(paceHot.value) ?? null)

// Net worth: its evolution over the range below the chart.
const wealthHot = shallowRef<number | null>(null)
const wealthChart = computed(() => {
  const chart = wealth.value.chart
  return {
    lines: chart.line ? [{ points: chart.points }] : [],
    names: chart.readings.map((reading) => reading.name),
    valueTexts: chart.readings.map((reading) =>
      [reading.name, reading.value, reading.note].filter(Boolean).join(', '),
    ),
  }
})
const wealthFigure = computed(() =>
  wealthHot.value === null
    ? wealth.value.value
    : (wealth.value.chart.readings[wealthHot.value]?.value ?? wealth.value.value),
)
/**
 * The month's change and the range's, one per row. A row keeps its room when the
 * point being read has no such change, so the chart never moves under the finger.
 */
const wealthChanges = computed(() => {
  const resting = wealth.value.monthChange
  const [month, period] =
    wealthHot.value === null
      ? [resting && { ...resting, label: 'este mes' }, wealth.value.periodChange]
      : [wealth.value.steps[wealthHot.value]?.month, wealth.value.steps[wealthHot.value]?.period]
  const rows = [
    { key: 'month', change: month ?? null },
    { key: 'period', change: period ?? null },
  ]
  // Rows that no point of the range has are left out: their room is never needed.
  return rows.filter(
    ({ key }) =>
      (key === 'month' ? wealth.value.monthChange : wealth.value.periodChange) ||
      wealth.value.steps.some((step) => step[key as 'month' | 'period']),
  )
})
const wealthSize = computed(() =>
  heroSize(wealth.value.value, ...wealth.value.chart.readings.map((reading) => reading.value)),
)

// The portfolio: what it gains over what was put in, the zero line being what was put in.
const investHot = shallowRef<number | null>(null)
const investChart = computed(() => {
  const chart = investments.value.chart
  const gains = investments.value.gains
  const names = chart.readings.map((reading) => reading.name)
  if (gains && gains.values.length > 1) {
    const scale = sharedScale(
      [{ values: gains.values }, { values: gains.values.map(() => 0), dashed: true }],
      gains.values.length,
      0,
    )
    return {
      ...scale,
      names,
      valueTexts: gains.texts.map(
        (text, index) =>
          `${names[index]}: ${chart.readings[index]?.value}, ${text} sobre lo aportado`,
      ),
    }
  }
  // A range reaching past this year has no contributions: the value alone.
  return {
    lines: chart.line ? [{ points: chart.points }] : [],
    baseTop: null,
    names,
    valueTexts: chart.readings.map((reading) => `${reading.name}: ${reading.value}`),
  }
})
const investNow = computed(() => {
  const index = investHot.value
  const gains = investments.value.gains
  const reading = index === null ? null : investments.value.chart.readings[index]
  const gain =
    index !== null && gains?.texts[index] !== undefined
      ? {
          text: gains.texts[index]!,
          tone:
            gains.values[index]! > 0
              ? ('gain' as const)
              : gains.values[index]! < 0
                ? ('loss' as const)
                : ('neutral' as const),
        }
      : index === null
        ? investments.value.gain
        : null
  return {
    lead: reading ? `Tu cartera en ${reading.name.toLowerCase()}` : 'Tu cartera hoy',
    value: reading?.value ?? investments.value.value,
    gain,
    invested:
      index !== null && gains ? (gains.invested[index] ?? null) : investments.value.invested,
  }
})

const investSize = computed(() =>
  heroSize(
    investments.value.value,
    ...investments.value.chart.readings.map((reading) => reading.value),
  ),
)

// The range of both evolution charts, shared with the desktop home.
const PERIODS: ReadonlyArray<{ value: ChartPreset; label: string }> = [
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '1a', label: 'Este año' },
]

// --- What waits for a yes ---
const pendingLine = computed(() => {
  const items = props.viewModel.pending.items
  const names = items.slice(0, 2).map((item) => item.description)
  const rest = props.viewModel.pending.count - names.length
  return rest > 0 ? `${names.join(', ')} y ${rest} más` : names.join(' y ')
})

// --- One list at a time ---
const LISTS = [
  { key: 'recent', label: 'Movimientos' },
  { key: 'categories', label: 'Categorías' },
  { key: 'goals', label: 'Objetivos' },
] as const
const list = shallowRef(0)
const tabs = useTemplateRef<HTMLButtonElement[]>('tabs')
function moveTab(event: KeyboardEvent): void {
  const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
  if (!step) return
  event.preventDefault()
  list.value = (list.value + step + LISTS.length) % LISTS.length
  tabs.value?.[list.value]?.focus()
}
/** The newest movements: as many as fit a glance, the rest one tap away. */
const RECENT_SHOWN = 5
const AMOUNT_TEXT = {
  expense: 'text-text',
  income: 'text-gain',
  investment: 'text-text',
  saving: 'text-soft',
} as const
const ROW = 'border-line flex min-h-16 items-center gap-3 border-t px-1 py-2.5 first:border-t-0'
const PRESS =
  'motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]'
</script>

<template>
  <div class="grid min-w-0 gap-3.5">
    <section
      class="motion-safe:animate-rise -mx-4 flex min-w-0 flex-col"
      aria-label="Cifras del inicio"
      aria-roledescription="carrusel"
    >
      <nav class="flex justify-center gap-1" aria-label="Cifras del inicio">
        <button
          v-for="(item, index) in SLIDES"
          :key="item.key"
          type="button"
          class="outline-accent min-h-10 rounded-sm px-3 text-sm font-extrabold underline decoration-2 underline-offset-8 focus-visible:outline-2 motion-safe:transition-colors motion-safe:duration-200"
          :class="
            slide === index ? 'text-text decoration-current' : 'text-muted decoration-transparent'
          "
          :aria-current="slide === index"
          :aria-controls="`dashboard-slide-${item.key}`"
          @click="show(index)"
        >
          {{ item.label }}
        </button>
      </nav>
      <div
        ref="track"
        class="grid snap-x snap-mandatory [scrollbar-width:none] auto-cols-[100%] grid-flow-col overflow-x-auto overscroll-x-contain"
        @scroll.passive="onScroll"
      >
        <!-- This month -->
        <section
          id="dashboard-slide-month"
          class="flex min-w-0 snap-center snap-always flex-col items-center gap-1 text-center"
          aria-roledescription="diapositiva"
          aria-labelledby="dashboard-title"
        >
          <h1
            id="dashboard-title"
            class="text-soft font-sans text-[15px] leading-[1.35] font-bold tracking-normal"
          >
            {{ month.leftLabel }} en {{ month.name.toLowerCase() }}
          </h1>
          <p
            class="font-display leading-[1.05] font-bold tracking-[-0.045em] whitespace-nowrap tabular-nums"
            :class="[heroSize(month.left.text), TONE_TEXT[month.left.tone]]"
            data-dashboard-left
          >
            {{ left.whole
            }}<span v-if="left.rest" class="text-muted text-[0.4em] tracking-[-0.02em]">{{
              left.rest
            }}</span>
          </p>
          <ul class="mbs-0.5 flex justify-center" aria-label="Entradas y salidas del mes">
            <li
              v-for="row in flows"
              :key="row.kind"
              class="border-line grid px-2.5 not-first:border-s min-[380px]:px-3.5"
            >
              <span class="text-muted text-xs">{{ row.label }}</span>
              <span
                class="font-display text-[13px] font-semibold tabular-nums"
                :class="FLOW_TEXT[row.kind]"
                >{{ row.amount }}</span
              >
            </li>
          </ul>
          <template v-if="pace">
            <DashboardMobileChart
              v-model:active="paceHot"
              class="mbs-2"
              :lines="pace.lines"
              :labels="pace.labels"
              :names="pace.names"
              :value-texts="pace.valueTexts"
              :ends="[null, pace.chart.previous.name]"
              :label="`Gasto acumulado de ${pace.chart.current.name} frente a ${pace.chart.previous.name}`"
            />
            <p
              v-if="paceHot !== null && paceNow"
              class="text-muted text-meta px-4"
              data-dashboard-pace-reading
            >
              <b class="text-text font-extrabold">{{ paceNow.when }}</b
              >:
              <b class="font-display text-text font-semibold tabular-nums">{{ paceNow.current }}</b>
              · en {{ pace.chart.previous.name }}
              <span class="font-display tabular-nums">{{ paceNow.previous }}</span>
            </p>
          </template>
          <p
            v-if="month.pace && (paceHot === null || !pace)"
            class="text-muted text-meta px-4"
            data-dashboard-pace
          >
            {{ month.pace.lead
            }}<b class="font-extrabold" :class="TONE_TEXT[month.pace.tone]">{{
              month.pace.emphasis
            }}</b
            >{{ month.pace.tail }}
          </p>
        </section>

        <!-- Net worth -->
        <section
          id="dashboard-slide-wealth"
          class="flex min-w-0 snap-center snap-always flex-col items-center gap-1 text-center"
          aria-roledescription="diapositiva"
          aria-labelledby="dashboard-wealth-title"
          data-dashboard-wealth
        >
          <h2 id="dashboard-wealth-title" class="text-soft text-[15px] leading-[1.35] font-bold">
            {{
              wealthHot === null
                ? 'Patrimonio hoy'
                : `Patrimonio en ${wealthChart.names[wealthHot]?.toLowerCase()}`
            }}
          </h2>
          <NeonFigure
            :value="wealthFigure"
            class="text-text leading-[1.05] font-bold tracking-[-0.045em]"
            :class="wealthSize"
          />
          <p class="flex flex-col items-center gap-1.5">
            <span
              v-for="row in wealthChanges"
              :key="row.key"
              class="rounded-pill px-2 py-0.5 text-[13px] font-extrabold whitespace-nowrap"
              :class="row.change ? TONE_PILL[row.change.tone] : 'invisible'"
              >{{ row.change ? `${row.change.text} ${row.change.label}` : '—' }}</span
            >
          </p>
          <DashboardMobileChart
            v-if="wealthChart.lines.length"
            v-model:active="wealthHot"
            class="mbs-2"
            :lines="wealthChart.lines"
            :labels="wealth.chart.labels"
            :names="wealthChart.names"
            :value-texts="wealthChart.valueTexts"
            :label="wealth.chart.label"
          />
          <p v-else class="text-muted text-note m-0 px-6 py-10">
            La evolución aparece cuando haya al menos dos meses con patrimonio.
          </p>
          <div
            class="bg-panel2 rounded-pill mbs-2.5 flex w-[min(100%-2rem,19rem)] gap-0.75 p-0.75"
            role="group"
            aria-label="Periodo de Patrimonio e Inversión"
          >
            <button
              v-for="option in PERIODS"
              :key="option.value"
              type="button"
              class="rounded-pill outline-accent min-h-9 flex-1 px-2 text-[13px] font-extrabold focus-visible:outline-2"
              :class="
                viewModel.selectedRange === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft'
              "
              :aria-pressed="viewModel.selectedRange === option.value"
              @click="store.range = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <!-- The portfolio -->
        <section
          id="dashboard-slide-investments"
          class="flex min-w-0 snap-center snap-always flex-col items-center gap-1 text-center"
          aria-roledescription="diapositiva"
          aria-labelledby="dashboard-investments-title"
          data-dashboard-investments
        >
          <h2
            id="dashboard-investments-title"
            class="text-soft text-[15px] leading-[1.35] font-bold"
          >
            {{ investNow.lead }}
          </h2>
          <template v-if="investments.empty">
            <NeonEmptyState class="mx-4 mbs-3">
              Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
            </NeonEmptyState>
          </template>
          <template v-else>
            <NeonFigure
              :value="investNow.value"
              class="text-text leading-[1.05] font-bold tracking-[-0.045em]"
              :class="investSize"
            />
            <p v-if="investments.gain" class="flex justify-center">
              <span
                class="rounded-pill px-2 py-0.5 text-[13px] font-extrabold whitespace-nowrap"
                :class="investNow.gain ? TONE_PILL[investNow.gain.tone] : 'invisible'"
                >{{ investNow.gain?.text ?? '—' }} sobre lo aportado</span
              >
            </p>
            <DashboardMobileChart
              v-if="investChart.lines.length"
              v-model:active="investHot"
              class="mbs-2"
              tone="lilac"
              :lines="investChart.lines"
              :base-top="investChart.baseTop"
              :labels="investments.chart.labels"
              :names="investChart.names"
              :value-texts="investChart.valueTexts"
              :label="
                investments.gains
                  ? 'Ganancia de la cartera sobre lo aportado'
                  : investments.chart.label
              "
            />
            <p
              v-if="investments.gains && investNow.invested"
              class="text-muted flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 text-[13px]"
            >
              <span class="inline-flex items-center gap-1.5">
                <i class="border-lilac w-3.5 border-t-2" aria-hidden="true" />
                ganancia
              </span>
              <span class="inline-flex items-center gap-1.5">
                <i class="border-faint w-3.5 border-t-2 border-dashed" aria-hidden="true" />
                lo aportado
                <b class="font-display text-text font-semibold tabular-nums">{{
                  investNow.invested
                }}</b>
              </span>
            </p>
            <div
              class="bg-panel2 rounded-pill mbs-2.5 flex w-[min(100%-2rem,19rem)] gap-0.75 p-0.75"
              role="group"
              aria-label="Periodo de Patrimonio e Inversión"
            >
              <button
                v-for="option in PERIODS"
                :key="option.value"
                type="button"
                class="rounded-pill outline-accent min-h-9 flex-1 px-2 text-[13px] font-extrabold focus-visible:outline-2"
                :class="
                  viewModel.selectedRange === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft'
                "
                :aria-pressed="viewModel.selectedRange === option.value"
                @click="store.range = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </template>
        </section>
      </div>
    </section>

    <Teleport v-if="barSlot" :to="barSlot">
      <p
        class="flex items-baseline gap-2 whitespace-nowrap data-[bar-figure=hidden]:translate-y-1.5 data-[bar-figure=hidden]:opacity-0 motion-safe:transition-[opacity,translate] motion-safe:duration-200 motion-safe:ease-out"
        :data-bar-figure="scrolled ? 'shown' : 'hidden'"
        aria-hidden="true"
      >
        <span class="text-soft text-sm font-bold">{{ month.leftLabel }}</span>
        <span
          class="font-display text-lg font-semibold tracking-[-0.02em] tabular-nums"
          :class="TONE_TEXT[month.left.tone]"
        >
          {{ month.left.text }}
        </span>
      </p>
    </Teleport>

    <button
      v-if="viewModel.pending.count"
      type="button"
      class="bg-panel2 outline-accent flex min-h-14 items-center gap-3 rounded-[18px] p-2 text-start focus-visible:outline-2"
      :class="PRESS"
      aria-haspopup="dialog"
      aria-labelledby="dashboard-pending-note"
      aria-describedby="dashboard-pending-line"
      data-dashboard-pending
      @click="openPendingSheet"
    >
      <span class="bg-panel text-soft grid size-10 shrink-0 place-items-center rounded-full">
        <svg
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M10 6h10M10 12h10M10 18h10M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"
          />
        </svg>
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span id="dashboard-pending-note" class="text-[15px] font-bold">{{
          month.pendingNote
        }}</span>
        <span id="dashboard-pending-line" class="text-muted text-meta truncate">{{
          pendingLine
        }}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        class="text-muted size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>

    <section class="min-w-0" aria-label="Listas del inicio">
      <div class="bg-bg sticky top-16 z-[4] py-1">
        <div
          class="bg-panel2 rounded-pill flex gap-0.75 p-0.75"
          role="tablist"
          aria-label="Listas del inicio"
          @keydown="moveTab"
        >
          <button
            v-for="(item, index) in LISTS"
            :id="`dashboard-tab-${item.key}`"
            ref="tabs"
            :key="item.key"
            type="button"
            role="tab"
            class="rounded-pill outline-accent min-h-9 flex-1 px-2 text-sm font-extrabold focus-visible:outline-2"
            :class="list === index ? 'bg-sel-bg text-sel-text' : 'text-soft'"
            :aria-selected="list === index"
            :aria-controls="`dashboard-list-${item.key}`"
            :tabindex="list === index ? 0 : -1"
            @click="list = index"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div
        v-show="list === 0"
        id="dashboard-list-recent"
        role="tabpanel"
        aria-labelledby="dashboard-tab-recent"
        data-dashboard-recent
      >
        <NeonEmptyState v-if="!viewModel.recent.items.length" class="mbs-2">
          {{ viewModel.recent.empty }}
          <template #action>
            <button
              type="button"
              class="text-text outline-accent rounded-pill -ms-4 min-h-11 px-4 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2"
              @click="openEntrySheet"
            >
              Apuntar uno
            </button>
          </template>
        </NeonEmptyState>
        <template v-else>
          <ul aria-label="Movimientos recientes">
            <li
              v-for="item in viewModel.recent.items.slice(0, RECENT_SHOWN)"
              :key="item.id"
              :class="ROW"
            >
              <NeonCategoryIcon :path="categoryIcon(item.type, item.category)" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="text-row truncate font-bold">{{ item.description }}</span>
                <span class="text-muted text-meta truncate"
                  >{{ item.category }} · {{ item.date }}</span
                >
              </span>
              <span
                class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
                :class="AMOUNT_TEXT[item.type]"
              >
                {{ item.amount }}
              </span>
            </li>
          </ul>
          <a
            :href="getPathFromSection('transactions')"
            class="text-text outline-accent rounded-pill inline-flex min-h-11 items-center gap-0.5 px-1 text-sm font-extrabold focus-visible:outline-2"
            @click="follow($event, 'transactions')"
          >
            Ver todos los movimientos
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </a>
        </template>
      </div>

      <div
        v-show="list === 1"
        id="dashboard-list-categories"
        role="tabpanel"
        aria-labelledby="dashboard-tab-categories"
        data-dashboard-categories
      >
        <NeonEmptyState v-if="!viewModel.categories.length" class="mbs-2">
          Aún no hay gastos ni límites este mes.
        </NeonEmptyState>
        <template v-else>
          <ul class="flex flex-col px-1">
            <li
              v-for="item in viewModel.categories"
              :key="item.category"
              class="border-line flex flex-col gap-1.5 border-t py-3 first:border-t-0"
            >
              <div class="flex items-baseline justify-between gap-3">
                <span class="truncate text-[15px] font-bold">{{ item.category }}</span>
                <span class="text-muted text-meta whitespace-nowrap">
                  <span
                    class="font-display text-[15px] font-semibold tabular-nums"
                    :class="item.over ? 'text-loss' : 'text-text'"
                    >{{ item.spent }}</span
                  >
                  {{ item.limit ? `de ${item.limit}` : '· sin límite' }}
                </span>
              </div>
              <NeonProgressBar v-if="item.limit" :value="item.width" :over="item.over" />
            </li>
          </ul>
          <a
            :href="getPathFromSection('budget')"
            class="text-text outline-accent rounded-pill inline-flex min-h-11 items-center gap-0.5 px-1 text-sm font-extrabold focus-visible:outline-2"
            @click="follow($event, 'budget')"
          >
            Ir a Presupuesto
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </a>
        </template>
      </div>

      <div
        v-show="list === 2"
        id="dashboard-list-goals"
        role="tabpanel"
        aria-labelledby="dashboard-tab-goals"
        data-dashboard-goals
      >
        <NeonEmptyState v-if="!viewModel.goals.length" class="mbs-2">
          Aún no tienes objetivos definidos.
        </NeonEmptyState>
        <ul v-else class="flex flex-col px-1">
          <li
            v-for="goal in viewModel.goals"
            :key="goal.key"
            class="border-line flex flex-col gap-1.5 border-t py-3 first:border-t-0"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="truncate text-[15px] font-bold">{{ goal.name }}</span>
              <span class="font-display text-[15px] font-semibold tabular-nums">
                {{ goal.progress }}
              </span>
            </div>
            <NeonProgressBar :value="goal.width" />
            <span class="text-muted text-meta">{{ goal.detail }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
