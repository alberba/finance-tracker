<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import type { Component } from 'vue'

import { useFinanceReady } from '../../composables/useFinanceReady'
import { useUserTheme } from '../../composables/useNeonTheme'
import type { SectionId } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useStockEventsStore } from '../../stores/stockevents'
import { useUiStore } from '../../stores/ui'
import NeonDashboardSection from '../dashboard/NeonDashboardSection.vue'
import NeonReportLauncher from '../layout/NeonReportLauncher.vue'
import NeonSetup from '../onboarding/NeonSetup.vue'
import NeonTour from '../onboarding/NeonTour.vue'

const sectionLoaders = {
  transactions: () => import('../sections/transactions/NeonTransactionsSection.vue'),
  budget: () => import('../sections/budget/NeonBudgetSection.vue'),
  wealth: () => import('../sections/wealth/NeonWealthSection.vue'),
  investment: () => import('../sections/investment/NeonInvestmentSection.vue'),
  goals: () => import('../sections/goals/NeonGoalsSection.vue'),
  settings: () => import('../sections/settings/NeonSettingsSection.vue'),
  data: () => import('../sections/data/NeonDataSection.vue'),
} satisfies Record<Exclude<SectionId, 'dashboard'>, () => Promise<unknown>>

/** «Mis reportes» is a page, not a section. */
const reportsLoader = () => import('../sections/reports/NeonReportsSection.vue')

const ReportsPage = defineAsyncComponent(reportsLoader)

const sectionComponents = {
  dashboard: NeonDashboardSection,
  transactions: defineAsyncComponent(sectionLoaders.transactions),
  budget: defineAsyncComponent(sectionLoaders.budget),
  wealth: defineAsyncComponent(sectionLoaders.wealth),
  investment: defineAsyncComponent(sectionLoaders.investment),
  goals: defineAsyncComponent(sectionLoaders.goals),
  settings: defineAsyncComponent(sectionLoaders.settings),
  data: defineAsyncComponent(sectionLoaders.data),
} satisfies Record<SectionId, Component>

const props = withDefaults(
  defineProps<{
    activeSection?: SectionId
    page?: 'section' | 'reports'
  }>(),
  { activeSection: 'dashboard', page: 'section' },
)

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
    for (const load of [...Object.values(sectionLoaders), reportsLoader]) {
      void load().catch(() => undefined)
    }
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(prefetchSections, { timeout: 3000 })
  } else {
    setTimeout(prefetchSections, 1000)
  }
})

const uiStore = useUiStore()
useUserTheme()
const stockEventsStore = useStockEventsStore()
uiStore.setActiveSection(props.activeSection)
uiStore.setPage(props.page)

onMounted(() => {
  void stockEventsStore.initializeCredential()
})

const currentSection = computed(() => uiStore.ui.activeSection)
const activeSectionComponent = computed(() => sectionComponents[currentSection.value])
const isReportsPage = computed(() => uiStore.page === 'reports')
// A section shows once the shell has the data (sync, or the demo's local copy),
// not before: mounted on the empty state it would draw its empty cards and
// then jump when the data arrives, its entrance spent on nothing. If loading
// fails, it shows anyway, with whatever the client has.
const financeReady = useFinanceReady()
const financialStateStore = useFinancialStateStore()
const canShow = computed(() => financeReady.value || financialStateStore.status === 'error')
</script>

<template>
  <div class="contents" data-finance-workspace>
    <NeonSetup />
    <NeonTour />
    <template v-if="!canShow" />
    <ReportsPage v-else-if="isReportsPage" />
    <component :is="activeSectionComponent" v-else :key="currentSection" :is-active="true" />
    <NeonReportLauncher />
  </div>
</template>
