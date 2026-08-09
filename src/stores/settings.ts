import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildSettingsViewModel, categoryKeyToType } from '../domain/settings/view-model'
import { useToast } from '../composables/useToast'
import { categoryLocalId, syncListDiff, syncSettingsUpdate } from '../lib/client/command-mapping'
import { categoryEmojiKey } from '../scripts/category-emoji'
import type { CategoryKey, Entity, EntityKey, State } from '../scripts/types'
import { parseFloatSafe, parseIntSafe, round2, slug } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

export type ReorderDirection = 'up' | 'down'

export type EntityField = 'name' | 'openingBalance'

/**
 * WP7b — maps a legacy `Entity` (accounts store only — see the module's
 * leftover note below) to an `account` sync command payload. Legacy state
 * has no per-account `kind`; `'checking'` is used as a fixed default since
 * the app has no UI to set anything else today (documented approximation).
 */
function buildAccountData(entity: Entity, currency: string) {
  return {
    name: entity.name,
    kind: 'checking',
    currency,
    openingBalance: entity.openingBalance,
  }
}

const CATEGORY_KIND_BY_KEY: Record<CategoryKey, 'income' | 'expense' | 'investment'> = {
  incomeCategories: 'income',
  expenseCategories: 'expense',
  investmentCategories: 'investment',
}

interface CategoryDiffRow {
  id: string
  name: string
  sortOrder: number
}

function flattenCategories(key: CategoryKey, names: string[]): CategoryDiffRow[] {
  const kind = CATEGORY_KIND_BY_KEY[key]
  return names.map((name, index) => ({ id: categoryLocalId(kind, name), name, sortOrder: index }))
}

/** WP7b — maps a flattened category row to a `category` sync command payload. */
function buildCategoryData(key: CategoryKey, row: CategoryDiffRow) {
  return { name: row.name, kind: CATEGORY_KIND_BY_KEY[key], sortOrder: row.sortOrder }
}

function syncInvestmentCategoriesWithAssets(draft: State): void {
  const assetNames = draft.investmentAssets.map((item) => item.name)
  draft.investmentCategories = Array.from(
    new Set([...(draft.investmentCategories || []), ...assetNames]),
  )
}

export const useSettingsStore = defineStore('settings', () => {
  const financialStateStore = useFinancialStateStore()
  const { showToast } = useToast()

  const viewModel = computed(() => buildSettingsViewModel(financialStateStore.state))

  function saveGeneral(year: string, currency: string): void {
    financialStateStore.commitState((draft) => {
      draft.year = parseIntSafe(year, draft.year)
      draft.currency = String(currency || draft.currency || 'EUR')
        .toUpperCase()
        .slice(0, 3)
    })
    // `year` has no counterpart in `user_settings`/`settingsUpdateCommandSchema`
    // (currency/locale/theme only) — it stays a client-only concept, not synced.
    void syncSettingsUpdate({ currency: financialStateStore.currency })
    showToast('Configuración general guardada.')
  }

  function addEntity(key: EntityKey, name: string, openingBalance: string): boolean {
    const trimmedName = name.trim()
    if (!trimmedName) {
      showToast('Indica un nombre.')
      return false
    }

    const id = slug(trimmedName)
    if (financialStateStore.state[key].some((item) => item.id === id)) {
      showToast('Ese elemento ya existe.')
      return false
    }

    const before = financialStateStore.accounts
    financialStateStore.commitState((draft) => {
      draft[key].push({
        id,
        name: trimmedName,
        openingBalance: round2(parseFloatSafe(openingBalance, 0)),
      })
    })
    // WP7b — only `accounts` maps to a `SyncEntityType` ('account');
    // `investmentAssets`/`liabilities` have no corresponding v2 table today
    // and are intentionally left unsynced (documented leftover).
    if (key === 'accounts') {
      void syncListDiff('account', before, financialStateStore.accounts, (entity) =>
        buildAccountData(entity, financialStateStore.currency),
      )
    }
    showToast('Elemento agregado.')
    return true
  }

  function updateEntityField(
    key: EntityKey,
    id: string,
    field: EntityField,
    value: string,
  ): void {
    const before = financialStateStore.accounts
    financialStateStore.commitState((draft) => {
      const item = draft[key].find((entry) => entry.id === id)
      if (!item) {
        return
      }

      if (field === 'name') {
        item.name = value
      } else {
        item.openingBalance = round2(parseFloatSafe(value, 0))
      }

      if (key === 'investmentAssets') {
        syncInvestmentCategoriesWithAssets(draft)
      }
    })
    if (key === 'accounts') {
      void syncListDiff('account', before, financialStateStore.accounts, (entity) =>
        buildAccountData(entity, financialStateStore.currency),
      )
    }
  }

  function removeEntity(key: EntityKey, id: string): void {
    const before = financialStateStore.accounts
    financialStateStore.commitState((draft) => {
      draft[key] = draft[key].filter((item) => item.id !== id)

      if (key === 'accounts') {
        draft.transactions = draft.transactions.filter((tx) => tx.accountId !== id)
        draft.subscriptions = draft.subscriptions.filter((subscription) => subscription.accountId !== id)
        draft.twrLiquidityAccountIds = (draft.twrLiquidityAccountIds || []).filter(
          (accountId) => accountId !== id,
        )
      }
      if (key === 'investmentAssets') {
        syncInvestmentCategoriesWithAssets(draft)
      }
    })
    // Note (documented leftover): the cascade above also drops the
    // account's transactions/subscriptions from local state, but only the
    // `account` row's own removal is synced here — cascading those deletes
    // server-side is left to the `account` row's FK behavior rather than
    // emitting a `remove` per affected transaction/subscription.
    if (key === 'accounts') {
      void syncListDiff('account', before, financialStateStore.accounts, (entity) =>
        buildAccountData(entity, financialStateStore.currency),
      )
    }
    showToast('Elemento eliminado.')
  }

  function addCategory(key: CategoryKey, name: string): boolean {
    const trimmedName = name.trim()
    if (!trimmedName) {
      return false
    }

    const before = flattenCategories(key, financialStateStore.state[key])
    financialStateStore.commitState((draft) => {
      if (!draft[key].includes(trimmedName)) {
        draft[key].push(trimmedName)
      }
    })
    void syncListDiff('category', before, flattenCategories(key, financialStateStore.state[key]), (row) =>
      buildCategoryData(key, row),
    )
    showToast('Categoría agregada.')
    return true
  }

  function removeCategory(key: CategoryKey, name: string): void {
    const before = flattenCategories(key, financialStateStore.state[key])
    financialStateStore.commitState((draft) => {
      draft[key] = draft[key].filter((item) => item !== name)
      delete draft.categoryEmojis[categoryEmojiKey(categoryKeyToType(key), name)]
    })
    void syncListDiff('category', before, flattenCategories(key, financialStateStore.state[key]), (row) =>
      buildCategoryData(key, row),
    )
    showToast('Categoría eliminada.')
  }

  function reorderCategory(key: CategoryKey, name: string, direction: ReorderDirection): void {
    const before = flattenCategories(key, financialStateStore.state[key])
    financialStateStore.commitState((draft) => {
      const list = draft[key]
      const index = list.indexOf(name)
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
        return
      }

      const [moved] = list.splice(index, 1)
      list.splice(targetIndex, 0, moved)
    })
    void syncListDiff('category', before, flattenCategories(key, financialStateStore.state[key]), (row) =>
      buildCategoryData(key, row),
    )
  }

  function setCategoryEmoji(key: CategoryKey, name: string, emoji: string): void {
    const trimmedEmoji = emoji.trim()
    if (!trimmedEmoji) {
      return
    }

    financialStateStore.commitState((draft) => {
      draft.categoryEmojis[categoryEmojiKey(categoryKeyToType(key), name)] = trimmedEmoji
    })
    showToast('Emoji actualizado.')
  }

  function resetCategoryEmoji(key: CategoryKey, name: string): void {
    financialStateStore.commitState((draft) => {
      delete draft.categoryEmojis[categoryEmojiKey(categoryKeyToType(key), name)]
    })
    showToast('Emoji restablecido.')
  }

  function toggleTwrLiquidity(accountId: string, enabled: boolean): void {
    const id = accountId.trim()
    if (!id) {
      return
    }

    financialStateStore.commitState((draft) => {
      const selection = new Set((draft.twrLiquidityAccountIds || []).map((item) => String(item)))
      if (enabled) {
        selection.add(id)
      } else {
        selection.delete(id)
      }
      draft.twrLiquidityAccountIds = Array.from(selection)
    })
    showToast('Configuración TWR actualizada.')
  }

  return {
    viewModel,
    saveGeneral,
    addEntity,
    updateEntityField,
    removeEntity,
    addCategory,
    removeCategory,
    reorderCategory,
    setCategoryEmoji,
    resetCategoryEmoji,
    toggleTwrLiquidity,
  }
})
