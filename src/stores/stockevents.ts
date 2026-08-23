/**
 * WP7b leftover (documented, intentionally NOT wired to sync-v2 commands):
 * `saveApiKey`/`updateMapping`/`setEnabled` write `integration_credentials`-
 * and `stockevents_symbol_mappings`-shaped data, both explicitly excluded
 * from `SYNC_ENTITY_TYPES` in `src/lib/server/sync/command-schemas.ts`
 * ("WP12 owns encryption semantics" / "no version column to drive
 * optimistic concurrency"). These need a dedicated encrypted-credentials
 * endpoint (WP12), not the generic sync-command outbox — left unwired.
 */
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { useToast } from '../composables/useToast'
import {
  buildStockEventsTransactionPayload,
  findSyncedMapping,
} from '../domain/stockevents/transaction-payload'
import {
  checkStockEventsSymbols,
  createStockEventsTransaction,
  fetchStockEventsWatchlists,
  type StockEventsWatchlist,
  type SymbolCheckResult,
} from '../services/stockevents-api'
import type { StockEventsSymbolMapping, Transaction } from '../scripts/types'
import { useFinancialStateStore } from './financial-state'

export interface StockEventsSymbolRow {
  symbol: string
  sync: boolean
  watchlistId: string
  targetSymbol: string
  hidden: boolean
  hasInstrument: boolean
  checkResult: SymbolCheckResult | null
}

export interface StockEventsSyncOptions {
  toCash?: boolean
}

export const useStockEventsStore = defineStore('stockEvents', () => {
  const financialStateStore = useFinancialStateStore()
  const { showToast } = useToast()

  const watchlists = shallowRef<StockEventsWatchlist[]>([])
  const isLoadingWatchlists = shallowRef(false)
  const isChecking = shallowRef(false)
  const connectionError = shallowRef('')
  const checkResults = shallowRef<Record<string, SymbolCheckResult>>({})

  const settings = computed(() => financialStateStore.state.stockEvents)
  const isConnected = computed(() => settings.value.enabled && Boolean(settings.value.apiKey))

  function canSyncSymbol(symbol: string): boolean {
    return isConnected.value && Boolean(findSyncedMapping(settings.value, symbol))
  }

  const trackedSymbols = computed(() => {
    const symbols = new Set<string>()
    financialStateStore.state.instruments.forEach((instrument) => {
      if (instrument.symbol) symbols.add(instrument.symbol.toUpperCase())
    })
    financialStateStore.state.transactions.forEach((tx) => {
      if (tx.type === 'investment' && tx.symbol) symbols.add(tx.symbol.toUpperCase())
    })
    return Array.from(symbols).sort((a, b) => a.localeCompare(b))
  })

  const symbolRows = computed<StockEventsSymbolRow[]>(() => {
    const mappingsBySymbol = new Map(
      settings.value.symbolMappings.map((mapping) => [mapping.symbol, mapping]),
    )
    const instrumentSymbols = new Set(
      financialStateStore.state.instruments.map((instrument) => instrument.symbol.toUpperCase()),
    )
    return trackedSymbols.value.map((symbol) => {
      const mapping = mappingsBySymbol.get(symbol)
      return {
        symbol,
        sync: mapping?.sync === true,
        watchlistId: mapping?.watchlistId || '',
        targetSymbol: mapping?.targetSymbol || '',
        hidden: mapping?.hidden === true,
        hasInstrument: instrumentSymbols.has(symbol),
        checkResult: checkResults.value[symbol] || null,
      }
    })
  })

  function saveApiKey(value: string): void {
    const apiKey = value.trim()
    financialStateStore.commitState((draft) => {
      draft.stockEvents.apiKey = apiKey
    })
    connectionError.value = ''
    showToast(apiKey ? 'API key de Stock Events guardada.' : 'API key de Stock Events eliminada.')
  }

  function setEnabled(enabled: boolean): void {
    financialStateStore.commitState((draft) => {
      draft.stockEvents.enabled = enabled
    })
    showToast(
      enabled
        ? 'Sincronización con Stock Events activada.'
        : 'Sincronización con Stock Events desactivada.',
    )
  }

  function updateMapping(
    symbol: string,
    patch: Partial<
      Pick<StockEventsSymbolMapping, 'sync' | 'watchlistId' | 'targetSymbol' | 'hidden'>
    >,
  ): void {
    const normalized = symbol.trim().toUpperCase()
    if (!normalized) return
    financialStateStore.commitState((draft) => {
      const mapping = draft.stockEvents.symbolMappings.find((item) => item.symbol === normalized)
      const targetSymbol =
        patch.targetSymbol !== undefined ? patch.targetSymbol.trim().toUpperCase() : undefined
      if (mapping) {
        if (patch.sync !== undefined) mapping.sync = patch.sync
        if (patch.watchlistId !== undefined) mapping.watchlistId = patch.watchlistId
        if (targetSymbol !== undefined) mapping.targetSymbol = targetSymbol
        if (patch.hidden !== undefined) mapping.hidden = patch.hidden
      } else {
        draft.stockEvents.symbolMappings.push({
          symbol: normalized,
          sync: patch.sync === true,
          watchlistId: patch.watchlistId || '',
          targetSymbol: targetSymbol || '',
          hidden: patch.hidden === true,
        })
      }
    })
  }

  async function loadWatchlists(): Promise<void> {
    const apiKey = settings.value.apiKey
    if (!apiKey || isLoadingWatchlists.value) return
    isLoadingWatchlists.value = true
    connectionError.value = ''
    try {
      watchlists.value = await fetchStockEventsWatchlists(apiKey)
    } catch (error) {
      watchlists.value = []
      connectionError.value =
        error instanceof Error ? error.message : 'No se pudo conectar con Stock Events'
    } finally {
      isLoadingWatchlists.value = false
    }
  }

  async function checkSymbols(): Promise<void> {
    const apiKey = settings.value.apiKey
    if (!apiKey || isChecking.value) return
    const rows = symbolRows.value.filter((row) => row.sync && row.watchlistId)
    const checks = rows.map((row) => ({
      symbol: row.targetSymbol || row.symbol,
      watchlistId: row.watchlistId,
    }))
    if (!checks.length) {
      showToast('No hay símbolos con sincronización y lista asignada.')
      return
    }
    isChecking.value = true
    connectionError.value = ''
    try {
      const results = await checkStockEventsSymbols(apiKey, checks)
      // Results keep the request order, so index them back to the local symbol
      // (the checked ticker may be a per-symbol override).
      checkResults.value = Object.fromEntries(
        results.map((result, index) => [rows[index]?.symbol || result.symbol, result]),
      )
      const failed = results.filter(
        (result) => result.status === 'not-detected' || result.status === 'error',
      )
      showToast(
        failed.length
          ? `Comprobación completada: ${failed.length} símbolo(s) con problemas.`
          : 'Todos los símbolos se detectaron correctamente.',
      )
    } catch (error) {
      connectionError.value =
        error instanceof Error ? error.message : 'No se pudieron comprobar los símbolos'
    } finally {
      isChecking.value = false
    }
  }

  /**
   * Fire-and-forget sync of a freshly created investment movement. Never
   * blocks the local save: failures only surface as a toast.
   */
  async function syncMovement(
    tx: Transaction,
    options: StockEventsSyncOptions = {},
  ): Promise<void> {
    const mapping = findSyncedMapping(settings.value, tx.symbol)
    if (!mapping) return
    const payload = buildStockEventsTransactionPayload(
      tx,
      mapping.watchlistId,
      mapping.targetSymbol,
      options.toCash,
    )
    if (!payload) return
    try {
      await createStockEventsTransaction(settings.value.apiKey, payload)
      showToast(`Movimiento de ${payload.symbol} sincronizado con Stock Events.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo sincronizar con Stock Events'
      showToast(`Stock Events: ${message}`)
    }
  }

  return {
    settings,
    isConnected,
    watchlists,
    isLoadingWatchlists,
    isChecking,
    connectionError,
    symbolRows,
    canSyncSymbol,
    saveApiKey,
    setEnabled,
    updateMapping,
    loadWatchlists,
    checkSymbols,
    syncMovement,
  }
})
