import { categoryEmojiKey, getCategoryEmoji } from '../../scripts/category-emoji'
import type { BudgetType, CategoryKey, Entity, State } from '../../scripts/types'

export interface CategoryTagViewModel {
  name: string
  emoji: string
  /** Whether `emoji` comes from a user-chosen override rather than the default map. */
  isCustomEmoji: boolean
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

function buildCategoryTags(
  key: CategoryKey,
  names: string[],
  categoryEmojis: Record<string, string>,
): CategoryTagViewModel[] {
  const type = categoryKeyToType(key)
  return names.map((name) => ({
    name,
    emoji: getCategoryEmoji(type, name, categoryEmojis),
    isCustomEmoji: Boolean(categoryEmojis[categoryEmojiKey(type, name)]),
  }))
}

export function buildSettingsViewModel(state: State): SettingsViewModel {
  const selected = new Set((state.twrLiquidityAccountIds || []).map((id) => String(id)))

  return {
    year: state.year,
    currency: state.currency || 'EUR',
    accounts: state.accounts,
    investmentAssets: state.investmentAssets,
    liabilities: state.liabilities,
    incomeCategories: buildCategoryTags(
      'incomeCategories',
      state.incomeCategories || [],
      state.categoryEmojis,
    ),
    expenseCategories: buildCategoryTags(
      'expenseCategories',
      state.expenseCategories || [],
      state.categoryEmojis,
    ),
    investmentCategories: buildCategoryTags(
      'investmentCategories',
      state.investmentCategories || [],
      state.categoryEmojis,
    ),
    twrLiquidityOptions: (state.accounts || []).map((account) => ({
      id: account.id,
      name: account.name,
      selected: selected.has(account.id),
    })),
  }
}
