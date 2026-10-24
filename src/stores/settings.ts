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
import { useMarketStore } from './market'

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

const CATEGORY_KIND_BY_KEY: Record<CategoryKey, 'income' | 'expense' | 'saving' | 'investment'> = {
  incomeCategories: 'income',
  expenseCategories: 'expense',
  savingCategories: 'saving',
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

  /**
   * The trimmed name if it is usable for an entity of `key`, else null after
   * telling why. The duplicate check compares normalized names, so `Revolut`
   * and `revolut` keep colliding exactly as they did when the slug was the id.
   */
  function usableName(key: EntityKey, name: string, exceptId?: string): string | null {
    const trimmedName = name.trim()
    if (!trimmedName) {
      showToast('Indica un nombre.')
      return null
    }
    const normalized = slug(trimmedName)
    if (
      financialStateStore.state[key].some(
        (item) => item.id !== exceptId && slug(item.name) === normalized,
      )
    ) {
      showToast('Ese elemento ya existe.')
      return null
    }
    return trimmedName
  }

  function addEntity(key: EntityKey, name: string, openingBalance: string): boolean {
    const trimmedName = usableName(key, name)
    if (!trimmedName) return false

    // The entity's identity is minted here and never derived from its name
    // (ADR 0001): renaming it later leaves the identity — and the row — alone.
    const id = newId()

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

  function updateEntityField(key: EntityKey, id: string, field: EntityField, value: string): void {
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

  /** Saves the name and opening balance of an entity's card at once. */
  function saveEntity(key: EntityKey, id: string, name: string, openingBalance: number): boolean {
    const trimmedName = usableName(key, name, id)
    if (!trimmedName) return false

    const before = financialStateStore.state[key]
    financialStateStore.commitState((draft) => {
      const item = draft[key].find((entry) => entry.id === id)
      if (!item) return
      item.name = trimmedName
      item.openingBalance = round2(Number.isFinite(openingBalance) ? openingBalance : 0)
      if (key === 'investmentAssets') {
        syncInvestmentCategoriesWithAssets(draft)
      }
    })
    syncEntities(key, before)
    showToast('Cambios guardados.')
    return true
  }

  /** What keeps an account as the destination of savings, in words; empty when nothing does. */
  function savingDestinationUse(accountId: string): string {
    const state = financialStateStore.state
    const uses = [
      [
        state.transactions.filter(
          (tx) => tx.type === 'saving' && tx.destinationAccountId === accountId,
        ).length,
        'ahorro',
        'ahorros',
      ],
      [
        state.recurringRules.filter(
          (rule) => rule.type === 'saving' && rule.destinationAccountId === accountId,
        ).length,
        'regla recurrente de ahorro',
        'reglas recurrentes de ahorro',
      ],
      [
        state.pendingMovements.filter(
          (item) =>
            item.type === 'saving' &&
            item.status === 'pending' &&
            item.destinationAccountId === accountId,
        ).length,
        'pendiente de ahorro',
        'pendientes de ahorro',
      ],
    ] as const
    return uses
      .filter(([count]) => count > 0)
      .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
      .join(', ')
  }

  function removeEntity(key: EntityKey, id: string): void {
    if (key === 'accounts') {
      const use = savingDestinationUse(id)
      if (use) {
        const name = financialStateStore.state.accounts.find((item) => item.id === id)?.name
        showToast(
          `No se puede eliminar${name ? ` «${name}»` : ''}: es la cuenta destino de ${use}.`,
        )
        return
      }
    }
    const before = financialStateStore.state[key]
    const quoteIds =
      key === 'investmentAssets'
        ? financialStateStore.instruments
            .filter((instrument) => instrument.investmentAssetId === id)
            .map((instrument) => instrument.id)
        : []
    const wasTwrLiquidity =
      key === 'accounts' && (financialStateStore.state.twrLiquidityAccountIds || []).includes(id)
    financialStateStore.commitState((draft) => {
      draft[key] = draft[key].filter((item) => item.id !== id)

      if (key === 'accounts') {
        draft.transactions = draft.transactions.filter((tx) => tx.accountId !== id)
        draft.subscriptions = draft.subscriptions.filter(
          (subscription) => subscription.accountId !== id,
        )
        draft.twrLiquidityAccountIds = (draft.twrLiquidityAccountIds || []).filter(
          (accountId) => accountId !== id,
        )
      }
      if (key === 'investmentAssets') {
        // Its quote instruments only show on its card: they go with it.
        const gone = new Set(
          draft.instruments.filter((item) => item.investmentAssetId === id).map((item) => item.id),
        )
        draft.instruments = draft.instruments.filter((item) => !gone.has(item.id))
        gone.forEach((instrumentId) => delete draft.quotes[instrumentId])
        syncInvestmentCategoriesWithAssets(draft)
      }
    })
    for (const quoteId of quoteIds) useMarketStore().removeInstrument(quoteId)
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
    saveEntity,
    removeEntity,
    addCategory,
    removeCategory,
    reorderCategory,
    setCategoryEmoji,
    resetCategoryEmoji,
    toggleTwrLiquidity,
  }
})
