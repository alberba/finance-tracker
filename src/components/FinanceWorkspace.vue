<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, shallowRef } from 'vue'
import type { Component } from 'vue'

import type { SectionId } from '../scripts/types'
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
  // /reportes has its own lazy page and data; warming eight section chunks
  // there only competes with the reports request. Data Saver users opt out of
  // background downloads entirely.
  if (props.page === 'reports') return
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection
  if (connection?.saveData) return

  const prefetchSections = () => {
    for (const load of Object.values(sectionLoaders)) {
      void load().catch(() => undefined)
    }
  }

  // Wait for the page load and the first idle window: hydration, the session
  // lookup and the first dashboard paint must not share bandwidth with eight
  // background chunks. Offline sections are still warmed a few seconds later.
  const schedulePrefetch = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(prefetchSections, { timeout: 5000 })
    } else {
      setTimeout(prefetchSections, 2000)
    }
  }

  if (document.readyState === 'complete') {
    schedulePrefetch()
  } else {
    window.addEventListener('load', schedulePrefetch, { once: true })
  }
})

const props = withDefaults(
  defineProps<{
    activeSection?: SectionId
    page?: 'section' | 'reports'
  }>(),
  { activeSection: 'dashboard', page: 'section' },
)

const uiStore = useUiStore()
uiStore.setActiveSection(props.activeSection)
uiStore.setPage(props.page)

const currentSection = computed(() => uiStore.ui.activeSection)
const activeSectionComponent = computed(() => sectionComponents[currentSection.value])
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
