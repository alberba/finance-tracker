<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import InvestmentContributionsTab from '../investment/InvestmentContributionsTab.vue'
import InvestmentDashboardTab from '../investment/InvestmentDashboardTab.vue'
import InvestmentMovementsTab from '../investment/InvestmentMovementsTab.vue'
import InvestmentRecurringTab from '../investment/InvestmentRecurringTab.vue'
import AppSection from '../ui/AppSection.vue'
import PageHeader from '../ui/PageHeader.vue'
import SectionTabs, { type SectionTab } from '../ui/SectionTabs.vue'
import StatusDot from '../ui/StatusDot.vue'
import { useLiveQuotes } from '../../composables/useLiveQuotes'
import { summarizeQuoteStatus } from '../../domain/investment/quote-status'
import { formatStamp } from '../../lib/format'
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
const ui = useUiStore().ui
const { movementRows, contributionRows } = storeToRefs(investmentStore)

useLiveQuotes()

const activeTab = computed({
  get: () => ui.investmentTab,
  set: (tab: string) => investmentStore.setTab(tab as InvestmentSubTab),
})

const tabs = computed<SectionTab[]>(() => [
  { id: 'dashboard', label: 'Resumen' },
  { id: 'movements', label: 'Movimientos', count: movementRows.value.length },
  { id: 'contributions', label: 'Aportes', count: contributionRows.value.length },
  {
    id: 'recurring',
    label: 'Compras recurrentes',
    count: recurringStore.rules.filter((rule) => rule.type === 'investment').length,
    buttonId: 'investment-tab-recurring-button',
  },
])

const quoteStatus = computed(() => summarizeQuoteStatus(marketStore.valuation.instruments))
</script>

<template>
  <AppSection id="investment" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6 sm:gap-7">
      <PageHeader
        kicker="Cartera"
        title="Inversión"
        title-id="investment-title"
        lede="Cómo evoluciona tu cartera, qué has comprado y cuánto aportas."
      >
        <template v-if="quoteStatus" #aside>
          <p class="text-text-muted text-sm" :data-quote-status="quoteStatus.status">
            <StatusDot :tone="quoteStatus.tone" :label="quoteStatus.label">
              {{ quoteStatus.label }} · {{ formatStamp(quoteStatus.latest) }}
            </StatusDot>
          </p>
        </template>
      </PageHeader>

      <SectionTabs
        v-model="activeTab"
        :tabs="tabs"
        label="Subsecciones de inversión"
        panel-id-prefix="investment-tab-"
        data-key="investment-tab"
      />

      <InvestmentDashboardTab :is-active="activeTab === 'dashboard'" />
      <InvestmentMovementsTab :is-active="activeTab === 'movements'" />
      <InvestmentContributionsTab :is-active="activeTab === 'contributions'" />
      <InvestmentRecurringTab :is-active="activeTab === 'recurring'" />
    </div>
  </AppSection>
</template>
