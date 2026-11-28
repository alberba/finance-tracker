<script setup lang="ts">
import { useEntrySheet } from '../../composables/useEntrySheet'
import { useMovementDetailRequest } from '../../composables/useMovementDetailRequest'
import type { SectionId, TransactionType } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFitList from '../ui/NeonFitList.vue'
import { rowDelay, rowEnter, rowLeave } from '../ui/row-motion'
import type { NeonDashboardViewModel } from './view-model'

// Movimientos: the month's latest movements, read like a bank statement
// (DESIGN.md, «Movimientos en el inicio»): the date sits in its own column once
// per day, and a gap separates days, not rows. No category icon: the category
// is already in words. Filtering by type lives in the Movimientos section.
defineProps<{ recent: NeonDashboardViewModel['recent'] }>()
const emit = defineEmits<{ navigate: [section: SectionId] }>()
const { openEntrySheet } = useEntrySheet()
const detail = useMovementDetailRequest()

// A row opens that movement in Movimientos, with its detail panel already open.
function open(id: string): void {
  detail.request(id)
  emit('navigate', 'transactions')
}

const AMOUNT_TEXT: Record<TransactionType, string> = {
  expense: 'text-text',
  income: 'text-gain',
  investment: 'text-text',
  saving: 'text-soft',
}
</script>

<template>
  <NeonCard
    title="Movimientos"
    title-id="dashboard-recent-title"
    :to="{ section: 'transactions', label: 'Ir a Movimientos' }"
    data-dashboard-recent
    @navigate="emit('navigate', $event)"
  >
    <NeonEmptyState v-if="!recent.items.length">
      {{ recent.empty }}
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
    <NeonFitList v-else aria-label="Movimientos recientes">
      <TransitionGroup :css="false" @enter="rowEnter" @leave="rowLeave">
        <li
          v-for="(item, index) in recent.items"
          :key="item.id"
          class="motion-safe:animate-row grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4"
          :class="item.newDay && 'not-first:mbs-3.5'"
          :style="{ animationDelay: `${rowDelay(index)}ms` }"
        >
          <span v-if="item.newDay" class="flex flex-col items-start pbs-2" aria-hidden="true">
            <span class="font-display text-figure-block font-semibold tabular-nums">{{
              item.day
            }}</span>
            <span class="text-muted text-label tracking-label mbs-0.5 font-extrabold uppercase">{{
              item.dayLabel
            }}</span>
          </span>
          <button
            type="button"
            class="outline-accent rounded-field hover:bg-panel2 col-start-2 -mx-3 flex min-h-14 w-[calc(100%+1.5rem)] cursor-pointer items-center gap-3 px-3 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-[background-color,transform] motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.985]"
            :aria-label="`${item.description}, ${item.amount}, ${item.date}. Ver el movimiento`"
            @click="open(item.id)"
          >
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-row truncate font-bold">{{ item.description }}</span>
              <span class="text-muted text-meta truncate">{{ item.category }}</span>
            </span>
            <span
              class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
              :class="AMOUNT_TEXT[item.type]"
            >
              {{ item.amount }}
            </span>
          </button>
        </li>
      </TransitionGroup>
    </NeonFitList>
  </NeonCard>
</template>
