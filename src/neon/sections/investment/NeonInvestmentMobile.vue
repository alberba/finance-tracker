<script setup lang="ts">
import { computed, ref } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import type { ReturnMode } from '../../../domain/investment/view-model'
import type { InvestmentGrouping } from '../../../lib/investment-grouping'
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { listSheetGesture, releaseVelocity } from '../../ui/sheet-drag'
import {
  groupingOptions,
  groupingTitle,
  type InstrumentRow,
  type TypeSection,
} from './cover-groups'
import NeonInvestmentCardRows from './NeonInvestmentCardRows.vue'
import NeonInvestmentCompactChart from './NeonInvestmentCompactChart.vue'
import {
  type Card,
  type CompactChart,
  type LeadFigure,
  type AccountRow,
  type QuoteNotice,
  TONE_TEXT,
  type Tone,
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
// here. The sheet's list follows the grouping the user chose (#562): accounts,
// instruments, or instruments under a heading per type.
const props = defineProps<{
  empty: boolean
  notice: QuoteNotice | null
  /** What the lead figure is worth «at»: «Vale hoy», «Valía a 31 mar 2026». */
  valueLabel: string
  /** The lead figure of a point of the chart, or of the period's close when null. */
  leadAt: (index: number | null) => LeadFigure
  chart: CompactChart
  method: ReturnMode
  /** Today's return under each method, for the method menu. */
  returns: Record<ReturnMode, { text: string; tone: Tone }>
  grouping: InvestmentGrouping
  rows: readonly AccountRow[]
  instruments: readonly InstrumentRow[]
  sections: readonly TypeSection[]
  cards: readonly Card[]
  /** The cover is coming in: the rows follow the sheet (see the section). */
  entering: boolean
}>()

// The rows come in with the sheet, 25ms apart (`anim-row`), only while
// the cover comes in: a row that moves later just moves.
const rowAt = (index: number) => 100 + Math.min(index, 8) * 25

const emit = defineEmits<{
  open: [id: string]
  method: [method: ReturnMode]
  group: [grouping: InvestmentGrouping]
}>()

const hot = ref<number | null>(null)
const lead = computed(() => props.leadAt(hot.value))

// How the return is measured is the tail of the gain line: «sobre lo aportado ▾»
// or «por tiempo (TWR) ▾», a link that opens the two options, each with what
// it measures and what it gives today, so the choice is made seeing both.
const methodGroups = computed<ChoiceGroup<ReturnMode>[]>(() => [
  {
    key: 'method',
    value: props.method,
    options: [
      {
        value: 'simple',
        label: 'Sobre lo aportado',
        hint: 'Lo que has ganado con el dinero que has puesto.',
        figure: props.returns.simple.text,
        figureClass: TONE_TEXT[props.returns.simple.tone],
      },
      {
        value: 'twr',
        label: 'Por tiempo (TWR)',
        hint: 'Cómo lo han hecho tus inversiones, sin contar cuándo aportaste. Se compara con un fondo.',
        figure: props.returns.twr.text,
        figureClass: TONE_TEXT[props.returns.twr.tone],
      },
    ],
  },
])

// What the sheet lists: rows, and for the type grouping a heading before each type's rows.
type Row = AccountRow | InstrumentRow
type Item =
  { kind: 'heading'; id: string; section: TypeSection } | { kind: 'row'; id: string; row: Row }
const items = computed<Item[]>(() => {
  const asRow = (row: Row): Item => ({ kind: 'row', id: row.id, row })
  if (props.grouping === 'account') return props.rows.map(asRow)
  if (props.grouping === 'instrument') return props.instruments.map(asRow)
  return props.sections.flatMap((section) => [
    { kind: 'heading' as const, id: `type:${section.id}`, section },
    ...section.rows.map(asRow),
  ])
})

// The short weight bar of each row, against the largest position.
const maxWeight = computed(() =>
  Math.max(1, ...items.value.flatMap((item) => (item.kind === 'row' ? [item.row.weightPct] : []))),
)

const groupingGroups = computed<ChoiceGroup<InvestmentGrouping>[]>(() => [
  { key: 'grouping', options: groupingOptions(), value: props.grouping },
])
const groupingText = computed(
  () =>
    `Por ${groupingOptions()
      .find((option) => option.value === props.grouping)
      ?.label.toLowerCase()}`,
)
const typeLabel = (row: Row): string | null => ('typeLabel' in row ? row.typeLabel : null)

// Each card at the foot of the sheet reads as one figure: its first row, with
// the last one under it («Recuperación · 3 meses»). A card of a single row
// (no fall worth telling) gives that row's label instead.
const tiles = computed(() =>
  props.cards.map((card) => {
    const [first, ...rest] = card.rows
    const last = rest.at(-1)
    return {
      id: card.id,
      title: card.title,
      value: first?.value ?? '—',
      tone: first?.tone ?? 'neutral',
      note: last ? `${last.label} · ${last.value}` : (first?.label ?? ''),
    }
  }),
)
const ARROW_UP = 'M7 17L17 7M8 7h9v9'
const ARROW_DOWN = 'M7 7l10 10M17 8v9H8'

// The sheet's two heights. Open, the chart and the pills go away.
const expanded = ref(false)
// The block that goes away is clipped while it shrinks or grows, and not
// otherwise, so the pills' menus can open over what is under them.
const clipped = ref(false)
const motion = useMediaQuery('(prefers-reduced-motion: no-preference)')

function onCollapseEnd(event: TransitionEvent): void {
  if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows') {
    clipped.value = expanded.value
  }
}

function setExpanded(value: boolean): void {
  if (value === expanded.value) return
  expanded.value = value
  clipped.value = value || motion.value
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
    <h1 id="investment-title" tabindex="-1" class="sr-only">Inversión</h1>
    <NeonEmptyState>
      Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
    </NeonEmptyState>
  </div>

  <!-- The screen is as tall as what is left between the bars, so the sheet ends
       right on the bottom bar: the page's top padding is taken back, and its
       bottom one (which clears the bar) all but, so the frame's grid, which
       stretches its rows when it is shorter than the window, doesn't grow the
       top bar. The title is in the top bar (NeonBarTitle); the heading here is
       for screen readers and focus. -->
  <div
    v-else
    class="-mt-[clamp(18px,2.6vw,36px)] -mb-5 flex h-[calc(100dvh-144px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-136 min-w-0 flex-col"
  >
    <h1 id="investment-title" tabindex="-1" class="sr-only">Inversión</h1>
    <header
      class="motion-safe:animate-rise pointer-events-none relative z-10 grid grid-cols-[minmax(0,1fr)_auto] px-2 pbs-1"
    >
      <div
        class="col-span-full row-start-1 grid gap-0.5"
        role="group"
        aria-label="Cifras del periodo"
        aria-live="polite"
        data-investment-figures
        data-investment-figure="return"
      >
        <span class="text-muted text-note font-bold">{{ lead.when ?? valueLabel }}</span>
        <span
          class="font-display text-[clamp(1.75rem,11.5cqi,2.75rem)] leading-[1.05] font-bold tracking-[-0.04em] wrap-anywhere tabular-nums"
          data-investment-value
        >
          {{ lead.value }}
        </span>
        <span
          class="text-note relative flex flex-wrap items-center gap-x-1.5 font-extrabold"
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
          <template v-if="lead.gain">{{ lead.gain }} ·</template>
          {{ lead.ret }}
          <NeonChoiceMenu
            class="text-soft pointer-events-auto font-bold"
            look="link"
            placement="row-start"
            :text="method === 'twr' ? 'por tiempo (TWR)' : 'sobre lo aportado'"
            label="Cómo medir la rentabilidad"
            :groups="methodGroups"
            @select="(_, value) => emit('method', value)"
          />
        </span>
      </div>
      <p
        v-if="notice"
        class="text-meta col-start-2 row-start-1 m-0 inline-flex items-center gap-2 self-start pbs-0.5 font-bold whitespace-nowrap"
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
        {{ notice.short }}
      </p>
    </header>

    <div
      class="grid flex-none motion-safe:transition-[grid-template-rows,opacity,visibility,margin] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]"
      :class="expanded ? 'invisible mbs-0 grid-rows-[0fr] opacity-0' : '-mbs-6 grid-rows-[1fr]'"
      :inert="expanded ? true : undefined"
      :aria-hidden="expanded ? 'true' : undefined"
      data-investment-overview
      @transitionend="onCollapseEnd"
    >
      <!-- Wider than the column by the page's padding, so the chart bleeds and
           the clipping of the collapse doesn't cut it. -->
      <div class="grid min-h-0 gap-1 pbe-3" :class="[BLEED, clipped && 'overflow-clip']">
        <NeonInvestmentCompactChart
          v-model:hot="hot"
          class="motion-safe:animate-rise motion-safe:[animation-delay:50ms]"
          :chart="chart"
          :when="lead.when"
        />
      </div>
    </div>

    <section
      class="bg-panel rounded-t-sheet motion-safe:animate-rise flex min-h-0 flex-1 flex-col px-4 pbe-3.5 motion-safe:[animation-delay:100ms]"
      :class="BLEED"
      aria-labelledby="investment-accounts-title"
      data-investment-accounts
    >
      <!-- The whole head drags the sheet; the grip is its button. -->
      <div
        class="-mx-4 grid touch-none px-4 pbe-1.5"
        data-sheet-handle
        @pointerdown="onPress"
        @pointermove="onMove"
        @pointerup="onRelease"
        @pointercancel="onRelease"
      >
        <button
          type="button"
          class="outline-accent grid min-h-11 w-full place-items-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2"
          :aria-expanded="expanded"
          :aria-label="expanded ? 'Reducir la lista' : 'Ampliar la lista'"
          data-sheet-grip
          @click="onGripClick"
        >
          <span class="bg-ctrl-line rounded-pill block h-1 w-9" aria-hidden="true"></span>
        </button>
        <div class="flex items-center justify-between gap-3">
          <h2 id="investment-accounts-title" class="text-block-title m-0 font-extrabold">
            {{ groupingTitle(grouping) }}
          </h2>
          <!-- The menu is not part of the drag: a press on it does not move the sheet. -->
          <div @pointerdown.stop @pointerup.stop @pointermove.stop @pointercancel.stop>
            <NeonChoiceMenu
              :text="groupingText"
              label="Agrupar por"
              :groups="groupingGroups"
              data-investment-grouping-menu
              @select="(_, value) => emit('group', value)"
            />
          </div>
        </div>
      </div>
      <ul
        class="m-0 min-h-0 flex-1 [scrollbar-width:none] list-none overflow-y-auto overscroll-contain p-0"
      >
        <template v-for="(item, index) in items" :key="item.id">
          <li
            v-if="item.kind === 'heading'"
            class="border-line flex items-baseline justify-between gap-3 border-bs pbs-3 pbe-1"
            :data-investment-type="item.section.id"
          >
            <h3 class="text-muted text-label tracking-label m-0 font-extrabold uppercase">
              {{ item.section.title }}
            </h3>
            <span class="text-meta flex items-baseline gap-2 font-bold whitespace-nowrap">
              <span class="text-soft tabular-nums">{{ item.section.summary.weight }}</span>
              <span class="font-display tabular-nums">{{ item.section.summary.value }}</span>
              <span class="tabular-nums" :class="TONE_TEXT[item.section.summary.tone]">
                {{ item.section.summary.gain }}
              </span>
            </span>
          </li>
          <li
            v-else
            class="border-line border-bs last:border-be"
            :class="entering && 'motion-safe:animate-row'"
            :style="entering ? { animationDelay: `${rowAt(index)}ms` } : undefined"
          >
            <button
              type="button"
              class="outline-accent grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto_3.6rem] items-baseline gap-x-2.5 gap-y-1 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.99]"
              :aria-label="item.row.openLabel"
              :data-investment-account="grouping === 'account' ? item.row.id : undefined"
              :data-investment-instrument="grouping === 'account' ? undefined : item.row.id"
              @click="emit('open', item.row.id)"
            >
              <span class="text-row min-w-0 truncate font-bold">
                {{ item.row.name }}
                <span v-if="typeLabel(item.row)" class="text-muted text-meta font-bold">
                  {{ typeLabel(item.row) }}
                </span>
              </span>
              <span
                class="font-display text-figure-row col-span-2 text-end font-semibold whitespace-nowrap tabular-nums"
              >
                {{ item.row.value }}
              </span>
              <span class="text-meta flex min-w-0 items-center gap-2">
                <span v-if="item.row.holdings" class="text-muted font-bold">
                  {{ item.row.holdings }}
                </span>
                <span class="bg-line rounded-pill h-[3px] w-11 flex-none" aria-hidden="true">
                  <span
                    class="bg-neutral-bar rounded-pill block h-full"
                    :style="{ inlineSize: `${(item.row.weightPct / maxWeight) * 100}%` }"
                  ></span>
                </span>
                <span class="text-soft font-extrabold">{{ item.row.weight }}</span>
              </span>
              <span
                class="text-meta text-end font-extrabold whitespace-nowrap tabular-nums"
                :class="TONE_TEXT[item.row.tone]"
              >
                {{ item.row.gain }}
              </span>
              <span
                class="text-meta text-end font-bold whitespace-nowrap tabular-nums"
                :class="TONE_TEXT[item.row.tone]"
              >
                {{ item.row.ret }}
              </span>
            </button>
          </li>
        </template>
      </ul>
      <!-- The worst fall and the fees, one figure each; a tap opens its panel. -->
      <div class="grid flex-none grid-cols-2 gap-2 pbs-2.5">
        <button
          v-for="tile in tiles"
          :key="tile.id"
          type="button"
          class="bg-panel2 outline-accent rounded-tile grid min-h-16 min-w-0 content-start gap-0.5 px-3.5 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          :aria-label="tile.title"
          aria-haspopup="dialog"
          @click="openCard(tile.id)"
        >
          <span class="text-muted text-meta flex items-center justify-between gap-2 font-bold">
            {{ tile.title }}
            <svg
              class="size-4 flex-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
          <span
            class="font-display text-[17px] leading-[1.2] font-semibold whitespace-nowrap tabular-nums"
            :class="TONE_TEXT[tile.tone]"
          >
            {{ tile.value }}
          </span>
          <span class="text-muted text-[12px] leading-[1.3] text-pretty">{{ tile.note }}</span>
        </button>
      </div>
    </section>
  </div>

  <NeonDetailPanel v-model:open="cardOpen" :title="shownCard?.title ?? ''" kicker="Inversión">
    <NeonInvestmentCardRows v-if="shownCard" :rows="shownCard.rows" />
  </NeonDetailPanel>
</template>
