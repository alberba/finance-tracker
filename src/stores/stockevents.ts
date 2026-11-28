import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { useToast } from '../composables/useToast'
import {
  buildStockEventsTransactionPayload,
  findSyncedMapping,
  resolveStockEventsSymbol,
} from '../domain/stockevents/transaction-payload'
import { runClientHttp } from '../lib/client/runtime'
import {
  checkStockEventsSymbols,
  createStockEventsTransaction,
  fetchStockEventsCredentialStatus,
  fetchStockEventsWatchlists,
  saveStockEventsCredential,
  type StockEventsWatchlist,
  type SymbolCheckResult,
} from '../services/stockevents-api'
import type { Transaction } from '../scripts/types'
import {
  syncSettingsUpdate,
} from '../lib/client/command-mapping'
import { useFinancialStateStore } from './financial-state'

export interface StockEventsSymbolRow {
  symbol: string
  sync: boolean
  watchlistId: string
  targetSymbol: string
  hidden: boolean
  hasInstrument: boolean
  isCrypto: boolean
  checkResult: SymbolCheckResult | null
}

export interface StockEventsSyncOptions {
  /** Overrides `settings.tradesToCash` for this one movement. */
  toCash?: boolean
}

/**
 * Outcome of a single movement sync attempt: `skipped` means nothing was
 * sent (no mapping, or the movement has no valid payload) and `failed` means
 * Stock Events rejected the request.
 */
export type StockEventsSyncResult = 'synced' | 'skipped' | 'failed'

export const useStockEventsStore = defineStore('stockEvents', () => {
  const financialStateStore = useFinancialStateStore()
  const { showToast } = useToast()

  const watchlists = shallowRef<StockEventsWatchlist[]>([])
  const isLoadingWatchlists = shallowRef(false)
  const isChecking = shallowRef(false)
  const credentialConfigured = shallowRef(false)
  const isSavingCredential = shallowRef(false)
  const connectionError = shallowRef('')
  const checkResults = shallowRef<Record<string, SymbolCheckResult>>({})
  let credentialInitialization: Promise<void> | null = null
  let credentialStatusLoaded = false

  const settings = computed(() => financialStateStore.state.stockEvents)

  /** Name of a loaded watchlist; empty when it is not loaded (or none). */
  function watchlistName(id: string): string {
    return watchlists.value.find((list) => list.id === id)?.name ?? ''
  }
  const isConnected = computed(() => settings.value.enabled && credentialConfigured.value)

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
    const cryptoSymbols = new Set([
      ...financialStateStore.state.instruments
        .filter((instrument) => instrument.type === 'crypto')
        .map((instrument) => instrument.symbol.toUpperCase()),
      ...financialStateStore.state.transactions
        .filter((tx) => tx.type === 'investment' && tx.category.trim().toLowerCase() === 'crypto')
        .map((tx) => (tx.symbol || '').toUpperCase()),
    ])
    return trackedSymbols.value.map((symbol) => {
      const mapping = mappingsBySymbol.get(symbol)
      return {
        symbol,
        sync: mapping?.sync === true,
        watchlistId: mapping?.watchlistId || '',
        targetSymbol: mapping?.targetSymbol || '',
        hidden: mapping?.hidden === true,
        hasInstrument: instrumentSymbols.has(symbol),
        isCrypto: cryptoSymbols.has(symbol),
        checkResult: checkResults.value[symbol] || null,
      }
    })
  })

  async function initializeCredential(): Promise<void> {
    if (credentialStatusLoaded) return
    if (credentialInitialization) return credentialInitialization

    credentialInitialization = (async () => {
      connectionError.value = ''
      try {
        credentialConfigured.value = await runClientHttp(fetchStockEventsCredentialStatus())
        credentialStatusLoaded = true
        if (settings.value.apiKey) {
          financialStateStore.patchState((draft) => {
            draft.stockEvents.apiKey = ''
          })
        }
      } catch (error) {
        connectionError.value =
          error instanceof Error ? error.message : 'No se pudo consultar Stock Events'
      } finally {
        credentialInitialization = null
      }
    })()

    return credentialInitialization
  }

  async function saveApiKey(value: string): Promise<void> {
    if (isSavingCredential.value) return
    isSavingCredential.value = true
    connectionError.value = ''
    try {
      credentialConfigured.value = await runClientHttp(saveStockEventsCredential(value))
      credentialStatusLoaded = true
      financialStateStore.patchState((draft) => {
        draft.stockEvents.apiKey = ''
      })
      showToast(
        credentialConfigured.value
          ? 'API key de Stock Events guardada de forma segura.'
          : 'API key de Stock Events eliminada.',
      )
    } catch (error) {
      connectionError.value =
        error instanceof Error ? error.message : 'No se pudo guardar la API key de Stock Events'
    } finally {
      isSavingCredential.value = false
    }
  }

  function setEnabled(enabled: boolean): void {
    financialStateStore.commitState((draft) => {
      draft.stockEvents.enabled = enabled
    })
    void syncSettingsUpdate({ stockeventsEnabled: enabled })
    showToast(
      enabled
        ? 'Sincronización con Stock Events activada.'
        : 'Sincronización con Stock Events desactivada.',
    )
  }

  function setTradesToCash(tradesToCash: boolean): void {
    financialStateStore.commitState((draft) => {
      draft.stockEvents.tradesToCash = tradesToCash
    })
    void syncSettingsUpdate({ stockeventsTradesToCash: tradesToCash })
  }

  async function loadWatchlists(): Promise<void> {
    if (!credentialConfigured.value || isLoadingWatchlists.value) return
    isLoadingWatchlists.value = true
    connectionError.value = ''
    try {
      watchlists.value = await runClientHttp(fetchStockEventsWatchlists())
    } catch (error) {
      watchlists.value = []
      connectionError.value =
        error instanceof Error ? error.message : 'No se pudo conectar con Stock Events'
    } finally {
      isLoadingWatchlists.value = false
    }
  }

  async function checkSymbols(): Promise<void> {
    if (!credentialConfigured.value || isChecking.value) return
    const rows = symbolRows.value.filter((row) => row.sync && row.watchlistId)
    const checks = rows.map((row) => ({
      symbol: resolveStockEventsSymbol(row.symbol, row.targetSymbol, row.isCrypto),
      watchlistId: row.watchlistId,
    }))
    if (!checks.length) {
      showToast('No hay símbolos con sincronización y lista asignada.')
      return
    }
    isChecking.value = true
    connectionError.value = ''
    try {
      const results = await runClientHttp(checkStockEventsSymbols(checks))
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
   * blocks the local save: the result is returned to the caller (so a manual
   * resend can react to it) and failures only surface as a toast.
   *
   * A movement that resolves no synced mapping used to return silently, which
   * is how a buy could be saved locally and never reach Stock Events without
   * anyone noticing. When there is a live connection it now warns instead.
   */
  async function syncMovement(
    tx: Transaction,
    options: StockEventsSyncOptions = {},
  ): Promise<StockEventsSyncResult> {
    const symbol = (tx.symbol || '').trim().toUpperCase()
    const symbolLabel = symbol || 'ese símbolo'
    const mapping = findSyncedMapping(settings.value, tx.symbol)
    if (!mapping) {
      if (isConnected.value) {
        showToast(`Stock Events: ${symbolLabel} no tiene sincronización activada o lista asignada.`)
        console.warn(
          `[stockevents] Movimiento de ${symbolLabel} no sincronizado: no tiene sincronización activada o lista asignada.`,
        )
      }
      return 'skipped'
    }
    const payload = buildStockEventsTransactionPayload(
      tx,
      mapping.watchlistId,
      mapping.targetSymbol,
      options.toCash ?? settings.value.tradesToCash === true,
      symbolRows.value.some((row) => row.symbol === symbol && row.isCrypto),
    )
    if (!payload) {
      if (isConnected.value) {
        showToast(
          `Stock Events: el movimiento de ${symbolLabel} no tiene datos válidos para sincronizar.`,
        )
        console.warn(
          `[stockevents] Movimiento de ${symbolLabel} no sincronizado: no tiene datos válidos (títulos o precio).`,
        )
      }
      return 'skipped'
    }
    try {
      await runClientHttp(createStockEventsTransaction(payload))
      showToast(`Movimiento de ${payload.symbol} sincronizado con Stock Events.`)
      return 'synced'
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo sincronizar con Stock Events'
      showToast(`Stock Events: ${message}`)
      return 'failed'
    }
  }

  return {
    settings,
    credentialConfigured,
    isSavingCredential,
    isConnected,
    watchlists,
    watchlistName,
    isLoadingWatchlists,
    isChecking,
    connectionError,
    symbolRows,
    canSyncSymbol,
    initializeCredential,
    saveApiKey,
    setEnabled,
    setTradesToCash,
    loadWatchlists,
    checkSymbols,
    syncMovement,
  }
})
