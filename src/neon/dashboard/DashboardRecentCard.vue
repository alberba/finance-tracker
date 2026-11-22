<script setup lang="ts">
import { useEntrySheet } from '../../composables/useEntrySheet'
import type { SectionId, TransactionType } from '../../scripts/types'
import { categoryIcon } from '../ui/category-icons'
import NeonCard from '../ui/NeonCard.vue'
import NeonCategoryIcon from '../ui/NeonCategoryIcon.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFitList from '../ui/NeonFitList.vue'
import type { NeonDashboardViewModel } from './view-model'

// Movimientos: the month's latest movements (DESIGN.md, Fila de libro mayor).
// Filtering by type lives in the Movimientos section.
defineProps<{ recent: NeonDashboardViewModel['recent'] }>()
const emit = defineEmits<{ navigate: [section: SectionId] }>()
const { openEntrySheet } = useEntrySheet()

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
      <li
        v-for="item in recent.items"
        :key="item.id"
        class="border-line flex min-h-16 items-center gap-3 border-t py-2.5"
      >
        <NeonCategoryIcon :path="categoryIcon(item.type, item.category)" />
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
    </NeonFitList>
  </NeonCard>
</template>
