<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, shallowRef } from 'vue'
import type { Component } from 'vue'

import type { SectionId } from '../scripts/types'
import { useStockEventsStore } from '../stores/stockevents'
import { useUiStore } from '../stores/ui'
import DashboardSection from './sections/DashboardSection.vue'
import GlobalReportLauncher from './reports/GlobalReportLauncher.vue'
import ConflictResolutionDialog from './sync/ConflictResolutionDialog.vue'

const sectionLoaders = {
  budget: () => import('./sections/BudgetSection.vue'),
  goals: () => import('./sections/GoalsSection.vue'),
  data: () => import('./sections/DataSection.vue'),
  settings: () => import('./sections/SettingsSection.vue'),
  transactions: () => import('./sections/TransactionsSection.vue'),
  wealth: () => import('./sections/WealthSection.vue'),
  investment: () => import('./sections/InvestmentSection.vue'),
}

const sectionComponents = {
  dashboard: DashboardSection,
  budget: defineAsyncComponent(sectionLoaders.budget),
  goals: defineAsyncComponent(sectionLoaders.goals),
  data: defineAsyncComponent(sectionLoaders.data),
  settings: defineAsyncComponent(sectionLoaders.settings),
  transactions: defineAsyncComponent(sectionLoaders.transactions),
  wealth: defineAsyncComponent(sectionLoaders.wealth),
  investment: defineAsyncComponent(sectionLoaders.investment),
} satisfies Record<SectionId, Component>

/**
 * Warm every section chunk once the browser goes idle.
 *
 * Lazy sections keep the dashboard's first paint cheap, but a chunk that has
 * never been fetched cannot be fetched at all once the app is offline — so
 * navigating to a section you had not already visited rendered nothing, which
 * defeats the point of the offline/outbox mode. Prefetching after idle keeps
 * the initial render exactly as light as before (only the dashboard is in the
 * critical path) while making every section reachable offline shortly after
 * load. Failures are ignored on purpose: this is opportunistic, and the real
 * navigation still awaits the same loader.
 */
onMounted(() => {
  const prefetchSections = () => {
    for (const load of Object.values(sectionLoaders)) {
      void load().catch(() => undefined)
    }
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(prefetchSections, { timeout: 3000 })
  } else {
    setTimeout(prefetchSections, 1000)
  }
})

const props = withDefaults(
  defineProps<{
    activeSection?: SectionId
  }>(),
  { activeSection: 'dashboard' },
)

const uiStore = useUiStore()
const stockEventsStore = useStockEventsStore()
uiStore.setActiveSection(props.activeSection)

onMounted(() => {
  void stockEventsStore.initializeCredential()
})

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
