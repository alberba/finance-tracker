<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import InvestmentRecurringRuleForm from './InvestmentRecurringRuleForm.vue'
import InvestmentRecurringRuleList from './InvestmentRecurringRuleList.vue'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMovementsStore } from '../../../stores/movements'
import { useRecurringStore, type NewRecurringRuleInput } from '../../../stores/recurring'
import type { RecurringRule } from '../../../scripts/types'

const financialStateStore = useFinancialStateStore()
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()
const editingRuleId = shallowRef('')
const formVersion = shallowRef(0)

const investmentRules = computed(() =>
  recurringStore.rules.filter((rule) => rule.type === 'investment'),
)
const categoryOptions = computed(() => movementsStore.orderedCategories('investment'))
const editingRule = computed(
  () => investmentRules.value.find((rule) => rule.id === editingRuleId.value) ?? null,
)

function saveRule(input: NewRecurringRuleInput): void {
  const saved = editingRuleId.value
    ? recurringStore.updateRule(editingRuleId.value, { ...input, type: 'investment' })
    : recurringStore.addRule({ ...input, type: 'investment' })
  if (saved) {
    editingRuleId.value = ''
    formVersion.value += 1
  }
}

function editRule(rule: RecurringRule): void {
  editingRuleId.value = rule.id
}

function cancelEdit(): void {
  editingRuleId.value = ''
  formVersion.value += 1
}
</script>

<template>
  <section class="investment-recurring-panel" data-recurring-rules>
    <article class="card investment-recurring-panel__editor">
      <header class="investment-recurring-panel__header">
        <div>
          <p class="panel-kicker">Automatización de cartera</p>
          <h3>Compras recurrentes</h3>
          <p>Cada vencimiento queda pendiente hasta que revises y confirmes la inversión.</p>
        </div>
      </header>
      <InvestmentRecurringRuleForm
        :key="formVersion"
        :accounts="financialStateStore.accounts"
        :categories="categoryOptions"
        :editing-rule="editingRule"
        @save="saveRule"
        @cancel="cancelEdit"
      />
    </article>

    <article class="card">
      <h3>Plan de compras</h3>
      <InvestmentRecurringRuleList
        :rules="investmentRules"
        @edit="editRule"
        @toggle="recurringStore.toggleRule"
        @delete="recurringStore.removeRule"
      />
    </article>
  </section>
</template>

<style scoped>
.investment-recurring-panel {
  display: grid;
  gap: 1rem;
}

.investment-recurring-panel__editor {
  display: grid;
  gap: 1rem;
}

.investment-recurring-panel__header p:last-child {
  margin: 0.4rem 0 0;
  color: var(--text-muted);
}
</style>
