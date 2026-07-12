<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

import AppSection from '../ui/AppSection.vue'
import TransactionBulkCard from '../transactions/TransactionBulkCard.vue'
import TransactionFormDialog from '../transactions/TransactionFormDialog.vue'
import TransactionSummary from '../transactions/TransactionSummary.vue'
import TransactionsTable from '../transactions/TransactionsTable.vue'
import { hasSelectionWithin } from '../../scripts/app/dom-helpers'
import { MONTHS, type TransactionsSubTab } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'
import DashboardPeriodField from '../dashboard/DashboardPeriodField.vue'
import TransactionsSubscriptionsTab from '../transactions/TransactionsSubscriptionsTab.vue'
import PendingMovementsPanel from '../recurring/PendingMovementsPanel.vue'

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

const monthOptions = computed(() => MONTHS.map((name, index) => ({ value: index, label: name })))

function openModal(): void {
  dialogRef.value?.open()
}

function setTab(tab: TransactionsSubTab): void {
  ui.txTab = tab
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
    <header
      class="flex flex-wrap items-center justify-between gap-4"
    >
      <div class="grid min-w-0 gap-2">
        <p class="text-primary font-mono text-xs tracking-widest uppercase">
          Registro mensual
        </p>
        <h2
          id="transactions-title"
          class="font-display text-text-main text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.03]"
        >
          Movimientos mensuales
        </h2>
        <p class="text-text-muted text-sm">
          Registro diario de ingresos, gastos e inversión por mes.
        </p>
      </div>
      <div class="flex flex-wrap items-end gap-3">
        <DashboardPeriodField
          id="tx-month-filter"
          name="txMonthFilter"
          label="Filtrar mes"
          :model-value="ui.txFilterMonth"
          :options="monthOptions"
          @update:model-value="movementsStore.setMonth"
        />
        <button
          id="tx-open-modal"
          type="button"
          class="inline-flex cursor-pointer items-center justify-center rounded-md bg-linear-to-b from-[color-mix(in_srgb,var(--primary)_92%,#fff_8%)] to-(--primary) px-4 py-2 font-medium text-white shadow-[0_2px_10px_color-mix(in_srgb,var(--primary)_38%,transparent)] transition hover:-translate-y-px hover:shadow-[0_6px_20px_color-mix(in_srgb,var(--primary)_48%,transparent)] active:translate-y-0"
          @click="openModal"
        >
          Nuevo
        </button>
      </div>
    </header>

    <div class="flex w-fit rounded-lg border border-(--border) bg-(--panel) p-1" role="tablist" aria-label="Subsecciones de movimientos">
      <button id="transactions-tab-registry-button" type="button" role="tab" :aria-selected="ui.txTab === 'registry'" aria-controls="transactions-tab-registry" class="rounded-md px-3 py-1.5 text-sm font-semibold transition" :class="ui.txTab === 'registry' ? 'bg-(--primary) text-white' : 'text-(--text-muted)'" @click="setTab('registry')">Registro</button>
      <button id="transactions-tab-subscriptions-button" type="button" role="tab" :aria-selected="ui.txTab === 'subscriptions'" aria-controls="transactions-tab-subscriptions" class="rounded-md px-3 py-1.5 text-sm font-semibold transition" :class="ui.txTab === 'subscriptions' ? 'bg-(--primary) text-white' : 'text-(--text-muted)'" @click="setTab('subscriptions')">Suscripciones</button>
    </div>

    <div id="transactions-tab-registry" role="tabpanel" :hidden="ui.txTab !== 'registry'" aria-labelledby="transactions-tab-registry-button">
      <TransactionBulkCard />
      <PendingMovementsPanel />
      <TransactionFormDialog ref="dialogRef" />
      <div class="grid items-start gap-3.5 min-[1240px]:grid-cols-[minmax(0,1fr)_minmax(310px,0.4fr)]">
        <TransactionsTable />
        <TransactionSummary />
      </div>
    </div>
    <TransactionsSubscriptionsTab :is-active="ui.txTab === 'subscriptions'" />
  </AppSection>
</template>
