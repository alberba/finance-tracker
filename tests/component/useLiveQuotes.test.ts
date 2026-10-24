import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { Effect } from 'effect'

import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLiveQuotes } from '../../src/composables/useLiveQuotes'
import { fetchMarketQuotes } from '../../src/services/market-api'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useMarketStore } from '../../src/stores/market'
import type { Quote } from '../../src/scripts/types'

vi.mock('../../src/services/market-api', () => ({ fetchMarketQuotes: vi.fn() }))

let pinia: Pinia

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
    vi.mocked(fetchMarketQuotes).mockReturnValue(Effect.succeed({}))
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
  })

  it('refresca cada cinco minutos y deduplica las vistas montadas', async () => {
    views.push(
      mount(QuoteView, { global: { plugins: [pinia] } }),
      mount(QuoteView, { global: { plugins: [pinia] } }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(2)

    views.splice(0).forEach((view) => view.unmount())
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pausa en segundo plano y actualiza al volver a la pestaña', async () => {
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(1)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(2)
  })

  it('no consulta el proveedor cuando no hay conexión', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchMarketQuotes).not.toHaveBeenCalled()
  })

  it('conserva el símbolo visible y descarta la respuesta del ticker anterior al cambiar la consulta', async () => {
    let finishOld!: (value: Record<string, Quote>) => void
    vi.mocked(fetchMarketQuotes)
      .mockReturnValueOnce(
        Effect.promise(
          () =>
            new Promise((resolve) => {
              finishOld = resolve
            }),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          vwce: {
            instrumentId: 'vwce',
            price: 125,
            currency: 'EUR',
            timestamp: new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
            dataType: 'unknown',
            source: 'yahoo',
            status: 'fresh',
            isStale: false,
            previousClose: null,
            changePercent: null,
          },
        }),
      )
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    const state = useFinancialStateStore()
    state.commitState((draft) => {
      draft.instruments[0].quoteSymbol = 'VWCE.MI'
    })
    await vi.advanceTimersByTimeAsync(0)
    finishOld({
      vwce: {
        instrumentId: 'vwce',
        price: 99,
        currency: 'USD',
        timestamp: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        dataType: 'unknown',
        source: 'yahoo',
        status: 'fresh',
        isStale: false,
        previousClose: null,
        changePercent: null,
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(2)
    expect(state.instruments[0].symbol).toBe('VWCE.DE')
    expect(useMarketStore().quotes.vwce).toMatchObject({ price: 125, currency: 'EUR' })
  })

  it('conserva el precio al guardar explícitamente el mismo par de Bitcoin que ya se consultaba', async () => {
    const state = useFinancialStateStore()
    state.commitState((draft) => {
      draft.instruments[0].type = 'crypto'
      draft.instruments[0].symbol = 'BTC'
    })
    vi.mocked(fetchMarketQuotes).mockReturnValue(
      Effect.succeed({
        vwce: {
          instrumentId: 'vwce',
          price: 73_000,
          currency: 'EUR',
          timestamp: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          dataType: 'unknown',
          source: 'yahoo',
          status: 'fresh',
          isStale: false,
          previousClose: null,
          changePercent: null,
        },
      }),
    )
    views.push(mount(QuoteView, { global: { plugins: [pinia] } }))
    await vi.advanceTimersByTimeAsync(0)
    useMarketStore().configureInstrumentSymbols('vwce', 'BTC', 'BTC-EUR')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(1)
    expect(state.quotes.vwce?.price).toBe(73_000)
  })
})
