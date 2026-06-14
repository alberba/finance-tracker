<script setup lang="ts">
import { computed, ref } from 'vue'

import ContributionDeleteDialog from '../investment/ContributionDeleteDialog.vue'
import ContributionWorkflowDialog from '../investment/ContributionWorkflowDialog.vue'
import InvestmentContributionsTab from '../investment/InvestmentContributionsTab.vue'
import InvestmentDashboardTab from '../investment/InvestmentDashboardTab.vue'
import InvestmentMovementsTab from '../investment/InvestmentMovementsTab.vue'
import AppSection from '../ui/AppSection.vue'
import type { ReturnMode } from '../../domain/investment/view-model'
import { MONTHS, type InvestmentSubTab } from '../../scripts/types'
import { parseIntSafe } from '../../scripts/utils'
import { useInvestmentStore } from '../../stores/investment'
import { useUiStore } from '../../stores/ui'

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const investmentStore = useInvestmentStore()
const uiStore = useUiStore()
const ui = uiStore.ui

const workflowDialogRef = ref<InstanceType<typeof ContributionWorkflowDialog> | null>(null)
const deleteDialogRef = ref<InstanceType<typeof ContributionDeleteDialog> | null>(null)

const activeTab = computed(() => ui.investmentTab)
const returnMode = computed(() => ui.investmentReturnMode)

function setTab(tab: InvestmentSubTab): void {
  investmentStore.setTab(tab)
}

function setReturnMode(mode: ReturnMode): void {
  investmentStore.setReturnMode(mode)
}

function onMonthChange(event: Event): void {
  investmentStore.setMonth(parseIntSafe((event.target as HTMLSelectElement).value, ui.investmentMonth))
}

function onConfirmDelete(date: string): void {
  investmentStore.deleteContribution(date)
}
</script>

<template>
  <AppSection id="investment" :is-active="isActive">
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Cartera y aportes</p>
        <h2 id="investment-title">Inversión y aportes</h2>
        <p>Evolución de cartera, distribución y registro de aportaciones.</p>
      </div>
      <div class="inline-controls">
        <div class="return-mode-toggle" role="group" aria-label="Modo de cálculo de rentabilidad">
          <span class="return-mode-toggle__label">Rentabilidad</span>
          <button
            type="button"
            class="return-mode-btn"
            :class="{ 'is-active': returnMode === 'simple' }"
            data-return-mode="simple"
            :aria-pressed="returnMode === 'simple'"
            @click="setReturnMode('simple')"
          >
            Simple
          </button>
          <button
            type="button"
            class="return-mode-btn"
            :class="{ 'is-active': returnMode === 'twr' }"
            data-return-mode="twr"
            :aria-pressed="returnMode === 'twr'"
            @click="setReturnMode('twr')"
          >
            TWR
          </button>
        </div>
        <label>
          Mes de análisis
          <select
            id="investment-month"
            name="investmentMonth"
            :value="ui.investmentMonth"
            @change="onMonthChange"
          >
            <option v-for="(name, index) in MONTHS" :key="name" :value="index">{{ name }}</option>
          </select>
        </label>
      </div>
    </div>

    <div class="investment-subtabs" role="tablist" aria-label="Subsecciones de inversión">
      <button
        type="button"
        class="investment-subtab-btn"
        :class="{ 'is-active': activeTab === 'dashboard' }"
        data-investment-tab="dashboard"
        role="tab"
        :aria-selected="activeTab === 'dashboard'"
        aria-controls="investment-tab-dashboard"
        @click="setTab('dashboard')"
      >
        Dashboard
      </button>
      <button
        type="button"
        class="investment-subtab-btn"
        :class="{ 'is-active': activeTab === 'movements' }"
        data-investment-tab="movements"
        role="tab"
        :aria-selected="activeTab === 'movements'"
        aria-controls="investment-tab-movements"
        @click="setTab('movements')"
      >
        Movimientos
      </button>
      <button
        type="button"
        class="investment-subtab-btn"
        :class="{ 'is-active': activeTab === 'contributions' }"
        data-investment-tab="contributions"
        role="tab"
        :aria-selected="activeTab === 'contributions'"
        aria-controls="investment-tab-contributions"
        @click="setTab('contributions')"
      >
        Aportes
      </button>
    </div>

    <InvestmentDashboardTab :is-active="activeTab === 'dashboard'" />
    <InvestmentMovementsTab :is-active="activeTab === 'movements'" />
    <InvestmentContributionsTab
      :is-active="activeTab === 'contributions'"
      @open-workflow="workflowDialogRef?.open()"
      @request-delete="deleteDialogRef?.open($event)"
    />

    <ContributionWorkflowDialog ref="workflowDialogRef" />
    <ContributionDeleteDialog ref="deleteDialogRef" @confirm="onConfirmDelete" />
  </AppSection>
</template>
