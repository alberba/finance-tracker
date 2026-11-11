<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, shallowRef } from 'vue'
import type { Component } from 'vue'

import { sectionDesign } from '../config/section-design'
import type { Design } from '../lib/design'
import NeonDashboardSection from '../neon/dashboard/NeonDashboardSection.vue'
import type { SectionId } from '../scripts/types'
import { useStockEventsStore } from '../stores/stockevents'
import { useUiStore } from '../stores/ui'
import DashboardSection from './sections/DashboardSection.vue'
import WelcomeLauncher from './onboarding/WelcomeLauncher.vue'
import GlobalReportLauncher from './reports/GlobalReportLauncher.vue'

const sectionLoaders = {
  reports: () => import('./reports/ReportsPage.vue'),
  budget: () => import('./sections/BudgetSection.vue'),
  goals: () => import('./sections/GoalsSection.vue'),
  data: () => import('./sections/DataSection.vue'),
  settings: () => import('./sections/SettingsSection.vue'),
  transactions: () => import('./sections/TransactionsSection.vue'),
  wealth: () => import('./sections/WealthSection.vue'),
  investment: () => import('./sections/InvestmentSection.vue'),
}

/** Chunks of the new design's lazy migrated sections, warmed with the old ones. */
const neonSectionLoaders = {
  transactions: () => import('../neon/sections/transactions/NeonTransactionsSection.vue'),
  budget: () => import('../neon/sections/budget/NeonBudgetSection.vue'),
  wealth: () => import('../neon/sections/wealth/NeonWealthSection.vue'),
  investment: () => import('../neon/sections/investment/NeonInvestmentSection.vue'),
  goals: () => import('../neon/sections/goals/NeonGoalsSection.vue'),
  data: () => import('../neon/sections/data/NeonDataSection.vue'),
} satisfies Partial<Record<SectionId, () => Promise<unknown>>>

const ReportsPage = defineAsyncComponent(sectionLoaders.reports)

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

/** The new design's version of each migrated section (src/config/section-design.ts). */
const neonSectionComponents: Partial<Record<SectionId, Component>> = {
  dashboard: NeonDashboardSection,
  transactions: defineAsyncComponent(neonSectionLoaders.transactions),
  budget: defineAsyncComponent(neonSectionLoaders.budget),
  wealth: defineAsyncComponent(neonSectionLoaders.wealth),
  investment: defineAsyncComponent(neonSectionLoaders.investment),
  goals: defineAsyncComponent(neonSectionLoaders.goals),
  data: defineAsyncComponent(neonSectionLoaders.data),
}

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
    const loaders =
      props.design === 'neon' ? { ...sectionLoaders, ...neonSectionLoaders } : sectionLoaders
    for (const load of Object.values(loaders)) {
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
    page?: 'section' | 'reports'
    design?: Design
  }>(),
  { activeSection: 'dashboard', page: 'section', design: 'legacy' },
)

const uiStore = useUiStore()
const stockEventsStore = useStockEventsStore()
uiStore.setActiveSection(props.activeSection)
uiStore.setPage(props.page)

onMounted(() => {
  void stockEventsStore.initializeCredential()
})

const currentSection = computed(() => uiStore.ui.activeSection)
const activeSectionComponent = computed(() => {
  const section = currentSection.value
  const neon = neonSectionComponents[section]
  return neon && sectionDesign(section, props.design) === 'neon' ? neon : sectionComponents[section]
})
const isReportsPage = computed(() => uiStore.page === 'reports')
const isReportDialogOpen = shallowRef(false)
</script>

<template>
  <div class="contents" data-finance-workspace>
    <WelcomeLauncher />
    <ReportsPage v-if="isReportsPage" />
    <component :is="activeSectionComponent" v-else :key="currentSection" :is-active="true" />
    <GlobalReportLauncher v-model:open="isReportDialogOpen" />
  </div>
</template>
