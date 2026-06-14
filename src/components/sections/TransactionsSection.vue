<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

import AppSection from '../ui/AppSection.vue'
import TransactionBulkCard from '../transactions/TransactionBulkCard.vue'
import TransactionFormDialog from '../transactions/TransactionFormDialog.vue'
import TransactionSummary from '../transactions/TransactionSummary.vue'
import TransactionsTable from '../transactions/TransactionsTable.vue'
import { hasSelectionWithin } from '../../scripts/app/dom-helpers'
import { MONTHS } from '../../scripts/types'
import { parseIntSafe } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const ui = uiStore.ui

const sectionRef = useTemplateRef<InstanceType<typeof AppSection>>('appSection')
const dialogRef = ref<InstanceType<typeof TransactionFormDialog> | null>(null)

function onMonthChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  movementsStore.setMonth(parseIntSafe(value, ui.txFilterMonth))
}

function openModal(): void {
  dialogRef.value?.open()
}

// Close the open header filter popover on outside pointerdown, unless the
// pointer landed inside it or the user is selecting text within it.
function onDocumentPointerDown(event: PointerEvent): void {
  const column = ui.txOpenHeaderFilter
  if (!column) {
    return
  }
  const root = sectionRef.value?.el
  const popover = root?.querySelector<HTMLElement>(`.tx-filter-popover[data-column="${column}"]`)
  const target = event.target instanceof Element ? event.target : null
  if (popover && target && popover.contains(target)) {
    return
  }
  if (popover && hasSelectionWithin(popover)) {
    return
  }
  movementsStore.closeFilterPopover()
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && ui.txOpenHeaderFilter) {
    movementsStore.closeFilterPopover()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <AppSection id="transactions" ref="appSection" :is-active="isActive">
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Registro mensual</p>
        <h2 id="transactions-title">Movimientos mensuales</h2>
        <p>Registro diario de ingresos, gastos e inversión por mes.</p>
      </div>
      <div class="inline-controls">
        <label>
          Filtrar mes
          <select
            id="tx-month-filter"
            name="txMonthFilter"
            :value="ui.txFilterMonth"
            @change="onMonthChange"
          >
            <option v-for="(name, index) in MONTHS" :key="name" :value="index">{{ name }}</option>
          </select>
        </label>
        <button id="tx-open-modal" type="button" class="primary-btn" @click="openModal">
          Nuevo
        </button>
      </div>
    </div>

    <TransactionBulkCard />

    <TransactionFormDialog ref="dialogRef" />

    <div class="tx-layout">
      <TransactionsTable />
      <TransactionSummary />
    </div>
  </AppSection>
</template>
