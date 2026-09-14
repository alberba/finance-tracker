import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildSettingsViewModel, categoryKeyToType } from '../domain/settings/view-model'
import { useToast } from '../composables/useToast'
import {
  categoryLocalId,
  syncListDiff,
  syncSettingsUpdate,
  syncTwrLiquidityAccounts,
  syncUpsert,
} from '../lib/client/command-mapping'
import { categoryEmojiKey } from '../scripts/category-emoji'
import type { CategoryKey, Entity, EntityKey, State } from '../scripts/types'
import { parseFloatSafe, parseIntSafe, round2, slug } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

export type ReorderDirection = 'up' | 'down'

export type EntityField = 'name' | 'openingBalance'

const ACCOUNT_KIND_BY_KEY: Record<EntityKey, 'cash' | 'investment' | 'liability'> = {
  accounts: 'cash',
  investmentAssets: 'investment',
  liabilities: 'liability',
}

function buildAccountData(key: EntityKey, currency: string) {
  return (entity: Entity, previous?: Entity): Record<string, unknown> => {
    if (previous) {
      return {
        ...(entity.name !== previous.name ? { name: entity.name } : {}),
        ...(entity.openingBalance !== previous.openingBalance
          ? { openingBalance: entity.openingBalance }
          : {}),
      }
    }

    return {
      name: entity.name,
      kind: ACCOUNT_KIND_BY_KEY[key],
      currency,
      openingBalance: entity.openingBalance,
    }
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

function syncCategoryEmoji(key: CategoryKey, name: string, emoji: string | null) {
  const kind = CATEGORY_KIND_BY_KEY[key]
  return syncUpsert('category', categoryLocalId(kind, name), { name, kind, emoji })
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

  function syncEntities(key: EntityKey, before: readonly Entity[]): void {
    void syncListDiff(
      'account',
      before,
      financialStateStore.state[key],
      buildAccountData(key, financialStateStore.currency),
    )
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

    const before = financialStateStore.state[key]
    financialStateStore.commitState((draft) => {
      draft[key].push({
        id,
        name: trimmedName,
        openingBalance: round2(parseFloatSafe(openingBalance, 0)),
      })
    })
    syncEntities(key, before)
    showToast('Elemento agregado.')
    return true
  }

  function updateEntityField(
    key: EntityKey,
    id: string,
    field: EntityField,
    value: string,
  ): void {
    const before = financialStateStore.state[key]
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
    syncEntities(key, before)
  }

  function removeEntity(key: EntityKey, id: string): void {
    const before = financialStateStore.state[key]
    const wasTwrLiquidity =
      key === 'accounts' && (financialStateStore.state.twrLiquidityAccountIds || []).includes(id)
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
    if (wasTwrLiquidity) {
      // The liquidity mark references the account, so it goes first.
      void syncTwrLiquidityAccounts(financialStateStore.state.twrLiquidityAccountIds).then(() =>
        syncEntities(key, before),
      )
    } else {
      syncEntities(key, before)
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
    void syncCategoryEmoji(key, name, trimmedEmoji)
    showToast('Emoji actualizado.')
  }

  function resetCategoryEmoji(key: CategoryKey, name: string): void {
    financialStateStore.commitState((draft) => {
      delete draft.categoryEmojis[categoryEmojiKey(categoryKeyToType(key), name)]
    })
    void syncCategoryEmoji(key, name, null)
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
    void syncTwrLiquidityAccounts(financialStateStore.state.twrLiquidityAccountIds)
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
