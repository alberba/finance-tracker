import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildSettingsViewModel } from '../domain/settings/view-model'
import { useToast } from '../composables/useToast'
import type { CategoryKey, EntityKey, State } from '../scripts/types'
import { parseFloatSafe, parseIntSafe, round2, slug } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

export type EntityField = 'name' | 'openingBalance'

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

    financialStateStore.commitState((draft) => {
      draft[key].push({
        id,
        name: trimmedName,
        openingBalance: round2(parseFloatSafe(openingBalance, 0)),
      })
    })
    showToast('Elemento agregado.')
    return true
  }

  function updateEntityField(
    key: EntityKey,
    id: string,
    field: EntityField,
    value: string,
  ): void {
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
  }

  function removeEntity(key: EntityKey, id: string): void {
    financialStateStore.commitState((draft) => {
      draft[key] = draft[key].filter((item) => item.id !== id)

      if (key === 'accounts') {
        draft.transactions = draft.transactions.filter((tx) => tx.accountId !== id)
        draft.twrLiquidityAccountIds = (draft.twrLiquidityAccountIds || []).filter(
          (accountId) => accountId !== id,
        )
      }
      if (key === 'investmentAssets') {
        syncInvestmentCategoriesWithAssets(draft)
      }
    })
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
    showToast('Categoría agregada.')
    return true
  }

  function removeCategory(key: CategoryKey, name: string): void {
    financialStateStore.commitState((draft) => {
      draft[key] = draft[key].filter((item) => item !== name)
    })
    showToast('Categoría eliminada.')
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
    toggleTwrLiquidity,
  }
})
