<script setup lang="ts">
import { computed, defineAsyncComponent, shallowRef } from 'vue'
import type { Component } from 'vue'

import type { SectionId } from '../scripts/types'
import { useUiStore } from '../stores/ui'
import DashboardSection from './sections/DashboardSection.vue'
import GlobalReportLauncher from './reports/GlobalReportLauncher.vue'
import ConflictResolutionDialog from './sync/ConflictResolutionDialog.vue'

const sectionComponents = {
  dashboard: DashboardSection,
  budget: defineAsyncComponent(() => import('./sections/BudgetSection.vue')),
  goals: defineAsyncComponent(() => import('./sections/GoalsSection.vue')),
  data: defineAsyncComponent(() => import('./sections/DataSection.vue')),
  settings: defineAsyncComponent(() => import('./sections/SettingsSection.vue')),
  transactions: defineAsyncComponent(() => import('./sections/TransactionsSection.vue')),
  wealth: defineAsyncComponent(() => import('./sections/WealthSection.vue')),
  investment: defineAsyncComponent(() => import('./sections/InvestmentSection.vue')),
} satisfies Record<SectionId, Component>

const props = withDefaults(
  defineProps<{
    activeSection?: SectionId
  }>(),
  { activeSection: 'dashboard' },
)

const uiStore = useUiStore()
uiStore.setActiveSection(props.activeSection)

const currentSection = computed(() => uiStore.ui.activeSection)
const activeSectionComponent = computed(() => sectionComponents[currentSection.value])
const isReportDialogOpen = shallowRef(false)
</script>

<template>
  <div class="contents" data-finance-workspace>
    <component :is="activeSectionComponent" :key="currentSection" :is-active="true" />
    <GlobalReportLauncher v-model:open="isReportDialogOpen" />
    <ConflictResolutionDialog />
  </div>
</template>
