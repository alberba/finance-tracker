<script setup lang="ts">
import { computed } from 'vue'

import type { WealthHistoryRow, WealthMonthViewModel } from '../../domain/wealth/view-model'
import { formatWholeAmount } from '../../lib/format'
import { monthIndex, type Month } from '../../lib/month'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import { GROUP_SWATCH } from './group-swatch'

// Every account month by month: accounts in rows (subtotal per group and a
// total), months in columns, rounded euros. Months without a saved snapshot
// read faint; a month header opens that month's snapshot. On mobile only the
// last three months show.
const props = defineProps<{
  rows: WealthHistoryRow[]
  months: WealthMonthViewModel[]
  /** Months shown, in order; indexes into each row's `values`. */
  shown: Month[]
}>()

const month = defineModel<Month>('month', { required: true })

const visible = computed(() => props.shown.map((shown) => props.months[monthIndex(shown)]))

const columns = computed<LedgerColumn<WealthHistoryRow>[]>(() => [
  { key: 'label', label: 'Cuenta o activo', rowHeader: true },
  ...visible.value.map((entry, position) => ({
    key: `m${entry.month}`,
    label: entry.label,
    align: 'right' as const,
    hideBelow: position < visible.value.length - 3 ? ('md' as const) : undefined,
  })),
])

const ROW_CLASS: Record<WealthHistoryRow['kind'], string> = {
  group: 'font-bold',
  item: 'text-sm',
  total: 'border-line-strong! font-bold',
}
</script>

<template>
  <LedgerTable
    :columns="columns"
    :rows="rows"
    :row-key="(row) => row.key"
    :row-class="(row) => ROW_CLASS[row.kind]"
    :row-attrs="(row) => ({ 'data-history-row': row.kind })"
    label="Saldo de cada cuenta por mes, en euros redondeados"
    empty-text="Aún no hay cuentas, activos ni deudas."
  >
    <template v-for="entry in visible" :key="entry.month" #[`head-m${entry.month}`]>
      <button
        type="button"
        class="hover:text-text-main focus-visible:outline-primary -my-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-1 tracking-[0.08em] uppercase focus-visible:outline-2"
        :class="entry.month === month ? 'text-text-main' : ''"
        :aria-pressed="entry.month === month"
        :aria-label="`Abrir el snapshot de ${entry.name}`"
        :data-history-month="entry.month"
        @click="month = entry.month"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="entry.saved ? 'bg-gain' : 'border-line-strong border-[1.5px]'"
          aria-hidden="true"
        ></span>
        {{ entry.label }}
      </button>
    </template>
    <template #cell-label="{ row }">
      <span class="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <span
          class="size-2 shrink-0 rounded-xs"
          :class="row.kind === 'group' && row.group ? GROUP_SWATCH[row.group] : ''"
          aria-hidden="true"
        ></span>
        {{ row.label }}
      </span>
    </template>
    <template
      v-for="(entry, position) in visible"
      :key="entry.month"
      #[`cell-m${entry.month}`]="{ row }"
    >
      <span
        class="font-display whitespace-nowrap tabular-nums"
        :class="[
          row.kind === 'item' && !entry.saved ? 'text-text-muted' : '',
          entry.month === month ? 'text-text-main' : '',
        ]"
        >{{ formatWholeAmount((row as WealthHistoryRow).values[position]) }}</span
      >
    </template>
  </LedgerTable>
</template>
