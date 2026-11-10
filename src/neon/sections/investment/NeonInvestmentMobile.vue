<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ReturnMode } from '../../../domain/investment/view-model'
import type { Month } from '../../../lib/month'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { listSheetGesture, releaseVelocity } from '../../ui/sheet-drag'
import NeonInvestmentCardRows from './NeonInvestmentCardRows.vue'
import NeonInvestmentCompactChart from './NeonInvestmentCompactChart.vue'
import NeonInvestmentControls from './NeonInvestmentControls.vue'
import {
  type Card,
  type CompactChart,
  type LeadFigure,
  type PeriodOption,
  type PositionRow,
  type QuoteNotice,
  TONE_TEXT,
} from './view-model'

// The cover of Inversión in the mobile frame (artboard «Inversión · móvil ·
// Pixel 10»): one screen. On top, what the portfolio is worth in big figures
// with its gain and return under it, over the chart, which is walked with the
// finger and shows that month's figures; under it the period and how the
// return is measured. The positions live in a sheet that carries its own list:
// dragging its grip up hides the chart and the pills and gives the list the
// height, dragging it down brings them back, and a tap on the grip does the
// same. At the foot of the sheet, the worst fall and the fees, each in its own
// panel. «Nueva operación» is the frame's «Apuntar» button, so there is none
// here.
const props = defineProps<{
  empty: boolean
  notice: QuoteNotice | null
  /** What the lead figure is worth «at»: «Vale hoy», «Valía a 31 mar 2026». */
  valueLabel: string
  /** The lead figure of a point of the chart, or of the period's close when null. */
  leadAt: (index: number | null) => LeadFigure
  chart: CompactChart
  periods: readonly PeriodOption[]
  month: Month
  method: ReturnMode
  rows: readonly PositionRow[]
  cards: readonly Card[]
}>()

const emit = defineEmits<{
  open: [id: string]
  month: [month: Month]
  method: [method: ReturnMode]
}>()

const hot = ref<number | null>(null)
const lead = computed(() => props.leadAt(hot.value))

// The dot of each position, from the portfolio's cool hues to the warm one.
const DOTS = ['bg-lilac', 'bg-lilac2', 'bg-peach', 'bg-lilac3', 'bg-faint']
const FALL_ICON = 'M3 7l6 6 4-4 8 8M15 17h6v-6'
const FEES_ICON = 'M18 6.5a7 7 0 1 0 0 11M4 10h10M4 14h10'
const ARROW_UP = 'M7 17L17 7M8 7h9v9'
const ARROW_DOWN = 'M7 7l10 10M17 8v9H8'

// The sheet's two heights. Open, the chart and the pills go away.
const expanded = ref(false)
// The block that goes away is clipped while it shrinks or grows, and not
// otherwise, so the pills' menus can open over what is under them.
const clipped = ref(false)

function onCollapseEnd(event: TransitionEvent): void {
  if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows') {
    clipped.value = expanded.value
  }
}

function setExpanded(value: boolean): void {
  expanded.value = value
  clipped.value = true
  hot.value = null
}

let press: { y: number; at: number } | null = null
let last: { y: number; at: number } | null = null
let before: { y: number; at: number } | null = null

function onPress(event: PointerEvent): void {
  press = before = last = { y: event.clientY, at: event.timeStamp }
  ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
}

function onMove(event: PointerEvent): void {
  if (!press) return
  before = last
  last = { y: event.clientY, at: event.timeStamp }
}

function onRelease(event: PointerEvent): void {
  if (!press || !last || !before) return
  const fresh = event.timeStamp - last.at <= 100
  const velocity = fresh ? releaseVelocity(before, last) : 0
  const gesture =
    event.type === 'pointercancel'
      ? 'stay'
      : listSheetGesture(expanded.value, event.clientY - press.y, velocity)
  press = last = before = null
  if (gesture === 'toggle') setExpanded(!expanded.value)
  else if (gesture === 'expand') setExpanded(true)
  else if (gesture === 'collapse') setExpanded(false)
}

/** A keyboard press on the grip: pointer clicks were already handled on release. */
function onGripClick(event: MouseEvent): void {
  if (event.detail === 0) setExpanded(!expanded.value)
}

// The panel of a card keeps its card while it slides out.
const openCardId = ref<string | null>(null)
const shownCardId = ref<string | null>(null)
const cardOpen = computed({
  get: () => openCardId.value !== null,
  set: (open) => {
    if (!open) openCardId.value = null
  },
})
const shownCard = computed(() => props.cards.find((card) => card.id === shownCardId.value))

function openCard(id: string): void {
  openCardId.value = shownCardId.value = id
}

// The page's own side padding: the chart and the sheet go over it, edge to edge.
const BLEED = '-mx-[clamp(16px,2.6vw,40px)]'
</script>

<template>
  <div v-if="empty" class="grid min-w-0 gap-5">
    <h1
      id="investment-title"
      tabindex="-1"
      class="font-display px-2 pbs-1 text-[22px] leading-[1.15] font-bold tracking-[-0.03em] outline-none"
    >
      Inversión
    </h1>
    <NeonEmptyState>
      Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
    </NeonEmptyState>
  </div>

  <!-- The screen is as tall as what is left between the bars, so the sheet ends
       right on the bottom bar: the page's top padding is taken back, and its
       bottom one (which clears the bar) all but, so the frame's grid, which
       stretches its rows when it is shorter than the window, doesn't grow the
       top bar. -->
  <div
    v-else
    class="-mt-[clamp(18px,2.6vw,36px)] -mb-5 flex h-[calc(100dvh-144px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-136 min-w-0 flex-col"
  >
    <header class="pointer-events-none relative z-10 grid gap-0.5 px-2 pbs-3">
      <h1
        id="investment-title"
        tabindex="-1"
        class="font-display text-[22px] leading-[1.15] font-bold tracking-[-0.03em] outline-none"
      >
        Inversión
      </h1>
      <p
        v-if="notice"
        class="text-label tracking-label m-0 inline-flex items-center gap-2 font-extrabold uppercase"
        :class="notice.late ? 'text-soft' : 'text-muted'"
        :role="notice.late ? 'status' : undefined"
        :title="notice.title"
        data-investment-quotes
      >
        <span
          class="size-2 flex-none rounded-full"
          :class="notice.late ? 'bg-peach' : 'bg-gain'"
          aria-hidden="true"
        ></span>
        {{ notice.text }}
      </p>
      <div
        class="mbs-2 grid gap-0"
        role="group"
        aria-label="Cifras del periodo"
        aria-live="polite"
        data-investment-figures
        data-investment-figure="return"
      >
        <span class="sr-only">{{ lead.when ?? valueLabel }}</span>
        <span
          class="font-display text-[38px] leading-[1.05] font-bold tracking-[-0.035em] whitespace-nowrap tabular-nums"
          data-investment-value
        >
          {{ lead.value }}
        </span>
        <span
          class="inline-flex items-center gap-2 text-[14px] font-extrabold"
          :class="TONE_TEXT[lead.tone]"
        >
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
            <path :d="lead.falling ? ARROW_DOWN : ARROW_UP" />
          </svg>
          {{ lead.gain }}
          <span class="font-bold">{{ lead.ret }}</span>
        </span>
      </div>
    </header>

    <div
      class="grid flex-none transition-[grid-template-rows,opacity,visibility,margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:duration-1"
      :class="expanded ? 'invisible mbs-0 grid-rows-[0fr] opacity-0' : '-mbs-9 grid-rows-[1fr]'"
      :inert="expanded ? '' : undefined"
      :aria-hidden="expanded ? 'true' : undefined"
      data-investment-overview
      @transitionend="onCollapseEnd"
    >
      <!-- Wider than the column by the page's padding, so the chart bleeds and
           the clipping of the collapse doesn't cut it. -->
      <div class="grid min-h-0 gap-1 pbe-2" :class="[BLEED, clipped && 'overflow-hidden']">
        <NeonInvestmentCompactChart v-model:hot="hot" :chart="chart" :when="lead.when" />
        <NeonInvestmentControls
          compact
          :periods="periods"
          :month="month"
          :method="method"
          @month="emit('month', $event)"
          @method="emit('method', $event)"
        />
      </div>
    </div>

    <section
      class="bg-panel rounded-t-sheet flex min-h-0 flex-1 flex-col gap-1.5 px-3.5 pbe-3.5"
      :class="BLEED"
      aria-label="Posiciones"
      data-investment-positions
    >
      <div
        class="-mx-3.5 grid min-h-[30px] touch-none place-items-center pointer-coarse:min-h-11"
        data-sheet-handle
        @pointerdown="onPress"
        @pointermove="onMove"
        @pointerup="onRelease"
        @pointercancel="onRelease"
      >
        <button
          type="button"
          class="outline-accent grid size-full min-h-[inherit] place-items-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2"
          :aria-expanded="expanded"
          :aria-label="
            expanded ? 'Reducir la lista de posiciones' : 'Ampliar la lista de posiciones'
          "
          data-sheet-grip
          @click="onGripClick"
        >
          <span class="bg-ctrl-line rounded-pill block h-[5px] w-11" aria-hidden="true"></span>
        </button>
      </div>
      <ul
        class="m-0 min-h-0 flex-1 [scrollbar-width:none] list-none overflow-y-auto overscroll-contain p-0"
      >
        <li v-for="(row, index) in rows" :key="row.id" class="border-line border-t">
          <button
            type="button"
            class="outline-accent grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-0.5 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.99]"
            :aria-label="row.openLabel"
            :data-investment-position="row.id"
            @click="emit('open', row.id)"
          >
            <span
              class="size-3 rounded-full"
              :class="DOTS[index % DOTS.length]"
              aria-hidden="true"
            ></span>
            <span class="grid min-w-0 gap-0.5">
              <span class="text-row truncate font-bold">{{ row.symbol ?? row.name }}</span>
              <span v-if="row.symbol" class="text-muted text-meta truncate">{{ row.name }}</span>
            </span>
            <span class="grid justify-items-end gap-0.5">
              <span
                class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
              >
                {{ row.value }}
              </span>
              <span class="text-note font-extrabold whitespace-nowrap" :class="TONE_TEXT[row.tone]">
                {{ row.ret }}
              </span>
            </span>
          </button>
        </li>
      </ul>
      <!-- On the left: the frame's «Apuntar» button floats over the right. -->
      <div class="flex items-center gap-2">
        <button
          v-for="card in cards.slice(0, 1)"
          :key="card.id"
          type="button"
          class="text-text outline-accent rounded-pill flex min-h-11 min-w-0 items-center gap-3 px-4 text-start text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          aria-haspopup="dialog"
          @click="openCard(card.id)"
        >
          <svg
            class="text-accent-text size-5 flex-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="FALL_ICON" />
          </svg>
          {{ card.title }}
        </button>
        <button
          v-for="card in cards.slice(1)"
          :key="card.id"
          type="button"
          class="bg-panel2 text-text outline-accent grid size-11 flex-none place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          :aria-label="card.title"
          aria-haspopup="dialog"
          @click="openCard(card.id)"
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
            <path :d="FEES_ICON" />
          </svg>
        </button>
      </div>
    </section>
  </div>

  <NeonDetailPanel v-model:open="cardOpen" :title="shownCard?.title ?? ''" kicker="Inversión">
    <NeonInvestmentCardRows v-if="shownCard" :rows="shownCard.rows" />
  </NeonDetailPanel>
</template>
