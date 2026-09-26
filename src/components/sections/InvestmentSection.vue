<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import ContributionDeleteDialog from '../investment/ContributionDeleteDialog.vue'
import ContributionWorkflowDialog from '../investment/ContributionWorkflowDialog.vue'
import InvestmentContributionsTab from '../investment/InvestmentContributionsTab.vue'
import InvestmentDashboardTab from '../investment/InvestmentDashboardTab.vue'
import InvestmentMovementsTab from '../investment/InvestmentMovementsTab.vue'
import InvestmentRecurringTab from '../investment/InvestmentRecurringTab.vue'
import AppSection from '../ui/AppSection.vue'
import type { InvestmentSubTab } from '../../scripts/types'
import { useInvestmentStore } from '../../stores/investment'
import { useMarketStore } from '../../stores/market'
import { useRecurringStore } from '../../stores/recurring'
import { useUiStore } from '../../stores/ui'

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const investmentStore = useInvestmentStore()
const marketStore = useMarketStore()
const recurringStore = useRecurringStore()
const uiStore = useUiStore()
const ui = uiStore.ui
const { movementRows, contributionRows } = storeToRefs(investmentStore)

const workflowDialogRef = ref<InstanceType<typeof ContributionWorkflowDialog> | null>(null)
const deleteDialogRef = ref<InstanceType<typeof ContributionDeleteDialog> | null>(null)

const activeTab = computed(() => ui.investmentTab)

const tabs = computed<Array<{ id: InvestmentSubTab; label: string; count: number | null }>>(() => [
  { id: 'dashboard', label: 'Resumen', count: null },
  { id: 'movements', label: 'Movimientos', count: movementRows.value.length },
  { id: 'contributions', label: 'Aportes', count: contributionRows.value.length },
  {
    id: 'recurring',
    label: 'Compras recurrentes',
    count: recurringStore.rules.filter((rule) => rule.type === 'investment').length,
  },
])

const quoteStatus = computed(() => {
  const instruments = marketStore.valuation.instruments
  const stamps = instruments
    .map((row) => (row.quote ? new Date(row.quote.timestamp).getTime() : NaN))
    .filter((value) => Number.isFinite(value))
  if (!stamps.length) return null
  const latest = new Date(Math.max(...stamps))
  return {
    stale: instruments.some((row) => row.status !== 'fresh'),
    label: new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(latest),
  }
})

function setTab(tab: InvestmentSubTab): void {
  investmentStore.setTab(tab)
}

function onConfirmDelete(date: string): void {
  investmentStore.deleteContribution(date)
}
</script>

<template>
  <AppSection id="investment" :is-active="isActive">
    <div class="inv-page">
      <header class="inv-head">
        <div class="inv-head__text">
          <p class="inv-kicker">Cartera</p>
          <h2 id="investment-title">Inversión</h2>
          <p class="inv-head__lede">Cómo evoluciona tu cartera, qué has comprado y cuánto aportas.</p>
        </div>
        <p v-if="quoteStatus" class="inv-status">
          <span class="inv-status__dot" :class="{ 'is-stale': quoteStatus.stale }"></span>
          Cotizaciones actualizadas · {{ quoteStatus.label }}
        </p>
      </header>

      <div class="inv-tabs" role="tablist" aria-label="Subsecciones de inversión">
        <button
          v-for="tab in tabs"
          :id="tab.id === 'recurring' ? 'investment-tab-recurring-button' : undefined"
          :key="tab.id"
          type="button"
          class="inv-tab"
          :class="{ 'is-active': activeTab === tab.id }"
          :data-investment-tab="tab.id"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`investment-tab-${tab.id}`"
          @click="setTab(tab.id)"
        >
          {{ tab.label }}
          <span v-if="tab.count !== null" class="inv-tab__count" aria-hidden="true">{{ tab.count }}</span>
        </button>
      </div>

      <InvestmentDashboardTab :is-active="activeTab === 'dashboard'" />
      <InvestmentMovementsTab :is-active="activeTab === 'movements'" />
      <InvestmentContributionsTab
        :is-active="activeTab === 'contributions'"
        @open-workflow="workflowDialogRef?.open()"
        @request-delete="deleteDialogRef?.open($event)"
      />
      <InvestmentRecurringTab :is-active="activeTab === 'recurring'" />
    </div>

    <ContributionWorkflowDialog ref="workflowDialogRef" />
    <ContributionDeleteDialog ref="deleteDialogRef" @confirm="onConfirmDelete" />
  </AppSection>
</template>
