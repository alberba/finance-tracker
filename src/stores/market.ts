import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { buildPortfolioValuation, type PortfolioValuation } from '../domain/investment/valuation'
import { inferInstrumentType, quoteSourceKey } from '../domain/investment/symbol-matching'
import { fetchMarketQuotes } from '../services/market-api'
import { runClientHttp } from '../lib/client/runtime'
import type { Instrument, InstrumentType } from '../scripts/types'
import { newId } from '../lib/client/ids'
import { resolveEntityId, syncCreate, syncUpdate, syncRemove } from '../lib/client/command-mapping'
import { isReadOnlyDemoActive } from '../lib/client/demo-source'
import {
  linkInstrumentMovements,
  type InstrumentLinkAcceptance,
} from '../lib/client/instrument-link'
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

  /**
   * Points the instrument at another provider ticker (`VWCE.DE`, an ISIN…);
   * its visible symbol, which movements match, stays. False when nothing changed.
   */
  function setQuoteTicker(id: string, ticker: string): boolean {
    const quoteSymbol = ticker.trim().toUpperCase()
    const current = instruments.value.find((instrument) => instrument.id === id)
    if (!quoteSymbol || !current || (current.quoteSymbol || current.symbol) === quoteSymbol) {
      return false
    }
    financialStateStore.commitState((draft) => {
      const instrument = draft.instruments.find((item) => item.id === id)
      if (!instrument) return
      instrument.quoteSymbol = quoteSymbol
      instrument.type = inferInstrumentType(quoteSymbol)
      instrument.provider = 'yahoo'
      delete draft.quotes[id]
    })
    const updated = instruments.value.find((instrument) => instrument.id === id)
    if (updated) persistConfiguration(updated)
    return true
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
    }
  }

  /**
   * Links this instrument's unlinked movements as one durable intent (#487):
   * accepted once it is stored on this device; its progress and any failure
   * show in the sync status.
   */
  function linkExistingMovements(instrumentId: string): Promise<InstrumentLinkAcceptance> {
    return linkInstrumentMovements({
      instrumentId,
      onError: (message) => {
        errorMessage.value = message
      },
    })
  }

  return {
    instruments,
    quotes,
    valuation,
    errorMessage,
    lastRefreshAt,
    addInstrument,
    removeInstrument,
    setQuoteTicker,
    linkExistingMovements,
    refreshQuotes,
    tickClock,
    startClock,
  }
})
