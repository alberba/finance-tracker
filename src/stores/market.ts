/**
 * WP7b leftover (documented, intentionally NOT wired to sync-v2 commands):
 * `instruments` here conflates a global instrument definition
 * (symbol/market/currency/provider — would map to `market_instruments`, an
 * explicitly out-of-scope *global* reference table per
 * `src/lib/server/sync/command-schemas.ts`'s doc comment) with the
 * per-user link (`user_instruments`: `instrumentId`/`categoryId`/`alias`
 * only) and per-user holdings tracking, all in one object. Reconciling
 * this needs a `market_instruments` materialization step this WP doesn't
 * own, so this store's mutations are left unsynced for now.
 */
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { buildPortfolioValuation, type PortfolioValuation } from '../domain/investment/valuation'
import { isUnlinkedMovementForInstrument } from '../domain/investment/symbol-matching'
import { fetchMarketQuotes } from '../services/market-api'
import type { InstrumentType } from '../scripts/types'
import { slug, todayISO, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

const CLOCK_INTERVAL_MS = 60_000

export interface NewInstrumentInput {
  investmentAssetId: string
  type: InstrumentType
  symbol: string
  market: string
  currency: string
  provider: string
}

export const useMarketStore = defineStore('market', () => {
  const financialStateStore = useFinancialStateStore()
  const instruments = computed(() => financialStateStore.state.instruments)
  const quotes = computed(() => financialStateStore.state.quotes)
  // Quotes age with time, not only with state changes: `tickClock` moves this
  // forward so a fresh quote turns stale without waiting for a new commit.
  const now = shallowRef(new Date())
  const valuation = computed<PortfolioValuation>(() =>
    buildPortfolioValuation(financialStateStore.state, { now: now.value }),
  )
  const isLoading = shallowRef(false)
  const errorMessage = shallowRef<string | null>(null)
  const lastRefreshAt = shallowRef<string | null>(null)
  let refreshPromise: Promise<boolean> | null = null

  function addInstrument(input: NewInstrumentInput): boolean {
    const symbol = input.symbol.trim().toUpperCase()
    const assetId = input.investmentAssetId.trim()
    if (!symbol || !assetId) return false
    if (
      instruments.value.some(
        (instrument) =>
          instrument.symbol === symbol && instrument.market === input.market.trim().toUpperCase(),
      )
    ) {
      return false
    }
    financialStateStore.commitState((draft) => {
      draft.instruments.push({
        id: slug(`${assetId}-${symbol}-${input.market}`) || uid('instrument'),
        investmentAssetId: assetId,
        type: input.type,
        symbol,
        market: input.market.trim().toUpperCase(),
        currency: input.currency.trim().toUpperCase().slice(0, 3) || draft.currency,
        provider: input.provider.trim().toLowerCase() || 'twelve-data',
        active: true,
      })
    })
    return true
  }

  function updateCurrentUnits(id: string, value: string | number): void {
    const currentUnits = normalizeUnits(value)
    financialStateStore.commitState((draft) => {
      const instrument = draft.instruments.find((item) => item.id === id)
      if (instrument) {
        instrument.holdingUnits = currentUnits
        instrument.holdingsAsOf = todayISO()
        instrument.holdingsUpdatedAt = new Date().toISOString()
        instrument.holdingsSource = 'manual'
      }
    })
  }

  function removeInstrument(id: string): void {
    financialStateStore.commitState((draft) => {
      draft.instruments = draft.instruments.filter((instrument) => instrument.id !== id)
      delete draft.quotes[id]
    })
  }

  function setInstrumentProvider(id: string, provider: string): void {
    const normalizedProvider = provider.trim().toLowerCase()
    if (!normalizedProvider) return
    financialStateStore.commitState((draft) => {
      const instrument = draft.instruments.find((item) => item.id === id)
      if (instrument) instrument.provider = normalizedProvider
    })
  }

  function updateInstrumentSymbol(id: string, symbol: string): boolean {
    const normalizedSymbol = symbol.trim().toUpperCase()
    if (!normalizedSymbol) return false
    let updated = false
    financialStateStore.commitState((draft) => {
      const instrument = draft.instruments.find((item) => item.id === id)
      if (instrument) {
        instrument.symbol = normalizedSymbol
        delete draft.quotes[id]
        updated = true
      }
    })
    return updated
  }

  function matchingMovementCount(instrumentId: string): number {
    const instrument = instruments.value.find((item) => item.id === instrumentId)
    if (!instrument) return 0
    const assetName = financialStateStore.investmentAssets.find(
      (asset) => asset.id === instrument.investmentAssetId,
    )?.name
    return financialStateStore.transactions.filter((transaction) =>
      isUnlinkedMovementForInstrument(transaction, instrument, assetName),
    ).length
  }

  function linkedMovementCount(instrumentId: string): number {
    return financialStateStore.transactions.filter(
      (transaction) =>
        transaction.type === 'investment' && transaction.instrumentId === instrumentId,
    ).length
  }

  function linkExistingMovements(instrumentId: string): number {
    const instrument = instruments.value.find((item) => item.id === instrumentId)
    if (!instrument) return 0
    const assetName = financialStateStore.investmentAssets.find(
      (asset) => asset.id === instrument.investmentAssetId,
    )?.name
    let linkedCount = 0
    financialStateStore.commitState((draft) => {
      const draftInstrument = draft.instruments.find((item) => item.id === instrumentId)
      draft.transactions.forEach((transaction) => {
        if (isUnlinkedMovementForInstrument(transaction, instrument, assetName)) {
          transaction.instrumentId = instrument.id
          linkedCount += 1
        }
      })
      if (linkedCount && draftInstrument) {
        // Vincular movimientos hace que sean la fuente inicial de la tenencia.
        // Esto también corrige instrumentos creados por versiones anteriores que
        // guardaban un snapshot provisional de cero al configurarlos.
        delete draftInstrument.holdingUnits
        delete draftInstrument.holdingsAsOf
        delete draftInstrument.holdingsUpdatedAt
        delete draftInstrument.holdingsSource
      }
    })
    return linkedCount
  }

  function tickClock(): void {
    now.value = new Date()
  }

  // One shared clock however many views keep quotes live: the first starts
  // it, the last to stop clears it.
  let clockUsers = 0
  let clock: ReturnType<typeof setInterval> | undefined

  function startClock(): () => void {
    clockUsers += 1
    if (clockUsers === 1) clock = setInterval(tickClock, CLOCK_INTERVAL_MS)
    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      clockUsers -= 1
      if (clockUsers === 0) clearInterval(clock)
    }
  }

  async function refreshQuotes(force = false): Promise<boolean> {
    if (refreshPromise) return refreshPromise
    if (!force && lastRefreshAt.value && Date.now() - Date.parse(lastRefreshAt.value) < 60_000)
      return true
    refreshPromise = executeRefresh()
    try {
      return await refreshPromise
    } finally {
      refreshPromise = null
    }
  }

  async function executeRefresh(): Promise<boolean> {
    if (!instruments.value.length) return true
    isLoading.value = true
    errorMessage.value = null
    try {
      const nextQuotes = await fetchMarketQuotes(instruments.value, quotes.value)
      if (Object.keys(nextQuotes).length) {
        financialStateStore.commitState((draft) => {
          draft.quotes = { ...draft.quotes, ...nextQuotes }
        })
      }
      lastRefreshAt.value = new Date().toISOString()
      tickClock()
      return true
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : 'No se pudieron cargar las cotizaciones'
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    instruments,
    quotes,
    valuation,
    isLoading,
    errorMessage,
    lastRefreshAt,
    addInstrument,
    removeInstrument,
    setInstrumentProvider,
    updateInstrumentSymbol,
    updateCurrentUnits,
    matchingMovementCount,
    linkedMovementCount,
    linkExistingMovements,
    refreshQuotes,
    tickClock,
    startClock,
  }
})

function normalizeUnits(value: string | number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100_000_000) / 100_000_000 : 0
}
