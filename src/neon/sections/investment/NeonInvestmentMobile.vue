<script setup lang="ts">
import { nextTick, ref } from 'vue'

import type { ReturnMode } from '../../../domain/investment/view-model'
import type { Month } from '../../../lib/month'
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { listSheetGesture, releaseVelocity } from '../../ui/sheet-drag'
import NeonInvestmentCards from './NeonInvestmentCards.vue'
import NeonInvestmentCompactChart from './NeonInvestmentCompactChart.vue'
import NeonInvestmentControls from './NeonInvestmentControls.vue'
import {
  DIRECTION_OPTIONS,
  SORT_OPTIONS,
  sortLabel,
  type CardRow,
  type CompactChart,
  type PeriodFigure,
  type PeriodOption,
  type PositionRow,
  type QuoteNotice,
  type SortDirection,
  type SortKey,
  TONE_TEXT,
} from './view-model'

// The cover of Inversión in the mobile frame (artboard «Inversión · móvil ·
// Pixel 10»): the same information as the desktop cover, in one column. The
// return of the period is the lead figure, with what the portfolio is worth
// and what went in under it; then the chart edge to edge and the two pills.
// The positions live in a sheet that carries its own list: dragging its grip up
// hides the chart and the pills and gives the list the height, dragging it down
// brings them back, and a tap on the grip does the same. «Nueva operación» is
// the frame's «Apuntar» button, so the header has no button of its own.
const props = defineProps<{
  empty: boolean
  notice: QuoteNotice | null
  figures: readonly PeriodFigure[]
  chart: CompactChart
  periods: readonly PeriodOption[]
  month: Month
  method: ReturnMode
  rows: readonly PositionRow[]
  sortKey: SortKey
  sortDirection: SortDirection
  cards: ReadonlyArray<{ id: string; title: string; rows: readonly CardRow[] }>
}>()

const emit = defineEmits<{
  open: [id: string]
  sort: [key: SortKey, direction: SortDirection]
  month: [month: Month]
  method: [method: ReturnMode]
}>()

const SORT_ICON = 'M4 7h16M7 12h10M10 17h4'

function sortGroups(): ChoiceGroup<SortKey | SortDirection>[] {
  return [
    { key: 'by', options: SORT_OPTIONS, value: props.sortKey },
    { key: 'direction', options: DIRECTION_OPTIONS, value: props.sortDirection },
  ]
}

const isDirection = (value: SortKey | SortDirection): value is SortDirection =>
  value === 'asc' || value === 'desc'

function onSort(_group: string, value: SortKey | SortDirection): void {
  if (isDirection(value)) emit('sort', props.sortKey, value)
  else emit('sort', value, props.sortDirection)
}

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
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) clipped.value = value
  // The sheet takes the screen: bring the header back under the top bar.
  if (value) void nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
}

let press: { y: number; at: number } | null = null
let last: { y: number; at: number } | null = null
let before: { y: number; at: number } | null = null

function onPress(event: PointerEvent): void {
  if ((event.target as Element).closest('[data-sheet-sort]')) return
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
</script>

<template>
  <div class="grid min-w-0 gap-5">
    <header class="grid gap-1.5 px-2 pbs-1">
      <h1
        id="investment-title"
        tabindex="-1"
        class="font-display text-[30px] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
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
    </header>

    <NeonEmptyState v-if="empty">
      Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
    </NeonEmptyState>

    <template v-else>
      <div
        role="group"
        aria-label="Cifras del periodo"
        aria-live="polite"
        class="grid min-w-0 gap-3"
        data-investment-figures
      >
        <div
          v-if="figures[0]"
          class="grid min-w-0 content-start gap-1 px-2"
          :data-investment-figure="figures[0].key"
        >
          <span class="text-muted text-label tracking-label font-extrabold uppercase">
            {{ figures[0].label }}
          </span>
          <span
            class="font-display truncate text-[52px] leading-[1.05] font-bold tracking-[-0.035em] tabular-nums"
            :class="TONE_TEXT[figures[0].tone]"
          >
            {{ figures[0].value }}
          </span>
          <span
            v-if="figures[0].sub"
            class="text-delta font-extrabold"
            :class="TONE_TEXT[figures[0].tone]"
          >
            {{ figures[0].sub }}
          </span>
        </div>
        <dl class="border-line m-0 grid grid-cols-2 border-y">
          <div
            v-for="(figure, index) in figures.slice(1)"
            :key="figure.key"
            class="grid min-h-16 min-w-0 content-center gap-0.5 py-2.5 ps-2 pe-1.5"
            :class="index > 0 && 'ps-3.5 shadow-[inset_1px_0_0_var(--color-line)]'"
            :data-investment-figure="figure.key"
          >
            <dt class="text-muted text-meta">{{ figure.label }}</dt>
            <dd
              class="font-display m-0 truncate text-[17px] font-semibold tracking-[-0.02em] tabular-nums"
            >
              {{ figure.value }}
            </dd>
          </div>
        </dl>
      </div>

      <div
        class="grid min-w-0 transition-[grid-template-rows,opacity,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        :class="expanded ? 'invisible grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'"
        :inert="expanded ? '' : undefined"
        @transitionend="onCollapseEnd"
        :aria-hidden="expanded ? 'true' : undefined"
        data-investment-overview
      >
        <!-- Wider than the column by the page's padding, so the chart bleeds
             and the clipping of the collapse doesn't cut it. -->
        <div
          class="-mx-[clamp(16px,2.6vw,40px)] grid min-h-0 gap-4"
          :class="clipped && 'overflow-hidden'"
        >
          <NeonInvestmentCompactChart :chart="chart" />
          <NeonInvestmentControls
            class="mx-[clamp(16px,2.6vw,40px)]"
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
        class="bg-panel border-line rounded-sheet flex min-w-0 flex-col border transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        :class="expanded ? 'h-[max(22rem,calc(100dvh-27rem))]' : 'h-80'"
        aria-label="Posiciones"
        data-investment-positions
      >
        <div
          class="touch-none px-3"
          data-sheet-handle
          @pointerdown="onPress"
          @pointermove="onMove"
          @pointerup="onRelease"
          @pointercancel="onRelease"
        >
          <button
            type="button"
            class="outline-accent group grid h-11 w-full place-items-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2"
            :aria-expanded="expanded"
            :aria-label="
              expanded ? 'Reducir la lista de posiciones' : 'Ampliar la lista de posiciones'
            "
            data-sheet-grip
            @click="onGripClick"
          >
            <span class="bg-ctrl-line rounded-pill block h-1 w-9" aria-hidden="true"></span>
          </button>
          <div class="flex items-center justify-between gap-3 ps-1 pbe-1.5">
            <h2 class="text-block-title font-sans font-extrabold tracking-normal">Posiciones</h2>
            <NeonChoiceMenu
              data-sheet-sort
              :text="sortLabel(sortKey, sortDirection)"
              label="Ordenar por"
              :icon="SORT_ICON"
              :groups="sortGroups()"
              @select="onSort"
            />
          </div>
        </div>
        <ul class="m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain px-3 pbe-3">
          <li v-for="row in rows" :key="row.id" class="border-line border-t first:border-t-0">
            <button
              type="button"
              class="outline-accent flex min-h-16 w-full items-center gap-3 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.99]"
              :aria-label="row.openLabel"
              :data-investment-position="row.id"
              @click="emit('open', row.id)"
            >
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="text-row truncate font-bold">{{ row.name }}</span>
                <span class="text-muted text-meta flex min-w-0 items-center gap-2 truncate">
                  <span
                    v-if="row.symbol"
                    class="bg-panel2 text-text flex-none rounded-[8px] px-2 py-0.5 font-mono text-[12px] font-bold tracking-[0.04em]"
                  >
                    {{ row.symbol }}
                  </span>
                  <span class="truncate">{{ row.weight }} de la cartera</span>
                </span>
                <span class="text-meta truncate font-extrabold" :class="TONE_TEXT[row.changeTone]">
                  {{ row.change }} en el periodo
                </span>
              </span>
              <span class="grid flex-none justify-items-end gap-0.5 text-end">
                <span
                  class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
                >
                  {{ row.value }}
                </span>
                <span
                  class="text-meta font-extrabold whitespace-nowrap"
                  :class="TONE_TEXT[row.tone]"
                >
                  {{ row.gain }} · {{ row.ret }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <NeonInvestmentCards :cards="cards" />
    </template>
  </div>
</template>
