import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLiveQuotes } from '../../src/composables/useLiveQuotes'
import { fetchMarketQuotes } from '../../src/services/market-api'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useMarketStore } from '../../src/stores/market'

vi.mock('../../src/services/market-api', () => ({ fetchMarketQuotes: vi.fn() }))

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
    setActivePinia(createPinia())
    vi.mocked(fetchMarketQuotes).mockResolvedValue({})
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
    views.push(mount(QuoteView), mount(QuoteView))
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
    views.push(mount(QuoteView))
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
    views.push(mount(QuoteView))
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchMarketQuotes).not.toHaveBeenCalled()
  })

  it('conserva el símbolo visible y descarta la respuesta del ticker anterior al cambiar la consulta', async () => {
    let finishOld!: (value: Awaited<ReturnType<typeof fetchMarketQuotes>>) => void
    vi.mocked(fetchMarketQuotes)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve
          }),
      )
      .mockResolvedValueOnce({
        vwce: {
          instrumentId: 'vwce',
          price: 125,
          currency: 'EUR',
          timestamp: new Date().toISOString(),
          source: 'yahoo',
          status: 'fresh',
          isStale: false,
          previousClose: null,
          changePercent: null,
        },
      })
    views.push(mount(QuoteView))
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
    vi.mocked(fetchMarketQuotes).mockResolvedValue({
      vwce: {
        instrumentId: 'vwce',
        price: 73_000,
        currency: 'EUR',
        timestamp: new Date().toISOString(),
        source: 'yahoo',
        status: 'fresh',
        isStale: false,
        previousClose: null,
        changePercent: null,
      },
    })
    views.push(mount(QuoteView))
    await vi.advanceTimersByTimeAsync(0)
    useMarketStore().configureInstrumentSymbols('vwce', 'BTC', 'BTC-EUR')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMarketQuotes).toHaveBeenCalledTimes(1)
    expect(state.quotes.vwce?.price).toBe(73_000)
  })
})
