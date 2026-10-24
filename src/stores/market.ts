import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { buildPortfolioValuation, type PortfolioValuation } from '../domain/investment/valuation'
import {
  isUnlinkedMovementForInstrument,
  quoteSourceKey,
} from '../domain/investment/symbol-matching'
import { fetchMarketQuotes } from '../services/market-api'
import { runClientHttp } from '../lib/client/runtime'
import type { Instrument, InstrumentType } from '../scripts/types'
import { todayISO } from '../scripts/utils'
import { newId } from '../lib/client/ids'
import { resolveEntityId, syncCreate, syncUpdate, syncRemove } from '../lib/client/command-mapping'
import { isReadOnlyDemoActive } from '../lib/client/demo-source'
import { useFinancialStateStore } from './financial-state'
import { useSyncStore } from './sync'

const CLOCK_INTERVAL_MS = 60_000

export interface NewInstrumentInput {
  investmentAssetId: string
  type: InstrumentType
  symbol: string
  quoteSymbol?: string
  market: string
  currency: string
  provider: string
}

export const useMarketStore = defineStore('market', () => {
  const financialStateStore = useFinancialStateStore()
  const syncStore = useSyncStore()
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
  let refreshAgainRequested = false
  let configurationWrites = Promise.resolve()

  function persistConfiguration(instrument: Instrument, create = false): void {
    const ownerId = syncStore.userId
    if (isReadOnlyDemoActive() || !ownerId) return
    const snapshot = structuredClone(instrument)
    configurationWrites = configurationWrites
      .then(async () => {
        if (syncStore.userId !== ownerId) return
        const alias = await resolveEntityId('account', snapshot.investmentAssetId)
        if (!alias) throw new Error('No se pudo guardar la agrupación del símbolo.')
        const { id } = snapshot
        const quoteConfig: Partial<Instrument> = { ...snapshot }
        delete quoteConfig.id
        delete quoteConfig.investmentAssetId
        const trackingId = (await syncStore.getUserInstrumentId(id)) ?? id
        if (syncStore.userId !== ownerId) return
        const saved = create
          ? await syncCreate('userInstrument', id, { instrumentId: id, alias, quoteConfig })
          : await syncUpdate('userInstrument', trackingId, { alias, quoteConfig })
        if (saved === false) throw new Error('No se pudo guardar la cotización.')
      })
      .catch((error) => {
        errorMessage.value =
          error instanceof Error ? error.message : 'No se pudo guardar la cotización.'
      })
  }

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
    const id = newId()
    financialStateStore.commitState((draft) => {
      draft.instruments.push({
        id,
        investmentAssetId: assetId,
        type: input.type,
        symbol,
        ...(input.quoteSymbol?.trim()
          ? { quoteSymbol: input.quoteSymbol.trim().toUpperCase() }
          : {}),
        market: input.market.trim().toUpperCase(),
        currency: input.currency.trim().toUpperCase().slice(0, 3) || draft.currency,
        provider: input.provider.trim().toLowerCase() || 'yahoo',
        active: true,
      })
    })
    const added = instruments.value.find((instrument) => instrument.id === id)
    if (added) persistConfiguration(added, true)
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
    const updated = instruments.value.find((instrument) => instrument.id === id)
    if (updated) persistConfiguration(updated)
  }

  function removeInstrument(id: string): void {
    const ownerId = syncStore.userId
    financialStateStore.commitState((draft) => {
      draft.instruments = draft.instruments.filter((instrument) => instrument.id !== id)
      delete draft.quotes[id]
    })
    configurationWrites = configurationWrites
      .then(async () => {
        if (!ownerId || syncStore.userId !== ownerId) return
        const trackingId = await syncStore.getUserInstrumentId(id)
        if (syncStore.userId !== ownerId) return
        await syncRemove('userInstrument', trackingId ?? id)
      })
      .catch((error) => {
        errorMessage.value = String(error)
      })
  }

  function setInstrumentProvider(id: string, provider: string): void {
    const normalizedProvider = provider.trim().toLowerCase()
    if (!normalizedProvider) return
    financialStateStore.commitState((draft) => {
      const instrument = draft.instruments.find((item) => item.id === id)
      if (instrument) instrument.provider = normalizedProvider
    })
    const updated = instruments.value.find((instrument) => instrument.id === id)
    if (updated) persistConfiguration(updated)
  }

  function updateInstrumentSymbol(id: string, symbol: string): boolean {
    const instrument = instruments.value.find((item) => item.id === id)
    return configureInstrumentSymbols(id, symbol, instrument?.quoteSymbol || '')
  }

  function configureInstrumentSymbols(id: string, symbol: string, quoteSymbol: string): boolean {
    const normalizedSymbol = symbol.trim().toUpperCase()
    const normalizedQuoteSymbol = quoteSymbol.trim().toUpperCase()
    if (!normalizedSymbol) return false
    let updated = false
    financialStateStore.commitState((draft) => {
      const instrument = draft.instruments.find((item) => item.id === id)
      if (instrument) {
        if (
          quoteSourceKey(instrument) !==
          quoteSourceKey({
            ...instrument,
            symbol: normalizedSymbol,
            quoteSymbol: normalizedQuoteSymbol || undefined,
          })
        )
          delete draft.quotes[id]
        instrument.symbol = normalizedSymbol
        if (normalizedQuoteSymbol) instrument.quoteSymbol = normalizedQuoteSymbol
        else delete instrument.quoteSymbol
        updated = true
      }
    })
    const instrument = instruments.value.find((item) => item.id === id)
    if (updated && instrument) persistConfiguration(instrument)
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
    const updated = instruments.value.find((item) => item.id === instrumentId)
    if (linkedCount && updated) persistConfiguration(updated)
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
    if (refreshPromise) {
      if (force) refreshAgainRequested = true
      return refreshPromise
    }
    if (!force && lastRefreshAt.value && Date.now() - Date.parse(lastRefreshAt.value) < 60_000)
      return true
    refreshPromise = (async () => {
      let result: boolean
      do {
        refreshAgainRequested = false
        result = await executeRefresh()
      } while (refreshAgainRequested)
      return result
    })()
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
      const requested = instruments.value
      const sources = new Map(
        requested.map((instrument) => [instrument.id, quoteSourceKey(instrument)]),
      )
      const response = await runClientHttp(fetchMarketQuotes(requested, quotes.value))
      const current = new Map(
        instruments.value.map((instrument) => [instrument.id, quoteSourceKey(instrument)]),
      )
      const nextQuotes = Object.fromEntries(
        Object.entries(response).filter(
          ([id]) => current.has(id) && current.get(id) === sources.get(id),
        ),
      )
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
    configureInstrumentSymbols,
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
