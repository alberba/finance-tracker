<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import type { SectionId } from '../scripts/types'
import { useUiStore } from '../stores/ui'
import BudgetSection from './sections/BudgetSection.vue'
import DashboardSection from './sections/DashboardSection.vue'
import DataSection from './sections/DataSection.vue'
import GoalsSection from './sections/GoalsSection.vue'
import InvestmentSection from './sections/InvestmentSection.vue'
import GlobalReportLauncher from './reports/GlobalReportLauncher.vue'
import SettingsSection from './sections/SettingsSection.vue'
import TransactionsSection from './sections/TransactionsSection.vue'
import WealthSection from './sections/WealthSection.vue'

const props = withDefaults(
  defineProps<{
    activeSection?: SectionId
  }>(),
  { activeSection: 'dashboard' },
)

const uiStore = useUiStore()
uiStore.setActiveSection(props.activeSection)

const currentSection = computed(() => uiStore.ui.activeSection)
const isReportDialogOpen = shallowRef(false)
</script>

<template>
  <div class="contents" data-finance-workspace>
    <DashboardSection :is-active="currentSection === 'dashboard'" />
    <BudgetSection :is-active="currentSection === 'budget'" />
    <GoalsSection :is-active="currentSection === 'goals'" />
    <DataSection :is-active="currentSection === 'data'" />
    <SettingsSection :is-active="currentSection === 'settings'" />
    <TransactionsSection :is-active="currentSection === 'transactions'" />
    <WealthSection :is-active="currentSection === 'wealth'" />
    <InvestmentSection :is-active="currentSection === 'investment'" />
    <GlobalReportLauncher v-model:open="isReportDialogOpen" />
  </div>
</template>
