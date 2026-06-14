<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import BudgetBlock from '../budget/BudgetBlock.vue'
import BudgetSummaryCard from '../budget/BudgetSummaryCard.vue'
import type { BudgetType } from '../../scripts/types'
import { useBudgetStore } from '../../stores/budget'
import { useFinancialStateStore } from '../../stores/financial-state'

const props = withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const budgetStore = useBudgetStore()
const financialStateStore = useFinancialStateStore()
const { viewModel } = storeToRefs(budgetStore)

const formatter = computed(
  () =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: financialStateStore.currency || 'EUR',
      maximumFractionDigits: 2,
    }),
)

function formatMoney(value: number): string {
  return formatter.value.format(Number(value || 0))
}

function updateBudgetValue(payload: {
  type: BudgetType
  category: string
  month: number
  value: number
}): void {
  budgetStore.updateBudgetValue(payload.type, payload.category, payload.month, payload.value)
}
</script>

<template>
  <section
    id="budget"
    class="panel [overflow-x:hidden]"
    :class="{ 'is-active': props.isActive }"
    aria-labelledby="budget-title"
  >
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Planificación anual</p>
        <h2 id="budget-title">Presupuesto</h2>
        <p>
          Revisa todo el año de una vez y edita el presupuesto mensual por categoría en tablas
          separadas.
        </p>
      </div>
    </div>

    <div class="cards-grid slim">
      <BudgetSummaryCard
        label="Presupuestado anual"
        :value="formatMoney(viewModel.summary.plannedTotal)"
      />
      <BudgetSummaryCard label="Real anual" :value="formatMoney(viewModel.summary.actualTotal)" />
      <BudgetSummaryCard
        label="Diferencia anual"
        :value="formatMoney(viewModel.summary.diffTotal)"
        :tone="viewModel.summary.diffTone"
      />
    </div>

    <div class="grid min-w-0 gap-[18px]">
      <BudgetBlock
        v-for="block in viewModel.blocks"
        :key="block.type"
        :block="block"
        :months="viewModel.months"
        :format-money="formatMoney"
        @update-budget-value="updateBudgetValue"
      />
    </div>
  </section>
</template>
