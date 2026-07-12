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

})
