<script setup lang="ts">
import { categoryIcon } from './category-icons'
import type { AmountTone, LedgerMonthView } from './registry-view-model'
import NeonButton from '../../ui/NeonButton.vue'

// The registry's ledger (DESIGN.md, «Fila de libro mayor»): one card per month
// shown, its rows grouped by day with the day's net. Each row is a button that
// opens the movement's detail; the open one carries the selected inset line.
// Older months fold behind one button (the domain's folding rule). While
// selecting, each row is a checkbox and its icon turns into the check.
const props = defineProps<{
  months: LedgerMonthView[]
  /** The unfold button's text, or empty when nothing is folded. */
  olderLabel: string
  /** The movement whose detail is open. */
  openId: string | null
  /** Selecting rows for a bulk action: a row toggles instead of opening. */
  selecting?: boolean
  selectedIds?: readonly string[]
}>()

const emit = defineEmits<{
  open: [id: string, trigger: HTMLElement]
  toggle: [id: string]
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
      class="bg-panel border-line rounded-card min-w-0 overflow-hidden border"
      :aria-labelledby="`tx-month-${month.month}`"
      data-ledger-month
    >
      <header
        class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-6 pbs-[18px] pbe-1.5"
      >
        <h2 :id="`tx-month-${month.month}`" class="text-[18px] font-extrabold">
          {{ month.title }}
        </h2>
        <p class="text-muted text-[14px] font-bold tabular-nums">{{ month.summary }}</p>
      </header>
      <div v-for="day in month.days" :key="day.date" role="group" :aria-label="day.label">
        <div
          class="flex items-baseline justify-between gap-3 px-6 pbs-3.5 pbe-1.5"
          aria-hidden="true"
        >
          <span class="text-muted text-label tracking-label font-extrabold uppercase">
            {{ day.label }}
          </span>
          <span class="text-muted text-[14px] font-bold whitespace-nowrap tabular-nums">
            {{ day.net }}
          </span>
        </div>
        <button
          v-for="row in day.rows"
          :key="row.id"
          type="button"
          class="neon-ledger-row border-line text-text outline-accent grid min-h-16 w-full items-center gap-3 border-t px-6 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-colors"
          :class="
            openId === row.id || isSelected(row.id)
              ? 'bg-panel2 shadow-[inset_3px_0_0_var(--color-accent)]'
              : 'hover:bg-panel2/60'
          "
          :aria-label="row.label"
          :role="selecting ? 'checkbox' : undefined"
          :aria-checked="selecting ? isSelected(row.id) : undefined"
          :aria-haspopup="selecting ? undefined : 'dialog'"
          :data-tx-id="row.id"
          @click="press(row.id, $event.currentTarget as HTMLElement)"
        >
          <span
            v-if="selecting"
            class="grid size-10 place-items-center rounded-full border-2"
            :class="
              isSelected(row.id)
                ? 'bg-accent border-accent text-on-accent'
                : 'border-ctrl-line text-transparent'
            "
            aria-hidden="true"
            data-tx-check
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
          <span
            v-else
            class="bg-panel2 grid size-10 place-items-center rounded-full"
            :class="CHIP_TONE[row.type]"
            aria-hidden="true"
          >
            <svg
              class="size-[19px]"
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
