import { ALL_MONTHS, atMonth, monthIndex, type Month } from '../lib/month'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import { buildBudgetViewModel } from '../domain/budget/view-model'
import {
  resolveOrCreateCategoryId,
  syncBudgetEntry,
  type CategoryKind,
} from '../lib/client/command-mapping'
import type { BudgetType, State } from '../scripts/types'
import { round2 } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

export const useBudgetStore = defineStore('budget', () => {
  const financialStateStore = useFinancialStateStore()
  const { showToast } = useToast()

  const viewModel = computed(() => buildBudgetViewModel(financialStateStore.state))
  const budget = computed(() => financialStateStore.budget)
  const incomeCategories = computed(() => financialStateStore.state.incomeCategories)
  const expenseCategories = computed(() => financialStateStore.state.expenseCategories)
  const savingCategories = computed(() => financialStateStore.state.savingCategories)
  const investmentCategories = computed(() => financialStateStore.state.investmentCategories)

  function getCategoriesForType(type: BudgetType): string[] {
    if (type === 'income') {
      return incomeCategories.value
    }
    if (type === 'expense') {
      return expenseCategories.value
    }
    if (type === 'saving') {
      return savingCategories.value
    }
    return investmentCategories.value
  }

  function ensureRow(draft: State, type: BudgetType, category: string): number[] {
    draft.budget[type] ??= {}
    const row = (draft.budget[type][category] ??= [])
    while (row.length < 12) row.push(0)
    return row
  }

  function syncMonths(type: BudgetType, category: string, amounts: Map<Month, number>): void {
    if (!amounts.size) return
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
      for (const [month, amount] of amounts) {
        await syncBudgetEntry(categoryId, year, month, amount, currency)
      }
    })()
  }

  function updateBudgetValue(
    type: BudgetType,
    category: string,
    month: Month,
    value: number,
  ): void {
    const amount = round2(value)
    financialStateStore.commitState((draft) => {
      ensureRow(draft, type, category)[monthIndex(month)] = amount
    })
    syncMonths(type, category, new Map([[month, amount]]))
  }

  /** The twelve months of a category at once: one commit, a sync per month that changed. */
  function saveBudgetPlan(type: BudgetType, category: string, plan: readonly number[]): void {
    const changed = new Map<Month, number>()
    financialStateStore.commitState((draft) => {
      const row = ensureRow(draft, type, category)
      for (const month of ALL_MONTHS) {
        const amount = round2(atMonth(plan, month) ?? 0)
        if (row[monthIndex(month)] === amount) continue
        row[monthIndex(month)] = amount
        changed.set(month, amount)
      }
    })
    syncMonths(type, category, changed)
    showToast(`Plan de ${category} guardado.`)
  }

  return {
    viewModel,
    budget,
    incomeCategories,
    expenseCategories,
    savingCategories,
    investmentCategories,
    getCategoriesForType,
    updateBudgetValue,
    saveBudgetPlan,
  }
})
