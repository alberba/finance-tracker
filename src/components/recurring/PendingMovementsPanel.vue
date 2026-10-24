<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import PendingEditPanel from './PendingEditPanel.vue'
import BaseButton from '../ui/BaseButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import { TONE_TEXT } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { formatDayMonth, formatDueLabel } from '../../lib/format'
import type { PendingMovement } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'

// Pending movements from recurring rules: the review block of the Movimientos
// registry, where each one is confirmed, skipped, edited or discarded (the
// store's cancelled status; "Cancelar" would clash with the dialog's button).

const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const { formatMovementAmount } = useMoneyFormatter()
const editPanel = useTemplateRef<InstanceType<typeof PendingEditPanel>>('editPanel')
const pending = computed(() => recurringStore.openPendingMovements)
const pendingCancel = ref<PendingMovement | null>(null)
const confirmOpen = computed({
  get: () => pendingCancel.value !== null,
  set: (value: boolean) => {
    if (!value) pendingCancel.value = null
  },
})

function confirmCancel(): void {
  if (pendingCancel.value) recurringStore.cancelPending(pendingCancel.value.id)
}

const accountNames = computed(
  () =>
    new Map(
      [...financialStateStore.accounts, ...financialStateStore.investmentAssets].map((item) => [
        item.id,
        item.name,
      ]),
    ),
)

function meta(item: PendingMovement): string {
  const operation =
    item.type === 'investment' && item.symbol
      ? ` · ${item.units} × ${item.unitPrice} ${item.symbol}`
      : ''
  return `${item.category}${operation}`
}

const columns: LedgerColumn<PendingMovement>[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'movement', label: 'Movimiento', rowHeader: true },
  {
    key: 'account',
    label: 'Cuenta',
    hideBelow: 'md',
    value: (item) => accountNames.value.get(item.accountId) ?? item.accountId,
  },
  { key: 'amount', label: 'Importe', align: 'right' },
  { key: 'actions', label: 'Acciones', align: 'right' },
]
</script>

<template>
  <section
    v-if="pending.length"
    class="border-line bg-panel shadow-soft grid gap-4 rounded-lg border px-4 py-5 sm:px-8 sm:py-6"
    aria-labelledby="pending-title"
    data-pending-panel
  >
    <header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="grid gap-1.5">
        <h3 id="pending-title" class="font-display flex items-center gap-2.5 text-xl font-bold">
          <span class="bg-accent size-2.5 rounded-full" aria-hidden="true"></span>
          Pendientes de revisar
          <span class="text-text-muted text-base font-medium tabular-nums">
            {{ recurringStore.pendingCount }}
          </span>
        </h3>
        <p class="text-text-muted text-sm sm:text-base">
          Los generan tus reglas recurrentes. No cuentan en saldos ni en patrimonio hasta que los
          confirmes.
        </p>
      </div>
      <BaseButton variant="ghost" @click="recurringStore.refreshPending()">
        Buscar vencimientos
      </BaseButton>
    </header>

    <LedgerTable
      :columns="columns"
      :rows="pending"
      :row-key="(item) => item.id"
      label="Movimientos pendientes de revisar"
      :row-attrs="(item) => ({ 'data-pending-item': item.id })"
    >
      <template #cell-date="{ row }">
        <span class="grid gap-0.5">
          <span class="tabular-nums">{{ formatDayMonth(row.occurrenceDate) }}</span>
          <span class="text-text-muted text-xs">{{
            formatDueLabel(row.occurrenceDate, todayISO())
          }}</span>
        </span>
      </template>
      <template #cell-movement="{ row }">
        <span class="grid gap-0.5">
          <span class="font-semibold">{{ row.description }}</span>
          <span class="text-text-muted text-sm">{{ meta(row) }}</span>
        </span>
      </template>
      <template #cell-amount="{ row }">
        <span
          class="font-display tabular-nums"
          :class="row.type === 'income' ? TONE_TEXT.gain : 'text-text-main'"
        >
          {{ formatMovementAmount(row) }}
        </span>
      </template>
      <template #cell-actions="{ row }">
        <span class="flex items-center justify-end gap-1">
          <BaseButton
            variant="primary"
            :aria-label="`Confirmar ${row.description}`"
            @click="recurringStore.confirmPending(row.id)"
          >
            Confirmar
          </BaseButton>
          <BaseButton
            variant="ghost"
            :aria-label="`Saltar este vencimiento de ${row.description}`"
            @click="recurringStore.skipPending(row.id)"
          >
            Saltar
          </BaseButton>
          <IconButton
            icon="edit"
            :label="`Editar ${row.description} antes de confirmar`"
            @click="editPanel?.openFor(row)"
          />
          <IconButton
            icon="trash"
            tone="danger"
            :label="`Descartar el pendiente ${row.description}`"
            @click="pendingCancel = row"
          />
        </span>
      </template>
    </LedgerTable>
    <PendingEditPanel ref="editPanel" />
    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Descartar este pendiente?"
      title-id="pending-cancel-title"
      confirm-label="Descartar pendiente"
      @confirm="confirmCancel"
    >
      <template v-if="pendingCancel">
        {{ pendingCancel.description }} del {{ formatDayMonth(pendingCancel.occurrenceDate) }} por
        {{ formatMovementAmount(pendingCancel) }}. No se apunta en el Registro ni vuelve a aparecer;
        la regla sigue con los próximos vencimientos.
      </template>
    </ConfirmDialog>
  </section>
</template>
