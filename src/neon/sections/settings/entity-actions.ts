import { useToast } from '../../../composables/useToast'
import { formatMoney } from '../../../lib/format'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMarketStore } from '../../../stores/market'
import { useSettingsStore } from '../../../stores/settings'
import type { PendingDeletion } from './deletion'
import { openingBalanceText, parseAmount } from './view-model'

// What Cuentas, Activos and Pasivos do with one of their rows, the same from
// the desktop table (edited in place) as from the mobile sheet.

export type EntityKind = 'accounts' | 'investmentAssets' | 'liabilities'

interface EntityRef {
  id: string
  name: string
  openingBalance: number
}

/** The words of each kind, for titles, labels and messages. */
export const ENTITY_WORDS: Record<
  EntityKind,
  { one: string; the: string; fresh: string; edit: string; balance: string }
> = {
  accounts: {
    one: 'cuenta',
    the: 'esta cuenta',
    fresh: 'Nueva cuenta',
    edit: 'Editar cuenta',
    balance: 'Saldo inicial',
  },
  investmentAssets: {
    one: 'activo',
    the: 'este activo',
    fresh: 'Nuevo activo',
    edit: 'Editar activo',
    balance: 'Valor inicial',
  },
  liabilities: {
    one: 'pasivo',
    the: 'este pasivo',
    fresh: 'Nuevo pasivo',
    edit: 'Editar pasivo',
    balance: 'Importe inicial',
  },
}

const CONSEQUENCES: Record<EntityKind, string> = {
  accounts: 'Se eliminan también sus movimientos y suscripciones. ',
  investmentAssets:
    'Se quitan también sus instrumentos de cotización; sus movimientos se conservan. ',
  liabilities: '',
}

export function useEntityActions(kind: EntityKind) {
  const settingsStore = useSettingsStore()
  const financialStateStore = useFinancialStateStore()
  const marketStore = useMarketStore()
  const { showToast } = useToast()
  const words = ENTITY_WORDS[kind]

  /** Saves the name and the typed balance; false when the store or the number says no. */
  function save(row: EntityRef, name: string, balanceText: string): boolean {
    const value = parseAmount(balanceText)
    if (value === null) {
      showToast(`El ${words.balance.toLowerCase()} no es un número.`)
      return false
    }
    return settingsStore.saveEntity(kind, row.id, name, value)
  }

  /**
   * Creates one; an asset with a symbol also gets the quote that prices it.
   * False when nothing was created.
   */
  function add(name: string, balanceText: string, symbol = ''): boolean {
    const opening = openingBalanceText(balanceText)
    if (opening === null) {
      showToast(`El ${words.balance.toLowerCase()} no es un número.`)
      return false
    }
    if (!settingsStore.addEntity(kind, name, opening)) return false
    if (kind === 'investmentAssets' && symbol.trim()) {
      const trimmed = name.trim()
      const asset = financialStateStore.state.investmentAssets.find((item) => item.name === trimmed)
      if (asset) {
        marketStore.addInstrument({
          investmentAssetId: asset.id,
          type: 'etf',
          symbol,
          market: '',
          currency: financialStateStore.currency,
          provider: 'yahoo',
        })
      }
    }
    return true
  }

  /** The confirmation that removes it. */
  function deletion(row: EntityRef): PendingDeletion {
    return {
      title: `¿Eliminar ${words.the}?`,
      confirmLabel: `Eliminar ${words.one}`,
      message: `${row.name}, con su ${words.balance.toLowerCase()} de ${formatMoney(row.openingBalance)}. ${CONSEQUENCES[kind]}No se puede deshacer.`,
      run: () => settingsStore.removeEntity(kind, row.id),
    }
  }

  return { words, save, add, deletion }
}
