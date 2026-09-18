import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildBudgetViewModel } from '../domain/budget/view-model'
import { resolveOrCreateCategoryId, syncBudgetEntry, type CategoryKind } from '../lib/client/command-mapping'
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

    const amount = round2(value)
    const year = financialStateStore.year
    const currency = financialStateStore.currency
    void (async () => {
      // `resolveOrCreateCategoryId`, not `resolveCategoryId`: a cell's
      // `categoryId` is required, so a category that hasn't synced yet must
      // not make this drop the cell's first edit (audit §4.7).
      const categoryId = await resolveOrCreateCategoryId(type as CategoryKind, category)
      if (!categoryId) {
        return
      }
      // Addressed by the cell's own natural key — category, year, month
      // (ADR 0001; audit §4.4 — a year-less key let a same-month edit in
      // another year resolve to last year's row).
      await syncBudgetEntry(categoryId, year, month + 1, amount, currency)
    })()
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
