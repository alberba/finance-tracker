import { describe, expect, it, vi } from 'vitest'

import { loadMarketQuote } from '../../src/lib/server/market-data'
import type { Instrument, Quote } from '../../src/scripts/types'

const instrument: Instrument = {
  id: 'asset-vwce', investmentAssetId: 'asset', type: 'etf', symbol: 'VWCE', market: 'XETRA',
  currency: 'EUR', provider: 'twelve-data', active: true,
}

describe('adaptador de mercado server-side', () => {
  it('normaliza la respuesta del proveedor y calcula la variación diaria', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      price: '125.5', previous_close: '124', datetime: new Date().toISOString(),
    }), { status: 200 }))
    const quote = await loadMarketQuote({ instrument }, { TWELVE_DATA_API_KEY: 'secret' }, fetchMock)
    expect(quote).toMatchObject({ instrumentId: 'asset-vwce', price: 125.5, currency: 'EUR', source: 'twelve-data', changePercent: 1.21, status: 'fresh' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.not.stringContaining('apikey=secret'),
      expect.objectContaining({ headers: { Authorization: 'apikey secret' } }),
    )
  })

  it('devuelve el último valor válido como stale cuando falla el proveedor', async () => {
    const fallback: Quote = {
      instrumentId: instrument.id, price: 120, currency: 'EUR', timestamp: '2026-07-09T10:00:00Z',
      source: 'twelve-data', status: 'fresh', isStale: false, previousClose: 119, changePercent: 0.84,
    }
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'))
    const quote = await loadMarketQuote({ instrument: { ...instrument, id: 'asset-vwce-fallback', symbol: 'FALLBACK' }, fallback }, {}, fetchMock)
    expect(quote).toMatchObject({ price: 120, status: 'stale', isStale: true })
  })

  it('usa la autenticación Demo de CoinGecko y resuelve BTC como bitcoin', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      bitcoin: { eur: 55_000, eur_24h_change: 1.5 },
    }), { status: 200 }))
    const quote = await loadMarketQuote({ instrument: {
      ...instrument, id: 'crypto-btc', type: 'crypto', symbol: 'BTC', market: '', provider: 'coingecko',
    } }, { COINGECKO_API_KEY: 'demo-secret', COINGECKO_API_PLAN: 'demo' }, fetchMock)
    expect(quote).toMatchObject({ price: 55_000, currency: 'EUR', source: 'coingecko', changePercent: 1.5 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('ids=bitcoin'),
      expect.objectContaining({ headers: { 'x-cg-demo-api-key': 'demo-secret' } }),
    )
  })

  it('normaliza la cotización de Yahoo Finance para AGED.MI sin API key', async () => {
    const nowInSeconds = Math.floor(Date.now() / 1_000)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      chart: {
        result: [{
          meta: {
            currency: 'EUR', regularMarketPrice: 9.276, regularMarketTime: nowInSeconds,
            chartPreviousClose: 9.312,
          },
          timestamp: [nowInSeconds - 86_400, nowInSeconds],
          indicators: { quote: [{ close: [9.312, 9.276] }] },
        }],
        error: null,
      },
    }), { status: 200 }))

    const quote = await loadMarketQuote({ instrument: {
      ...instrument, id: 'aged-mi', symbol: 'AGED.MI', market: '', provider: 'yahoo',
    } }, {}, fetchMock)

    expect(quote).toMatchObject({
      instrumentId: 'aged-mi', price: 9.276, currency: 'EUR', source: 'yahoo',
      previousClose: 9.312, status: 'fresh',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v8/finance/chart/AGED.MI?'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('usa Twelve Data cuando Yahoo Finance responde 429', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        price: '9.276', previous_close: '9.312', datetime: new Date().toISOString(),
      }), { status: 200 }))

    const quote = await loadMarketQuote({ instrument: {
      ...instrument, id: 'aged-mi-rate-limit-fallback', symbol: 'AGED.MI', market: '', provider: 'yahoo',
    } }, { MARKET_DATA_PROVIDER: 'twelve-data', TWELVE_DATA_API_KEY: 'fallback-secret' }, fetchMock)

    expect(quote).toMatchObject({
      instrumentId: 'aged-mi-rate-limit-fallback', price: 9.276, source: 'twelve-data', status: 'fresh',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('api.twelvedata.com/quote?symbol=AGED.MI'),
      expect.objectContaining({ headers: { Authorization: 'apikey fallback-secret' } }),
    )
  })

  it('deduplica las cotizaciones iguales que llegan mientras hay una petición en vuelo', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(responsePromise)
    const request = { instrument: {
      ...instrument, id: 'in-flight-quote', symbol: 'INFLIGHT', provider: 'yahoo',
    } }

    const first = loadMarketQuote(request, {}, fetchMock)
    const second = loadMarketQuote(request, {}, fetchMock)

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveResponse?.(new Response(JSON.stringify({
      chart: {
        result: [{
          meta: { currency: 'EUR', regularMarketPrice: 10, regularMarketTime: Math.floor(Date.now() / 1_000) },
        }],
      },
    }), { status: 200 }))

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ price: 10 }),
      expect.objectContaining({ price: 10 }),
    ])
  })

  it('enfría la fuente después de un 429 para no repetir el golpe al proveedor', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('Too Many Requests', { status: 429 }),
    )
    const request = { instrument: {
      ...instrument, id: 'rate-limit-cooldown', symbol: 'COOLDOWN', provider: 'yahoo',
    } }

    await loadMarketQuote(request, {}, fetchMock)
    await loadMarketQuote(request, {}, fetchMock)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

})
