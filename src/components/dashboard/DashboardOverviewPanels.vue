<script setup lang="ts">
import type { DashboardViewModel } from '../../domain/dashboard/view-model'
import DashboardInvestmentProgressList from './DashboardInvestmentProgressList.vue'
import DashboardPanel from './DashboardPanel.vue'
import DashboardWealthSplitPanel from './DashboardWealthSplitPanel.vue'
import TopExpenseList from './TopExpenseList.vue'

defineProps<
  Pick<DashboardViewModel, 'currency' | 'wealthSplit' | 'topExpenses' | 'investmentProgress'>
>()

const emit = defineEmits<{
  navigate: [target: string]
}>()

function navigate(target: string): void {
  emit('navigate', target)
}
</script>

<template>
  <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <DashboardPanel
      title="Distribución de patrimonio"
      action-label="Ver detalle de patrimonio"
      action-target="wealth"
      class="gap-3"
      @navigate="navigate"
    >
      <DashboardWealthSplitPanel :currency="currency" :items="wealthSplit" />
    </DashboardPanel>

    <DashboardPanel
      title="Top gastos del mes"
      action-label="Ver todos los gastos"
      action-target="transactions"
      class="gap-3"
      @navigate="navigate"
    >
      <TopExpenseList :items="topExpenses" />
    </DashboardPanel>

    <DashboardPanel
      title="Plan de inversión mensual"
      action-label="Ver plan completo"
      action-target="budget"
      class="gap-3"
      @navigate="navigate"
    >
      <div id="investment-progress-list" class="flex min-h-0 flex-col justify-between gap-3">
        <DashboardInvestmentProgressList :items="investmentProgress" />
      </div>
    </DashboardPanel>
  </section>
</template>
