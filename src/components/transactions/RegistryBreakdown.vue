<script setup lang="ts">
import { computed, ref } from 'vue'

import AllocationBar from '../ui/AllocationBar.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import { TYPE_PLURAL, seriesColor } from './transaction-types'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { formatMonthName, formatPercent } from '../../lib/format'
import type { TransactionType } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

// The band's month split by category for one type at a time.
const movementsStore = useMovementsStore()
const ui = useUiStore().ui
const { formatMoney } = useMoneyFormatter()

const type = ref<TransactionType>('expense')
const options = (['expense', 'income', 'investment'] as const).map((value) => ({
  value,
  label: TYPE_PLURAL[value],
}))
const VERB: Record<TransactionType, string> = {
  expense: 'gastado',
  income: 'ingresado',
  investment: 'invertido',
}

const rows = computed(() =>
  movementsStore.breakdownFor(type.value).map((row) => ({
    ...row,
    color: seriesColor(movementsStore.orderedCategories(type.value).indexOf(row.category)),
  })),
)
const total = computed(() => rows.value.reduce((sum, row) => sum + row.amount, 0))
const summary = computed(() => {
  const count = rows.value.length
  return `${formatMoney(total.value)} ${VERB[type.value]} en ${count} ${count === 1 ? 'categoría' : 'categorías'}`
})
const segments = computed(() =>
  rows.value.map((row) => ({
    id: row.category,
    label: row.category,
    weight: row.share,
    color: row.color,
    detail: formatMoney(row.amount),
  })),
)
</script>

<template>
  <section
    class="border-line bg-panel shadow-soft grid gap-5 rounded-lg border px-4 py-6 sm:px-8"
    aria-labelledby="tx-breakdown-title"
    data-tx-breakdown
  >
    <header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="grid gap-1.5">
        <h3 id="tx-breakdown-title" class="font-display text-xl font-bold">
          {{ formatMonthName(ui.txFilterMonth) }} por categoría
        </h3>
        <p class="text-text-muted text-sm sm:text-base">{{ summary }}</p>
      </div>
      <SegmentedControl
        v-model="type"
        :options="options"
        label="Tipo del desglose"
        variant="soft"
        data-key="breakdown-type"
      />
    </header>
    <template v-if="rows.length">
      <AllocationBar
        :segments="segments"
        :label="`Reparto de ${TYPE_PLURAL[type].toLowerCase()} por categoría`"
      />
      <ul class="divide-line grid divide-y">
        <li
          v-for="row in rows"
          :key="row.category"
          class="flex items-center gap-3 py-3"
          :data-summary-type="type"
          :data-summary-category="row.category"
        >
          <span class="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              class="size-2.5 shrink-0 rounded-xs"
              :style="{ background: row.color }"
              aria-hidden="true"
            ></span>
            <span class="truncate">{{ row.category }}</span>
          </span>
          <span class="font-display tabular-nums" data-summary-amount>{{
            formatMoney(row.amount)
          }}</span>
          <span class="text-text-muted w-16 text-right text-sm tabular-nums">
            {{ formatPercent(row.share, { digits: 1 }) }}
          </span>
        </li>
      </ul>
    </template>
    <p v-else class="border-line text-text-muted rounded-md border border-dashed p-4 text-sm">
      Sin {{ TYPE_PLURAL[type].toLowerCase() }} en
      {{ formatMonthName(ui.txFilterMonth).toLowerCase() }}.
    </p>
  </section>
</template>
