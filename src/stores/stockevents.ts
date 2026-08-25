import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { useToast } from '../composables/useToast'
import {
  buildStockEventsCashTransactionPayload,
  buildStockEventsTransactionPayload,
  findSyncedMapping,
} from '../domain/stockevents/transaction-payload'
import {
  checkStockEventsSymbols,
  createStockEventsTransaction,
  fetchStockEventsCredentialStatus,
  fetchStockEventsWatchlists,
  saveStockEventsCredential,
  type StockEventsWatchlist,
  type SymbolCheckResult,
} from '../services/stockevents-api'
import type { StockEventsCashMapping, StockEventsSymbolMapping, Transaction } from '../scripts/types'
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

export interface StockEventsCashMappingRow {
  accountId: string
  accountName: string
  watchlistId: string
}

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
  const isConnected = computed(() => settings.value.enabled && credentialConfigured.value)

  function canSyncSymbol(symbol: string): boolean {
    return isConnected.value && Boolean(findSyncedMapping(settings.value, symbol))
  }

  const cashMappingRows = computed<StockEventsCashMappingRow[]>(() => {
    const mappingsByAccount = new Map(
      (settings.value.cashMappings || []).map((mapping) => [mapping.accountId, mapping.watchlistId]),
    )
    const liquidityAccountIds = new Set(financialStateStore.state.twrLiquidityAccountIds)
    return financialStateStore.accounts
      .filter((account) => liquidityAccountIds.has(account.id))
      .map((account) => ({
        accountId: account.id,
        accountName: account.name,
        watchlistId: mappingsByAccount.get(account.id) || '',
      }))
  })

  const canSyncContributionCash = computed(
    () =>
      settings.value.enabled &&
      credentialConfigured.value &&
      (settings.value.cashMappings || []).some((mapping) => Boolean(mapping.watchlistId)),
  )

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

  async function initializeCredential(): Promise<void> {
    if (credentialStatusLoaded) return
    if (credentialInitialization) return credentialInitialization

    credentialInitialization = (async () => {
      connectionError.value = ''
      try {
        credentialConfigured.value = await fetchStockEventsCredentialStatus()
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
      credentialConfigured.value = await saveStockEventsCredential(value)
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

  function updateCashMapping(accountId: string, watchlistId: string): void {
    const normalizedAccountId = accountId.trim()
    const normalizedWatchlistId = watchlistId.trim()
    if (!normalizedAccountId) return
    financialStateStore.commitState((draft) => {
      const mappings = draft.stockEvents.cashMappings || []
      draft.stockEvents.cashMappings = mappings.filter(
        (mapping) => mapping.accountId !== normalizedAccountId,
      )
      if (normalizedWatchlistId) {
        const mapping: StockEventsCashMapping = {
          accountId: normalizedAccountId,
          watchlistId: normalizedWatchlistId,
        }
        draft.stockEvents.cashMappings.push(mapping)
      }
    })
  }

  async function loadWatchlists(): Promise<void> {
    if (!credentialConfigured.value || isLoadingWatchlists.value) return
    isLoadingWatchlists.value = true
    connectionError.value = ''
    try {
      watchlists.value = await fetchStockEventsWatchlists()
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
      const results = await checkStockEventsSymbols(checks)
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
      await createStockEventsTransaction(payload)
      showToast(`Movimiento de ${payload.symbol} sincronizado con Stock Events.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo sincronizar con Stock Events'
      showToast(`Stock Events: ${message}`)
    }
  }

  async function syncContributionCash(
    date: string,
    allocations: Array<{ accountId: string; amount: number }>,
  ): Promise<void> {
    if (!canSyncContributionCash.value) return
    const mappingsByAccount = new Map(
      (settings.value.cashMappings || []).map((mapping) => [mapping.accountId, mapping.watchlistId]),
    )
    const accountNames = new Map(
      financialStateStore.accounts.map((account) => [account.id, account.name]),
    )
    const requests = allocations.flatMap((allocation) => {
      const watchlistId = mappingsByAccount.get(allocation.accountId)
      if (!watchlistId || allocation.amount < 0) return []
      const syncedAmount = (settings.value.cashSyncEntries || []).find(
        (entry) =>
          entry.contributionDate === date &&
          entry.accountId === allocation.accountId &&
          entry.watchlistId === watchlistId,
      )?.syncedAmount ?? 0
      const delta = Math.round((allocation.amount - syncedAmount) * 100) / 100
      if (delta === 0) return []
      const payload = buildStockEventsCashTransactionPayload({
        watchlistId,
        date,
        amount: delta,
        currency: financialStateStore.currency,
        accountName: accountNames.get(allocation.accountId),
      })
      return payload ? [{ allocation, watchlistId, delta, payload }] : []
    })
    if (!requests.length) return

    const results = await Promise.allSettled(
      requests.map((request) => createStockEventsTransaction(request.payload)),
    )
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return
      const request = requests[index]
      if (!request) return
      financialStateStore.commitState((draft) => {
        const entries = draft.stockEvents.cashSyncEntries || []
        draft.stockEvents.cashSyncEntries = entries
        const existing = entries.find(
          (entry) =>
            entry.contributionDate === date &&
            entry.accountId === request.allocation.accountId &&
            entry.watchlistId === request.watchlistId,
        )
        const syncedAmount = Math.round(request.allocation.amount * 100) / 100
        if (existing) {
          existing.syncedAmount = syncedAmount
        } else {
          entries.push({
            contributionDate: date,
            accountId: request.allocation.accountId,
            watchlistId: request.watchlistId,
            syncedAmount,
          })
        }
      })
    })
    const failedCount = results.filter((result) => result.status === 'rejected').length
    if (failedCount > 0) {
      showToast(`Stock Events: ${failedCount} aporte(s) de efectivo no se pudieron sincronizar.`)
      return
    }
    showToast(`Efectivo actualizado en ${requests.length} lista(s) de Stock Events.`)
  }

  return {
    settings,
    credentialConfigured,
    isSavingCredential,
    isConnected,
    cashMappingRows,
    canSyncContributionCash,
    watchlists,
    isLoadingWatchlists,
    isChecking,
    connectionError,
    symbolRows,
    canSyncSymbol,
    initializeCredential,
    saveApiKey,
    setEnabled,
    updateMapping,
    updateCashMapping,
    loadWatchlists,
    checkSymbols,
    syncMovement,
    syncContributionCash,
  }
})
