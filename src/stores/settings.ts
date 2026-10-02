import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildSettingsViewModel, categoryKeyToType } from '../domain/settings/view-model'
import { useToast } from '../composables/useToast'
import { newId } from '../lib/client/ids'
import {
  syncCategoryRemove,
  syncCategoryUpsert,
  syncListDiff,
  syncSettingsUpdate,
  syncTwrLiquidityAccounts,
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

function syncCategoryEmoji(key: CategoryKey, name: string, emoji: string | null) {
  return syncCategoryUpsert(CATEGORY_KIND_BY_KEY[key], name, { emoji })
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

    // The entity's identity is minted here and never derived from its name
    // (ADR 0001): renaming it later leaves the identity — and the row — alone.
    const id = newId()
    // The duplicate check still compares normalized names, so `Revolut` and
    // `revolut` keep colliding exactly as they did when the slug was the id.
    const normalized = slug(trimmedName)
    if (financialStateStore.state[key].some((item) => slug(item.name) === normalized)) {
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

    financialStateStore.commitState((draft) => {
      if (!draft[key].includes(trimmedName)) {
        draft[key].push(trimmedName)
      }
    })
    void syncCategoryUpsert(CATEGORY_KIND_BY_KEY[key], trimmedName, {
      sortOrder: financialStateStore.state[key].indexOf(trimmedName),
    })
    showToast('Categoría agregada.')
    return true
  }

  function removeCategory(key: CategoryKey, name: string): void {
    financialStateStore.commitState((draft) => {
      draft[key] = draft[key].filter((item) => item !== name)
      delete draft.categoryEmojis[categoryEmojiKey(categoryKeyToType(key), name)]
    })
    void syncCategoryRemove(CATEGORY_KIND_BY_KEY[key], name)
    showToast('Categoría eliminada.')
  }

  function reorderCategory(key: CategoryKey, name: string, direction: ReorderDirection): void {
    const beforeIndex = new Map(financialStateStore.state[key].map((item, index) => [item, index]))
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
    // Only the rows whose position actually moved get a command.
    const kind = CATEGORY_KIND_BY_KEY[key]
    const reordered = [...financialStateStore.state[key]]
    void (async () => {
      for (const [index, category] of reordered.entries()) {
        if (beforeIndex.get(category) !== index) {
          await syncCategoryUpsert(kind, category, { sortOrder: index })
        }
      }
    })()
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
