<script setup lang="ts">
import { useEntrySheet } from '../../composables/useEntrySheet'
import type { SectionId, TransactionType } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import { RECENT_FILTERS, type NeonDashboardViewModel, type RecentFilter } from './view-model'

// Movimientos: the month's latest movements, filtered by type with chips
// (DESIGN.md, Chip de filtro and Fila de libro mayor).
defineProps<{ recent: NeonDashboardViewModel['recent'] }>()
const filter = defineModel<RecentFilter>('filter', { required: true })
const emit = defineEmits<{ navigate: [section: SectionId] }>()
const { openEntrySheet } = useEntrySheet()

const ICON: Record<TransactionType, string> = {
  expense: 'M12 5v14M19 12l-7 7-7-7',
  income: 'M12 19V5M5 12l7-7 7 7',
  investment: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  saving: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
}
const ICON_TEXT: Record<TransactionType, string> = {
  expense: 'text-text',
  income: 'text-gain',
  investment: 'text-lilac',
  saving: 'text-soft',
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
    <div role="group" aria-label="Filtrar movimientos" class="flex flex-wrap gap-1.5">
      <button
        v-for="option in RECENT_FILTERS"
        :key="option.value"
        type="button"
        :aria-pressed="filter === option.value"
        class="outline-accent rounded-pill text-meta min-h-9.5 border px-3.5 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
        :class="
          filter === option.value
            ? 'bg-sel-bg text-sel-text border-sel-bg'
            : 'border-ctrl-line text-soft'
        "
        @click="filter = option.value"
      >
        {{ option.label }}
      </button>
    </div>

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
    <ul v-else aria-label="Movimientos recientes">
      <li
        v-for="item in recent.items"
        :key="item.id"
        class="border-line flex min-h-16 items-center gap-3 border-t py-2.5"
      >
        <span
          class="bg-panel2 grid size-10 shrink-0 place-items-center rounded-full"
          :class="ICON_TEXT[item.type]"
          aria-hidden="true"
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
            <path :d="ICON[item.type]" />
          </svg>
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-row truncate font-bold">{{ item.description }}</span>
          <span class="text-muted text-meta truncate">{{ item.category }} · {{ item.date }}</span>
        </span>
        <span
          class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
          :class="AMOUNT_TEXT[item.type]"
        >
          {{ item.amount }}
        </span>
      </li>
    </ul>
  </NeonCard>
</template>
