<script setup lang="ts">
import DashboardBlock from './DashboardBlock.vue'
import { TONE_TEXT } from '../ui/tone'
import type { DashboardRecentTransaction } from '../../domain/dashboard/view-model'
import type { BudgetType } from '../../scripts/types'

// 04 · ÚLTIMOS: the latest movements as a compact list.
defineProps<{ transactions: DashboardRecentTransaction[] }>()
defineEmits<{ navigate: [target: string] }>()

const AVATAR: Record<BudgetType, string> = {
  income: 'bg-income/12 text-gain',
  expense: 'bg-expense/12 text-loss',
  investment: 'bg-invest/12 text-invest',
}
</script>

<template>
  <DashboardBlock
    kicker="04 · ÚLTIMOS"
    title="Movimientos recientes"
    title-id="dashboard-recent-title"
  >
    <template #actions>
      <button
        type="button"
        class="text-primary focus-visible:outline-primary inline-flex min-h-11 items-center text-sm font-semibold hover:underline focus-visible:outline-2"
        @click="$emit('navigate', 'transactions')"
      >
        Ver todos
      </button>
    </template>
    <p v-if="!transactions.length" class="text-text-muted py-2 text-sm">
      Sin movimientos registrados.
    </p>
    <ul v-else class="-mt-2.5 grid" aria-label="Últimos movimientos">
      <li
        v-for="transaction in transactions"
        :key="transaction.id"
        class="border-line flex min-h-14 items-center gap-3 border-t first:border-t-0"
        data-recent-transaction
      >
        <span
          class="font-display grid size-8.5 shrink-0 place-items-center rounded-md text-sm font-bold"
          :class="AVATAR[transaction.tone]"
          aria-hidden="true"
        >
          {{ transaction.initial }}
        </span>
        <span class="grid min-w-0 grow gap-0.5">
          <span class="text-text-main truncate font-semibold">{{ transaction.description }}</span>
          <span class="text-text-muted truncate text-sm">
            {{ transaction.date }} · {{ transaction.category }}
          </span>
        </span>
        <span
          class="font-display shrink-0 font-medium tabular-nums"
          :class="transaction.tone === 'income' ? TONE_TEXT.gain : 'text-text-main'"
        >
          {{ transaction.amount }}
        </span>
      </li>
    </ul>
  </DashboardBlock>
</template>
