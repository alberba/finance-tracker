import type { BudgetType, State } from '../../scripts/types'

function getCategoriesForType(state: State, type: BudgetType): string[] {
  if (type === 'income') {
    return state.incomeCategories
  }
  if (type === 'expense') {
    return state.expenseCategories
  }
  return state.investmentCategories
}

/**
 * Categories for a transaction type. Expense categories are ordered by how
 * often they are used so the most frequent ones surface first in the picker.
 */
export function getOrderedCategoriesForType(state: State, type: BudgetType): string[] {
  const categories = getCategoriesForType(state, type)
  if (type !== 'expense') {
    return categories
  }

  const usageByCategory = state.transactions.reduce<Record<string, number>>((acc, tx) => {
    if (tx.type !== 'expense') {
      return acc
    }
    const category = String(tx.category || '').trim()
    if (!category) {
      return acc
    }
    acc[category] = (acc[category] || 0) + 1
    return acc
  }, {})

  return [...categories].sort((a, b) => {
    const usageA = usageByCategory[a] || 0
    const usageB = usageByCategory[b] || 0
    if (usageA !== usageB) {
      return usageB - usageA
    }
    return categories.indexOf(a) - categories.indexOf(b)
  })
}
