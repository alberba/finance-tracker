<script setup lang="ts">
import SetupRequirement from '../onboarding/SetupRequirement.vue'
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { computed, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'

import { useDashboardStore } from '../../stores/dashboard'
import DashboardGoalsBlock from '../dashboard/DashboardGoalsBlock.vue'
import DashboardMonthCard from '../dashboard/DashboardMonthCard.vue'
import DashboardNetWorthBand from '../dashboard/DashboardNetWorthBand.vue'
import DashboardPendingBlock from '../dashboard/DashboardPendingBlock.vue'
import DashboardQuotesBlock from '../dashboard/DashboardQuotesBlock.vue'
import DashboardRecentBlock from '../dashboard/DashboardRecentBlock.vue'
import DashboardTopExpensesBlock from '../dashboard/DashboardTopExpensesBlock.vue'
import DashboardWealthBlock from '../dashboard/DashboardWealthBlock.vue'
import TransactionPanel from '../transactions/TransactionPanel.vue'
import AppSection from '../ui/AppSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import PageHeader from '../ui/PageHeader.vue'
import { formatWeekdayDate } from '../../lib/format'
import { todayISO } from '../../scripts/utils'

const props = withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: true })

const dashboardStore = useDashboardStore()
const { viewModel, activeRange } = storeToRefs(dashboardStore)
const transactionPanel = useTemplateRef<InstanceType<typeof TransactionPanel>>('transactionPanel')

const today = formatWeekdayDate(todayISO())
const month = computed({
  get: () => viewModel.value.month,
  set: dashboardStore.changeMonth,
})
const year = computed({
  get: () => viewModel.value.year,
  set: dashboardStore.changeYear,
})
const range = computed({
  get: () => activeRange.value,
  set: dashboardStore.changeRange,
})
const { needsAccount } = useAccountRequirement()
</script>

<template>
  <AppSection id="dashboard" :is-active="props.isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6">
      <PageHeader
        :kicker="today"
        title="Dashboard"
        title-id="dashboard-title"
        lede="Cuánto tienes, cómo va el mes y qué te queda por hacer."
      >
        <template #aside>
          <BaseButton
            variant="primary"
            :disabled="needsAccount"
            @click="transactionPanel?.openNew()"
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo movimiento
          </BaseButton>
        </template>
      </PageHeader>

      <SetupRequirement
        v-if="needsAccount"
        message="Crea una cuenta para registrar tu primer movimiento."
      />

      <DashboardNetWorthBand
        v-model:range="range"
        :band="viewModel.netWorth"
        :chart="viewModel.netWorthChart"
        :ranges="viewModel.ranges"
        :currency="viewModel.currency"
      />

      <DashboardMonthCard
        v-model:month="month"
        v-model:year="year"
        :month-name="viewModel.monthName"
        :status="viewModel.monthStatus"
        :kpis="viewModel.kpis"
        :split="viewModel.incomeSplit"
        :months="viewModel.months"
        :years="viewModel.yearOptions"
      />

      <div
        class="border-line bg-panel shadow-soft grid overflow-hidden rounded-lg border xl:grid-cols-3"
        data-dashboard-grid
      >
        <DashboardWealthBlock :split="viewModel.wealthSplit" />
        <DashboardTopExpensesBlock
          class="border-t xl:border-t-0 xl:border-l"
          :expenses="viewModel.topExpenses"
          @navigate="dashboardStore.navigate"
        />
        <DashboardPendingBlock class="border-t xl:border-t-0 xl:border-l" />
        <DashboardRecentBlock
          class="border-t"
          :transactions="viewModel.recentTransactions"
          @navigate="dashboardStore.navigate"
        />
        <DashboardGoalsBlock
          class="border-t xl:col-span-2 xl:border-l"
          :goals="viewModel.goals"
          @navigate="dashboardStore.navigate"
        />
        <DashboardQuotesBlock class="border-t xl:col-span-3" />
      </div>
    </div>

    <TransactionPanel ref="transactionPanel" />
  </AppSection>
</template>
