<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn, type LedgerGroup } from '../ui/LedgerTable.vue'
import { TONE_TEXT } from '../ui/tone'
import { TYPE_LABEL, TYPE_TAG, seriesColor } from './transaction-types'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { signedAmount } from '../../domain/transactions/registry'
import { formatDayMonth, formatMonthName, formatMonthYear } from '../../lib/format'
import type { Transaction, TxSortColumn } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

// The year's movements as a ledger grouped by month, each month with its
// count and net. Older months fold away behind a button until asked for.
const props = defineProps<{
  /** Shows the selection checkboxes on small screens too. */
  selecting: boolean
}>()

const emit = defineEmits<{ edit: [tx: Transaction] }>()

const movementsStore = useMovementsStore()
const ui = useUiStore().ui
const { formatSignedMoney } = useMoneyFormatter()
const showOlder = ref(false)

watch(
  () => [ui.txYear, ui.txFilterMonth],
  () => {
    showOlder.value = false
  },
)

const filtering = computed(() => {
  const filters = ui.txFilters
  return Boolean(
    filters.search ||
    filters.types.length ||
    filters.accountIds.length ||
    filters.date ||
    filters.amountMin ||
    filters.amountMax,
  )
})

// The band's month and the one before it show (or the latest month with
// movements, when those two have none); older ones wait behind a button.
// While filtering, every match shows.
const split = computed(() => {
  const groups = movementsStore.monthGroups
  if (filtering.value || showOlder.value) return { shown: groups, hidden: [] }
  const cutoff = Math.min(ui.txFilterMonth - 1, groups[0]?.month ?? 0)
  return {
    shown: groups.filter((group) => group.month >= cutoff),
    hidden: groups.filter((group) => group.month < cutoff),
  }
})

const groups = computed<LedgerGroup<Transaction>[]>(() =>
  split.value.shown.map((group) => ({
    key: String(group.month),
    title: formatMonthYear(group.month, ui.txYear),
    summary: `${group.count} ${group.count === 1 ? 'movimiento' : 'movimientos'} · neto ${formatSignedMoney(group.net)}`,
    rows: group.rows,
  })),
)

const olderLabel = computed(() => {
  const hidden = split.value.hidden
  if (!hidden.length) return ''
  const count = hidden.reduce((sum, group) => sum + group.count, 0)
  return `Ver ${formatMonthName(hidden[0].month).toLowerCase()} y anteriores · ${count} movimientos`
})

const columns = computed<LedgerColumn<Transaction>[]>(() => [
  { key: 'select', label: 'Seleccionar', hideBelow: props.selecting ? undefined : 'sm' },
  { key: 'date', label: 'Fecha' },
  { key: 'description', label: 'Descripción', rowHeader: true },
  {
    key: 'account',
    label: 'Cuenta',
    hideBelow: 'md',
    value: (tx) => movementsStore.getAccountName(tx.accountId),
  },
  { key: 'type', label: 'Tipo', hideBelow: 'lg' },
  { key: 'amount', label: 'Importe', align: 'right' },
  { key: 'actions', label: 'Acciones', align: 'right' },
])

function categoryDot(tx: Transaction): string {
  return seriesColor(movementsStore.orderedCategories(tx.type).indexOf(tx.category))
}

function isSelected(tx: Transaction): boolean {
  return ui.txSelectedIds.includes(tx.id)
}

function sortLabel(column: TxSortColumn, name: string): string {
  if (ui.txSort.column !== column) return `Ordenar por ${name}`
  const order =
    column === 'date'
      ? ui.txSort.direction === 'desc'
        ? 'de más reciente a más antiguo'
        : 'de más antiguo a más reciente'
      : ui.txSort.direction === 'desc'
        ? 'de mayor a menor'
        : 'de menor a mayor'
  return `Ordenar por ${name}, ahora ${order}`
}

function sortGlyph(column: TxSortColumn): string {
  if (ui.txSort.column !== column) return ''
  return ui.txSort.direction === 'desc' ? '↓' : '↑'
}

const emptyText = computed(() =>
  movementsStore.yearCount
    ? `Ningún movimiento de ${ui.txYear} coincide con estos filtros.`
    : `Aún no hay movimientos en ${ui.txYear}.`,
)
</script>

<template>
  <section class="grid gap-3" :aria-label="`Movimientos de ${ui.txYear}`" data-tx-ledger>
    <LedgerTable
      :columns="columns"
      :groups="groups"
      :row-key="(tx) => tx.id"
      :label="`Movimientos de ${ui.txYear}`"
      :empty-text="emptyText"
      :row-attrs="(tx) => ({ 'data-tx-id': tx.id })"
      :row-class="(tx) => (isSelected(tx) ? 'bg-primary/8' : '')"
    >
      <template #head-select>
        <input
          id="tx-select-all"
          type="checkbox"
          class="accent-primary size-4.5"
          aria-label="Seleccionar todos los movimientos visibles"
          :checked="movementsStore.allVisibleSelected"
          @change="movementsStore.setAllSelected(($event.target as HTMLInputElement).checked)"
        />
      </template>
      <template #head-date>
        <button
          type="button"
          class="hover:text-text-main inline-flex min-h-11 items-center gap-1 uppercase"
          :aria-label="sortLabel('date', 'fecha')"
          @click="movementsStore.toggleSort('date')"
        >
          Fecha <span aria-hidden="true">{{ sortGlyph('date') }}</span>
        </button>
      </template>
      <template #head-amount>
        <button
          type="button"
          class="hover:text-text-main inline-flex min-h-11 items-center gap-1 uppercase"
          :aria-label="sortLabel('amount', 'importe')"
          @click="movementsStore.toggleSort('amount')"
        >
          Importe <span aria-hidden="true">{{ sortGlyph('amount') }}</span>
        </button>
      </template>

      <template #cell-select="{ row }">
        <input
          type="checkbox"
          class="accent-primary size-4.5"
          :data-select-tx-id="row.id"
          :checked="isSelected(row)"
          :aria-label="`Seleccionar ${row.description || row.category} del ${formatDayMonth(row.date)}`"
          @change="movementsStore.setSelected(row.id, ($event.target as HTMLInputElement).checked)"
        />
      </template>
      <template #cell-date="{ row }">
        <span class="text-text-muted whitespace-nowrap tabular-nums">{{
          formatDayMonth(row.date)
        }}</span>
      </template>
      <template #cell-description="{ row }">
        <span class="grid min-w-0 gap-0.5">
          <span class="font-semibold">{{ row.description || row.category || '—' }}</span>
          <span class="text-text-muted flex items-center gap-1.5 text-sm">
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ background: categoryDot(row) }"
              aria-hidden="true"
            ></span>
            {{ row.category || 'Sin categoría' }}
          </span>
        </span>
      </template>
      <template #cell-type="{ row }">
        <span class="rounded-full px-2.5 py-1 text-xs font-bold" :class="TYPE_TAG[row.type]">
          {{ TYPE_LABEL[row.type] }}
        </span>
      </template>
      <template #cell-amount="{ row }">
        <span
          class="font-display whitespace-nowrap tabular-nums"
          :class="row.type === 'income' ? TONE_TEXT.gain : 'text-text-main'"
          data-tx-amount
        >
          {{ formatSignedMoney(signedAmount(row)) }}
        </span>
      </template>
      <template #cell-actions="{ row }">
        <span class="flex justify-end">
          <IconButton
            icon="edit"
            :label="`Editar ${row.description || row.category} del ${formatDayMonth(row.date)}`"
            @click="emit('edit', row)"
          />
          <IconButton
            icon="trash"
            tone="danger"
            :label="`Eliminar ${row.description || row.category} del ${formatDayMonth(row.date)}`"
            :data-delete-id="row.id"
            @click="movementsStore.deleteTransaction(row.id)"
          />
        </span>
      </template>
    </LedgerTable>
    <BaseButton
      v-if="olderLabel"
      variant="ghost"
      class="justify-self-center"
      @click="showOlder = true"
    >
      {{ olderLabel }}
    </BaseButton>
  </section>
</template>
