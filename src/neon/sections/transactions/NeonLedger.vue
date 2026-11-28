<script setup lang="ts">
import { computed, ref } from 'vue'

import { categoryIcon } from '../../ui/category-icons'
import { rowDelay, rowEnter, rowLeave } from '../../ui/row-motion'
import type { AmountTone, LedgerMonthView } from './registry-view-model'
import NeonButton from '../../ui/NeonButton.vue'

// The registry's ledger (DESIGN.md, «Fila de libro mayor»): one card per month
// shown, its rows grouped by day with the day's net. `flat` is the phone
// (DESIGN.md, «Movimientos en móvil»): no card, edge to edge, and each day's
// label stays under the top bar while its rows scroll, without the net. Each row is a button that
// opens the movement's detail; the open one carries the selected inset line.
// Older months fold behind one button (the domain's folding rule). While
// selecting, each row is a checkbox and its icon turns into the check.
const props = defineProps<{
  months: LedgerMonthView[]
  /** The month whose card leaves its title to screen readers (the phone's month line shows it). */
  untitledMonth?: number
  /** The unfold button's text, or empty when nothing is folded. */
  olderLabel: string
  /** The movement whose detail is open. */
  openId: string | null
  /** Selecting rows for a bulk action: a row toggles instead of opening. */
  selecting?: boolean
  selectedIds?: readonly string[]
  staggerRows: boolean
  flat?: boolean
}>()

const emit = defineEmits<{
  open: [id: string, trigger: HTMLElement]
  toggle: [id: string]
  /** The row's icon was pressed: select it and enter the selection. */
  select: [id: string]
  showOlder: []
}>()

function isSelected(id: string): boolean {
  return Boolean(props.selecting && props.selectedIds?.includes(id))
}

function press(id: string, trigger: HTMLElement): void {
  if (props.selecting) emit('toggle', id)
  else emit('open', id, trigger)
}

const TONE: Record<AmountTone, string> = {
  gain: 'text-gain',
  lilac: 'text-lilac',
  text: 'text-text',
}

// Where each row stands in the ledger, top to bottom: the first rows come in
// one after another (`anim-row`); one added or removed later opens or folds
// its room (row-motion.ts).
const rowOrder = computed(() => {
  const order = new Map<string, number>()
  for (const month of props.months)
    for (const day of month.days) for (const row of day.rows) order.set(row.id, order.size)
  return order
})

// Entering the selection from a row's icon turns every other icon into an
// empty checkbox in a wave that starts at that row, 28ms a row, capped so the
// farthest rows do not wait. Leaving it, all turn back at once.
const pickOrigin = ref<string | null>(null)

function pickFrom(id: string): void {
  pickOrigin.value = id
  emit('select', id)
}

function pickDelay(id: string): number {
  if (!props.selecting || !pickOrigin.value) return 0
  const from = rowOrder.value.get(pickOrigin.value) ?? 0
  const distance = Math.abs((rowOrder.value.get(id) ?? 0) - from)
  return Math.min(distance, 12) * 28
}

const CHIP_TONE: Record<string, string> = {
  expense: 'text-soft',
  income: 'text-gain',
  saving: 'text-peach',
  investment: 'text-lilac',
}
</script>

<template>
  <div class="grid min-w-0 gap-4" data-tx-ledger>
    <section
      v-for="month in months"
      :key="month.month"
      class="min-w-0"
      :class="flat ? '-mx-4' : 'bg-panel border-line rounded-card overflow-hidden border'"
      :aria-labelledby="`tx-month-${month.month}`"
      data-ledger-month
    >
      <header
        :class="[month.month === untitledMonth && 'sr-only', flat ? 'px-4' : 'px-3.5']"
        class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pbs-[18px] pbe-1.5 @min-[560px]/registry:px-6"
      >
        <h2 :id="`tx-month-${month.month}`" class="text-[18px] font-extrabold">
          {{ month.title }}
        </h2>
        <p class="text-muted text-[14px] font-bold">
          {{ month.count }} · neto
          <span class="font-display font-semibold whitespace-nowrap tabular-nums">{{
            month.net
          }}</span>
        </p>
      </header>
      <div v-for="day in month.days" :key="day.date" role="group" :aria-label="day.label">
        <div
          class="flex items-baseline justify-between gap-3 pbs-3.5 pbe-1.5 @min-[560px]/registry:px-6"
          :class="
            flat
              ? 'bg-bg sticky inset-bs-[calc(64px+env(safe-area-inset-top,0px))] z-10 px-4'
              : 'px-3.5'
          "
          aria-hidden="true"
        >
          <span class="text-muted text-label tracking-label font-extrabold uppercase">
            {{ day.label }}
          </span>
          <span v-if="!flat" class="text-muted text-[14px] font-bold whitespace-nowrap">
            Neto
            <span class="font-display font-semibold tabular-nums">{{ day.net }}</span>
          </span>
        </div>
        <TransitionGroup :css="false" @enter="rowEnter" @leave="rowLeave">
          <div v-for="(row, index) in day.rows" :key="row.id" class="relative">
            <button
              type="button"
              class="neon-ledger-row border-line text-text outline-accent grid min-h-16 w-full items-center gap-3 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-[background-color,box-shadow] motion-safe:duration-200 motion-safe:ease-out @min-[560px]/registry:px-6"
              :style="
                staggerRows
                  ? { animationDelay: `${rowDelay(rowOrder.get(row.id) ?? 0)}ms` }
                  : undefined
              "
              :class="[
                { 'motion-safe:animate-row': staggerRows },
                flat ? 'px-4' : 'border-t px-3.5',
                // Edge to edge, the line between rows keeps the 16px margin.
                flat &&
                  index > 0 &&
                  'bg-[linear-gradient(var(--color-line),var(--color-line))] bg-size-[calc(100%-2rem)_1px] bg-top bg-no-repeat',
                openId === row.id || isSelected(row.id)
                  ? 'bg-panel2 shadow-[inset_3px_0_0_var(--color-accent)]'
                  : 'hover:bg-panel2/60',
              ]"
              :aria-label="row.label"
              :role="selecting ? 'checkbox' : undefined"
              :aria-checked="selecting ? isSelected(row.id) : undefined"
              :aria-haspopup="selecting ? undefined : 'dialog'"
              :data-tx-id="row.id"
              @click="press(row.id, $event.currentTarget as HTMLElement)"
            >
              <span
                class="neon-pick grid size-10 *:col-start-1 *:row-start-1"
                :class="{ 'is-selecting': selecting, 'is-selected': isSelected(row.id) }"
                :style="{ '--pick-delay': `${pickDelay(row.id)}ms` }"
                aria-hidden="true"
                :data-tx-check="selecting ? '' : undefined"
              >
                <span
                  class="neon-pick-chip bg-panel2 grid place-items-center rounded-full"
                  :class="CHIP_TONE[row.type]"
                >
                  <svg
                    class="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path :d="categoryIcon(row.type, row.category)" />
                  </svg>
                </span>
                <span class="neon-pick-ring border-ctrl-line rounded-full border-2"></span>
                <span
                  class="neon-pick-fill bg-accent text-on-accent grid place-items-center rounded-full"
                >
                  <svg
                    class="size-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path class="neon-pick-check" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              </span>
              <span class="grid min-w-0 gap-0.5">
                <span class="truncate text-[16px] font-bold" data-tx-description>
                  {{ row.description }}
                </span>
                <span class="text-muted truncate text-[13px]">
                  {{ row.meta }}
                  <template v-if="row.remote"> · Bitvavo</template>
                </span>
              </span>
              <span class="neon-ledger-category text-soft truncate text-[15px]">{{
                row.category
              }}</span>
              <span
                class="font-display text-end text-[17px] font-semibold whitespace-nowrap tabular-nums"
                :class="TONE[row.tone]"
                data-tx-amount
              >
                {{ row.amount }}
              </span>
            </button>
            <!-- Over the row's icon: pressing it selects the row and enters the
               selection (no «Seleccionar» button). While selecting the whole
               row toggles, so it steps aside. -->
            <button
              v-if="!selecting"
              type="button"
              class="group/pick outline-accent absolute inset-bs-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:active:scale-[0.94] @min-[560px]/registry:inset-s-5.5"
              :class="flat ? 'inset-s-3.5' : 'inset-s-3'"
              :aria-label="`Seleccionar ${row.description}`"
              data-tx-pick
              @click="pickFrom(row.id)"
            >
              <span
                class="bg-panel border-ctrl-line text-soft grid size-10 place-items-center rounded-full border-2 opacity-0 group-focus-visible/pick:opacity-100 motion-safe:transition-opacity motion-safe:duration-140 pointer-fine:group-hover/pick:opacity-100"
                aria-hidden="true"
              >
                <svg
                  class="size-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
            </button>
          </div>
        </TransitionGroup>
      </div>
    </section>
    <NeonButton
      v-if="olderLabel"
      class="justify-self-center"
      data-tx-show-older
      @click="emit('showOlder')"
    >
      {{ olderLabel }}
    </NeonButton>
  </div>
</template>

<style scoped>
/* Selecting rows. Resting: the category chip. Selecting: the chip shrinks
   away and the ring of a checkbox comes in its place, after the row's wave
   delay. Selected: the accent fill opens from the centre over the ring and the
   check draws itself. Without motion the layers swap by opacity. */
.neon-pick-ring,
.neon-pick-fill {
  opacity: 0;
}

.neon-pick.is-selecting .neon-pick-chip {
  opacity: 0;
}

.neon-pick.is-selecting .neon-pick-ring,
.neon-pick.is-selected .neon-pick-fill {
  opacity: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .neon-pick-chip,
  .neon-pick-ring {
    transition:
      opacity 180ms var(--ease-out),
      scale 260ms var(--ease-out);
  }

  .neon-pick.is-selecting .neon-pick-chip,
  .neon-pick.is-selecting .neon-pick-ring {
    transition-delay: var(--pick-delay, 0ms);
  }

  .neon-pick.is-selecting .neon-pick-chip,
  .neon-pick-ring {
    scale: 0.6;
  }

  .neon-pick.is-selecting .neon-pick-ring {
    scale: 1;
  }

  .neon-pick-fill {
    opacity: 1;
    clip-path: circle(0);
    transition: clip-path 160ms var(--ease-out);
  }

  .neon-pick.is-selected .neon-pick-fill {
    clip-path: circle(20px);
    transition-duration: 240ms;
  }

  .neon-pick-check {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    transition: stroke-dashoffset 120ms var(--ease-out);
  }

  .neon-pick.is-selected .neon-pick-check {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 220ms var(--ease-out) 90ms;
  }
}
/* The category column only fits when the ledger is wide (container query on
   the section's content column). */
.neon-ledger-row {
  grid-template-columns: 40px minmax(0, 1fr) auto;
}

.neon-ledger-category {
  display: none;
}

@container registry (min-width: 720px) {
  .neon-ledger-row {
    grid-template-columns: 40px minmax(0, 1fr) 180px 170px;
  }

  .neon-ledger-category {
    display: block;
  }
}
</style>
