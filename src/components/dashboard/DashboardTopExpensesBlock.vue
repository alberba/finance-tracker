<script setup lang="ts">
import DashboardBlock from './DashboardBlock.vue'
import type { DashboardTopExpenses } from '../../domain/dashboard/view-model'

// 02 · GASTO: the month's expense categories by amount, with a bar against
// the largest, their share of the total and how many movements they hold.
defineProps<{ expenses: DashboardTopExpenses }>()
defineEmits<{ navigate: [target: string] }>()

/** One color per rank, so the bars read apart from each other. */
const RANK_FILL = [
  'bg-(--chart-series-3)',
  'bg-(--chart-series-1)',
  'bg-(--chart-series-10)',
  'bg-(--chart-series-8)',
]
</script>

<template>
  <DashboardBlock
    kicker="02 · GASTO"
    title="Top gastos del mes"
    title-id="dashboard-expenses-title"
    :description="expenses.summary || undefined"
  >
    <p v-if="!expenses.items.length" class="text-text-muted py-2 text-sm">
      Sin gastos en este mes.
    </p>
    <ol v-else class="grid gap-4.5">
      <li
        v-for="(item, index) in expenses.items"
        :key="item.category"
        class="grid gap-2"
        data-top-expense
      >
        <div class="flex items-baseline gap-2.5">
          <span class="text-text-muted font-mono text-xs" aria-hidden="true">{{ item.rank }}</span>
          <span class="text-text-main min-w-0 grow truncate font-semibold">{{ item.category }}</span>
          <span class="font-display text-text-main font-medium tabular-nums">{{ item.amount }}</span>
          <span class="font-display text-text-muted w-13 text-right text-sm tabular-nums">
            {{ item.share }}
          </span>
        </div>
        <span class="bg-(--track-bg) h-2 overflow-hidden rounded-full" aria-hidden="true">
          <span
            class="block h-full rounded-full"
            :class="RANK_FILL[index % RANK_FILL.length]"
            :style="{ width: `${item.width}%` }"
          ></span>
        </span>
        <span class="text-text-muted text-sm">{{ item.detail }}</span>
      </li>
    </ol>
    <button
      type="button"
      class="text-primary focus-visible:outline-primary mt-auto inline-flex min-h-11 w-fit items-center text-sm font-semibold hover:underline focus-visible:outline-2"
      @click="$emit('navigate', 'budget')"
    >
      Ver presupuesto del mes
    </button>
  </DashboardBlock>
</template>
