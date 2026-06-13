import { defineStore } from 'pinia'
import { computed } from 'vue'

import type { BudgetType } from '../scripts/types'
import { useFinancialStateStore } from './financial-state'

export const useBudgetStore = defineStore('budget', () => {
  const financialStateStore = useFinancialStateStore()

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

  return {
    budget,
    incomeCategories,
    expenseCategories,
    investmentCategories,
    getCategoriesForType,
  }
})
