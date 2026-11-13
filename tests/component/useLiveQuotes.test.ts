import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLiveQuotes } from '../../src/composables/useLiveQuotes'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useMarketStore } from '../../src/stores/market'
import type { Quote } from '../../src/scripts/types'

let pinia: Pinia

function quote(price: number, currency = 'EUR'): Quote {
  return {
    instrumentId: 'vwce',
    price,
    currency,
    timestamp: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    dataType: 'unknown',
    source: 'yahoo',
    status: 'fresh',
    isStale: false,
    previousClose: null,
    changePercent: null,
  }
}

/** Proveedor de mercado detrás de `/api/market/quotes`: lo único que se simula es el HTTP. */
let quoteRequests: Array<{ instruments: Array<{ id: string; quoteSymbol?: string }> }>
let respond: (call: number) => Promise<Record<string, Quote>>

function fetchedQuotes(): number {
  return quoteRequests.length
}

const QuoteView = defineComponent({
  setup() {
    useLiveQuotes()
    return () => null
  },
})

describe('actualización automática de cotizaciones', () => {
  const views: VueWrapper[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    pinia = createPinia()
    setActivePinia(pinia)
    quoteRequests = []
    respond = async () => ({})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== '/api/market/quotes') throw new Error(`unexpected fetch ${url}`)
        quoteRequests.push(JSON.parse(String(init?.body)))
        const quotes = await respond(quoteRequests.length)
        return new Response(JSON.stringify({ quotes }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    useFinancialStateStore().commitState((state) => {
      state.instruments = [
        {
          id: 'vwce',
          investmentAssetId: 'etf',
          type: 'etf',
          symbol: 'VWCE.DE',
          market: '',
          currency: 'EUR',
          provider: 'yahoo',
          active: true,
        },
      ]
    })
  })

  afterEach(() => {
    views.splice(0).forEach((view) => view.unmount())
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('refresca cada cinco minutos y deduplica las vistas montadas', async () => {
    respond = async (call) => ({ vwce: quote(100 + call) })
    views.push(
      mount(QuoteView, { global: { plugins: [pinia] } }),
      mount(QuoteView, { global: { plugins: [pinia] } }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(useMarketStore().quotes.vwce?.price).toBe(101)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(useMarketStore().quotes.vwce?.price).toBe(102)

    views.splice(0).forEach((view) => view.unmount())
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(useMarketStore().quotes.vwce?.price).toBe(102)
    expect(fetchedQuotes()).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pausa en segundo plano y actualiza al volver a la pestaña', async () => {
    respond = async (call) => ({ vwce: quote(100 + call) })
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(useMarketStore().quotes.vwce?.price).toBe(101)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(useMarketStore().quotes.vwce?.price).toBe(102)
  })

  it('no consulta el proveedor cuando no hay conexión', async () => {
    respond = async () => ({ vwce: quote(100) })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(useMarketStore().quotes.vwce).toBeUndefined()
    expect(fetchedQuotes()).toBe(0)
  })

  it('conserva el símbolo visible y descarta la respuesta del ticker anterior al cambiar la consulta', async () => {
    let finishOld!: (value: Record<string, Quote>) => void
    respond = (call) =>
      call === 1
        ? new Promise((resolve) => {
            finishOld = resolve
          })
        : Promise.resolve({ vwce: quote(125) })
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    const state = useFinancialStateStore()
    state.commitState((draft) => {
      draft.instruments[0].quoteSymbol = 'VWCE.MI'
    })
    await vi.advanceTimersByTimeAsync(0)
    finishOld({ vwce: quote(99, 'USD') })
    await vi.advanceTimersByTimeAsync(0)
    expect(state.instruments[0].symbol).toBe('VWCE.DE')
    expect(useMarketStore().quotes.vwce).toMatchObject({ price: 125, currency: 'EUR' })
  })

  it('conserva el precio al guardar explícitamente el mismo par de Bitcoin que ya se consultaba', async () => {
    const state = useFinancialStateStore()
    state.commitState((draft) => {
      draft.instruments[0].type = 'crypto'
      draft.instruments[0].symbol = 'BTC'
    })
    respond = async () => ({ vwce: quote(73_000) })
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    await vi.advanceTimersByTimeAsync(0)
    useMarketStore().configureInstrumentSymbols('vwce', 'BTC', 'BTC-EUR')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchedQuotes()).toBe(1)
    expect(state.quotes.vwce?.price).toBe(73_000)
  })
})
