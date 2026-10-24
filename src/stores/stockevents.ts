import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { useToast } from '../composables/useToast'
import {
  buildStockEventsCashTransactionPayload,
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
import type {
  StockEventsCashMapping,
  StockEventsSymbolMapping,
  Transaction,
} from '../scripts/types'
import {
  resolveEntityId,
  syncSettingsUpdate,
  syncStockeventsCashEntryUpsert,
  syncStockeventsMappingUpsert,
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

  /** The loaded watchlists as select options. */
  const watchlistOptions = computed(() =>
    watchlists.value.map((list) => ({ value: list.id, label: list.name })),
  )

  /** Name of a loaded watchlist; empty when it is not loaded (or none). */
  function watchlistName(id: string): string {
    return watchlists.value.find((list) => list.id === id)?.name ?? ''
  }
  const isConnected = computed(() => settings.value.enabled && credentialConfigured.value)

  function canSyncSymbol(symbol: string): boolean {
    return isConnected.value && Boolean(findSyncedMapping(settings.value, symbol))
  }

  const cashMappingRows = computed<StockEventsCashMappingRow[]>(() => {
    const mappingsByAccount = new Map(
      (settings.value.cashMappings || []).map((mapping) => [
        mapping.accountId,
        mapping.watchlistId,
      ]),
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
    const mapping = financialStateStore.state.stockEvents.symbolMappings.find(
      (item) => item.symbol === normalized,
    )
    if (mapping) {
      void syncStockeventsMappingUpsert(normalized, {
        stockeventsSymbol: mapping.targetSymbol || normalized,
        sync: mapping.sync === true,
        watchlistId: mapping.watchlistId || null,
        hidden: mapping.hidden === true,
      })
    }
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
    void syncCashMappings()
  }

  /**
   * Sends the whole cash-mapping selection, resolved to server `account`
   * ids — the same whole-selection shape `syncTwrLiquidityAccounts` uses.
   * An account that hasn't synced yet is left out with a warning; the next
   * change sends it once it has.
   */
  async function syncCashMappings(): Promise<void> {
    const entries: Array<{ accountId: string | null; watchlistId: string }> = []
    for (const mapping of financialStateStore.state.stockEvents.cashMappings || []) {
      const serverAccountId = await resolveEntityId('account', mapping.accountId)
      if (serverAccountId) {
        entries.push({ accountId: serverAccountId, watchlistId: mapping.watchlistId })
      } else if (typeof console !== 'undefined') {
        console.warn(
          `[sync-v2] No se pudo sincronizar el efectivo de Stock Events (cuenta local "${mapping.accountId}"): todavía no se ha sincronizado con el servidor.`,
        )
      }
    }
    await syncSettingsUpdate({ stockeventsCashMappings: entries })
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

  async function syncContributionCash(
    date: string,
    allocations: Array<{ accountId: string; amount: number }>,
  ): Promise<void> {
    if (!canSyncContributionCash.value) return
    const mappingsByAccount = new Map(
      (settings.value.cashMappings || []).map((mapping) => [
        mapping.accountId,
        mapping.watchlistId,
      ]),
    )
    const accountNames = new Map(
      financialStateStore.accounts.map((account) => [account.id, account.name]),
    )
    const requests = allocations.flatMap((allocation) => {
      const watchlistId = mappingsByAccount.get(allocation.accountId)
      if (!watchlistId || allocation.amount < 0) return []
      const syncedAmount =
        (settings.value.cashSyncEntries || []).find(
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
      requests.map((request) => runClientHttp(createStockEventsTransaction(request.payload))),
    )
    const fulfilled = results.flatMap((result, index) => {
      if (result.status !== 'fulfilled') return []
      const request = requests[index]
      return request ? [request] : []
    })
    if (fulfilled.length) {
      financialStateStore.commitState((draft) => {
        const entries = draft.stockEvents.cashSyncEntries || []
        draft.stockEvents.cashSyncEntries = entries
        for (const request of fulfilled) {
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
        }
      })
      void syncCashSyncEntries(
        date,
        fulfilled.map((request) => ({
          accountId: request.allocation.accountId,
          watchlistId: request.watchlistId,
          syncedAmount: Math.round(request.allocation.amount * 100) / 100,
        })),
      )
    }
    const failedCount = results.filter((result) => result.status === 'rejected').length
    if (failedCount > 0) {
      showToast(`Stock Events: ${failedCount} aporte(s) de efectivo no se pudieron sincronizar.`)
      return
    }
    showToast(`Efectivo actualizado en ${requests.length} lista(s) de Stock Events.`)
  }

  /**
   * Persists the already-synced contribution-cash amounts so a reload
   * computes deltas instead of re-sending the full allocation. Entries for
   * accounts that haven't synced yet stay memory-only until the next run.
   */
  async function syncCashSyncEntries(
    contributionDate: string,
    entries: Array<{ accountId: string; watchlistId: string; syncedAmount: number }>,
  ): Promise<void> {
    for (const entry of entries) {
      const serverAccountId = await resolveEntityId('account', entry.accountId)
      if (!serverAccountId) continue
      await syncStockeventsCashEntryUpsert(
        contributionDate,
        serverAccountId,
        entry.watchlistId,
        entry.syncedAmount,
        financialStateStore.currency,
      )
    }
  }

  return {
    settings,
    credentialConfigured,
    isSavingCredential,
    isConnected,
    cashMappingRows,
    canSyncContributionCash,
    watchlists,
    watchlistOptions,
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
    updateMapping,
    updateCashMapping,
    loadWatchlists,
    checkSymbols,
    syncMovement,
    syncContributionCash,
  }
})
