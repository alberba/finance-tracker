import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildBudgetViewModel } from '../domain/budget/view-model'
import { resolveOrCreateCategoryId, syncUpsert, type CategoryKind } from '../lib/client/command-mapping'
import type { BudgetType } from '../scripts/types'
import { round2 } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

/**
 * Maps one `budget[type][category][month]` cell to a `budgetEntry` sync
 * command payload, keyed by the cell's identity — category, year and month
 * (ADR 0001; audit §4.4 — the year-less legacy id let a same-month edit in
 * another year resolve to last year's row). Uses
 * `resolveOrCreateCategoryId`, not `resolveCategoryId`: `budgetEntry.categoryId`
 * is required, so a category that hasn't synced yet must not make this
 * return `null` — that would drop the cell's first edit entirely (audit
 * §4.7).
 */
async function buildBudgetEntryData(
  type: BudgetType,
  category: string,
  year: number,
  month: number,
  amount: number,
  currency: string,
) {
  const categoryId = await resolveOrCreateCategoryId(type as CategoryKind, category)
  if (!categoryId) {
    return null
  }
  return { categoryId, year, month, amount, currency }
}

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
    const localId = `${type}:${category}:${year}:${month + 1}`
    void (async () => {
      const data = await buildBudgetEntryData(type, category, year, month + 1, amount, currency)
      if (data) {
        // `entityUpdateSchemas.budgetEntry` only declares `amount`/`currency`
        // — its identity (`categoryId`/`year`/`month`) never travels in an
        // update, so a later edit of an already-synced cell must not resend
        // it (would now fail strict-schema validation instead of being
        // silently stripped, issue #138).
        await syncUpsert('budgetEntry', localId, data, { amount, currency })
      }
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
