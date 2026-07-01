import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildBudgetViewModel } from '../domain/budget/view-model'
import type { BudgetType } from '../scripts/types'
import { round2 } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

export const useBudgetStore = defineStore('budget', () => {
  const financialStateStore = useFinancialStateStore()

  const viewModel = computed(() => buildBudgetViewModel(financialStateStore.state))
  const budget = computed(() => financialStateStore.budget)
  const incomeCategories = computed(() => financialStateStore.state.incomeCategories)
  const expenseCategories = computed(() => financialStateStore.state.expenseCategories)
  const investmentCategories = computed(() => financialStateStore.state.investmentCategories)

  function getCategoriesForType(type: BudgetType): string[] {
    if (type === 'income') {
      return incomeCategories.value
    }
    if (type === 'expense') {
      return expenseCategories.value
    }
    return investmentCategories.value
  }

  function updateBudgetValue(
    type: BudgetType,
    category: string,
    month: number,
    value: number,
  ): void {
    financialStateStore.commitState((draft) => {
      if (!draft.budget[type]) {
        draft.budget[type] = {}
      }

      if (!draft.budget[type][category]) {
        draft.budget[type][category] = Array.from({ length: 12 }, () => 0)
      }

      if (draft.budget[type][category].length < 12) {
        draft.budget[type][category].push(
          ...Array.from({ length: 12 - draft.budget[type][category].length }, () => 0),
        )
      }

      draft.budget[type][category][month] = round2(value)
    })
  }

  return {
    viewModel,
    budget,
    incomeCategories,
    expenseCategories,
    investmentCategories,
    getCategoriesForType,
    updateBudgetValue,
  }
})
