import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildBudgetViewModel } from '../domain/budget/view-model'
import { resolveCategoryId, syncUpsert, type CategoryKind } from '../lib/client/command-mapping'
import type { BudgetType } from '../scripts/types'
import { round2 } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

/**
 * WP7b — maps one `budget[type][category][month]` cell to a `budgetEntry`
 * sync command payload, keyed by the synthetic legacy id
 * `${type}:${category}:${month}` (legacy `State` has no per-entry id —
 * budget values are plain nested arrays). Returns `null` when the
 * category hasn't synced yet: `entityCreateSchemas.budgetEntry.categoryId`
 * is a required field (unlike most other cross-entity references), so
 * there is no optional fallback — the edit will sync on the next change to
 * the same cell once the category has caught up (documented leftover).
 */
async function buildBudgetEntryData(
  type: BudgetType,
  category: string,
  year: number,
  month: number,
  amount: number,
  currency: string,
) {
  const categoryId = await resolveCategoryId(type as CategoryKind, category)
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

    const localId = `${type}:${category}:${month + 1}`
    const amount = round2(value)
    const year = financialStateStore.year
    const currency = financialStateStore.currency
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
