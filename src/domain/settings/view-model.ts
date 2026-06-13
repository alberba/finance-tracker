import { decorateCategoryLabel } from '../../scripts/category-emoji'
import type { BudgetType, CategoryKey, Entity, State } from '../../scripts/types'

export interface CategoryTagViewModel {
  name: string
  label: string
}

export interface TwrLiquidityOptionViewModel {
  id: string
  name: string
  selected: boolean
}

export interface SettingsViewModel {
  year: number
  currency: string
  accounts: Entity[]
  investmentAssets: Entity[]
  liabilities: Entity[]
  incomeCategories: CategoryTagViewModel[]
  expenseCategories: CategoryTagViewModel[]
  investmentCategories: CategoryTagViewModel[]
  twrLiquidityOptions: TwrLiquidityOptionViewModel[]
}

export function categoryKeyToType(key: CategoryKey): BudgetType {
  if (key === 'incomeCategories') {
    return 'income'
  }
  if (key === 'expenseCategories') {
    return 'expense'
  }
  return 'investment'
}

function buildCategoryTags(key: CategoryKey, names: string[]): CategoryTagViewModel[] {
  const type = categoryKeyToType(key)
  return names.map((name) => ({ name, label: decorateCategoryLabel(type, name) }))
}

export function buildSettingsViewModel(state: State): SettingsViewModel {
  const selected = new Set((state.twrLiquidityAccountIds || []).map((id) => String(id)))

  return {
    year: state.year,
    currency: state.currency || 'EUR',
    accounts: state.accounts,
    investmentAssets: state.investmentAssets,
    liabilities: state.liabilities,
    incomeCategories: buildCategoryTags('incomeCategories', state.incomeCategories || []),
    expenseCategories: buildCategoryTags('expenseCategories', state.expenseCategories || []),
    investmentCategories: buildCategoryTags(
      'investmentCategories',
      state.investmentCategories || [],
    ),
    twrLiquidityOptions: (state.accounts || []).map((account) => ({
      id: account.id,
      name: account.name,
      selected: selected.has(account.id),
    })),
  }
}
