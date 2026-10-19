import { beforeEach, describe, expect, it, vi } from 'vitest'

const { quoteMock } = vi.hoisted(() => ({ quoteMock: vi.fn() }))
vi.mock('../../src/lib/server/yahoo-finance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/server/yahoo-finance')>()),
  yahooFinance: { quote: quoteMock },
}))

import { loadMarketQuote } from '../../src/lib/server/market-data'
import { YahooFinanceHttpError } from '../../src/lib/server/yahoo-finance'
import type { Instrument, Quote } from '../../src/scripts/types'

const instrument: Instrument = {
  id: 'asset-vwce',
  investmentAssetId: 'asset',
  type: 'etf',
  symbol: 'VWCE',
  market: 'XETRA',
  currency: 'EUR',
  provider: 'twelve-data',
  active: true,
}

describe('adaptador de mercado server-side', () => {
  beforeEach(() => {
    quoteMock.mockReset()
  })

  it('normaliza la respuesta del proveedor y calcula la variación diaria', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          price: '125.5',
          previous_close: '124',
          datetime: new Date().toISOString(),
        }),
        { status: 200 },
      ),
    )
    const quote = await loadMarketQuote(
      { instrument },
      { TWELVE_DATA_API_KEY: 'secret' },
      fetchMock,
    )
    expect(quote).toMatchObject({
      instrumentId: 'asset-vwce',
      price: 125.5,
      currency: 'EUR',
      source: 'twelve-data',
      changePercent: 1.21,
      status: 'fresh',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.not.stringContaining('apikey=secret'),
      expect.objectContaining({ headers: { Authorization: 'apikey secret' } }),
    )
  })

  it('devuelve el último valor válido como stale cuando falla el proveedor', async () => {
    const fallback: Quote = {
      instrumentId: instrument.id,
      price: 120,
      currency: 'EUR',
      timestamp: '2026-07-09T10:00:00Z',
      source: 'twelve-data',
      status: 'fresh',
      isStale: false,
      previousClose: 119,
      changePercent: 0.84,
    }
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'))
    const quote = await loadMarketQuote(
      { instrument: { ...instrument, id: 'asset-vwce-fallback', symbol: 'FALLBACK' }, fallback },
      {},
      fetchMock,
    )
    expect(quote).toMatchObject({ price: 120, status: 'stale', isStale: true })
  })

  it('usa la autenticación Demo de CoinGecko y resuelve BTC como bitcoin', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          bitcoin: { eur: 55_000, eur_24h_change: 1.5 },
        }),
        { status: 200 },
      ),
    )
    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'crypto-btc',
          type: 'crypto',
          symbol: 'BTC',
          market: '',
          provider: 'coingecko',
        },
      },
      { COINGECKO_API_KEY: 'demo-secret', COINGECKO_API_PLAN: 'demo' },
      fetchMock,
    )
    expect(quote).toMatchObject({
      price: 55_000,
      currency: 'EUR',
      source: 'coingecko',
      changePercent: 1.5,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('ids=bitcoin'),
      expect.objectContaining({ headers: { 'x-cg-demo-api-key': 'demo-secret' } }),
    )
  })

  it.each(['BTC', 'BTC-EUR'])(
    'consulta Bitcoin en euros para el símbolo cripto %s',
    async (symbol) => {
      quoteMock.mockImplementation(async (ticker: string) => ({
        symbol: ticker,
        quoteType: ticker === 'BTC' ? 'ETF' : 'CRYPTOCURRENCY',
        currency: ticker === 'BTC' ? 'USD' : 'EUR',
        regularMarketPrice: ticker === 'BTC' ? 36.03 : 73_000,
        regularMarketTime: new Date(),
      }))
      const quote = await loadMarketQuote(
        {
          instrument: {
            ...instrument,
            id: `bitcoin-pair-${symbol}`,
            type: 'crypto',
            symbol,
            currency: 'EUR',
            provider: 'yahoo',
            market: '',
          },
        },
        {},
      )
      expect(quoteMock).toHaveBeenCalledWith('BTC-EUR')
      expect(quote).toMatchObject({ price: 73_000, currency: 'EUR', status: 'fresh' })
    },
  )

  it('consulta el ticker independiente del símbolo visible e invalida su caché al cambiarlo', async () => {
    quoteMock.mockImplementation(async (symbol: string) => ({
      quoteType: 'CRYPTOCURRENCY',
      currency: symbol.endsWith('EUR') ? 'EUR' : 'USD',
      regularMarketPrice: symbol.endsWith('EUR') ? 73_000 : 80_000,
      regularMarketTime: new Date(),
    }))
    const visible: Instrument = {
      ...instrument,
      id: 'independent-btc-ticker',
      type: 'crypto',
      symbol: 'BTC',
      quoteSymbol: 'BTC-EUR',
      provider: 'yahoo',
    }
    expect(await loadMarketQuote({ instrument: visible }, {})).toMatchObject({
      currency: 'EUR',
      price: 73_000,
    })
    expect(
      await loadMarketQuote({ instrument: { ...visible, quoteSymbol: 'BTC-USD' } }, {}),
    ).toMatchObject({ currency: 'USD', price: 80_000 })
    expect(quoteMock.mock.calls.map(([symbol]) => symbol)).toEqual(['BTC-EUR', 'BTC-USD'])
    expect(visible.symbol).toBe('BTC')
  })

  it('no acepta un ETF como cotización de una criptomoneda', async () => {
    quoteMock.mockResolvedValue({
      quoteType: 'ETF',
      currency: 'USD',
      regularMarketPrice: 36.03,
      regularMarketTime: new Date(),
    })
    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'crypto-wrong-asset-class',
          type: 'crypto',
          symbol: 'BTC-EUR',
          provider: 'yahoo',
        },
      },
      {},
    )
    expect(quote.status).toBe('unavailable')
  })

  it('normaliza la cotización de Yahoo Finance para AGED.MI sin API key', async () => {
    quoteMock.mockResolvedValue({
      currency: 'EUR',
      regularMarketPrice: 9.276,
      regularMarketTime: new Date(),
      regularMarketPreviousClose: 9.312,
    })

    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'aged-mi',
          symbol: 'AGED.MI',
          market: '',
          provider: 'yahoo',
        },
      },
      {},
    )

    expect(quote).toMatchObject({
      instrumentId: 'aged-mi',
      price: 9.276,
      currency: 'EUR',
      source: 'yahoo',
      previousClose: 9.312,
      status: 'fresh',
    })
    expect(quoteMock).toHaveBeenCalledWith('AGED.MI')
  })

  it('usa Yahoo por defecto sin credenciales', async () => {
    quoteMock.mockResolvedValue({
      regularMarketPrice: 10,
      regularMarketTime: new Date(),
      currency: 'EUR',
    })
    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'default-yahoo',
          provider: '',
          symbol: 'VWCE.DE',
        },
      },
      {},
    )
    expect(quote).toMatchObject({ price: 10, source: 'yahoo', status: 'fresh' })
  })

  it('marca el retraso declarado por Yahoo aunque la fecha del dato sea reciente', async () => {
    quoteMock.mockResolvedValue({
      regularMarketPrice: 10,
      regularMarketTime: new Date(),
      exchangeDataDelayedBy: 15,
    })
    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'yahoo-delayed',
          provider: 'yahoo',
        },
      },
      {},
    )
    expect(quote).toMatchObject({ price: 10, status: 'stale', isStale: true })
  })

  it('no inventa una fecha actual si Yahoo no devuelve hora de mercado', async () => {
    quoteMock.mockResolvedValue({ regularMarketPrice: 10 })
    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'yahoo-missing-time',
          provider: 'yahoo',
        },
      },
      {},
    )
    expect(quote).toMatchObject({ price: 10, timestamp: '', status: 'stale' })
  })

  it('convierte las cotizaciones en peniques a libras sin multiplicar el valor por cien', async () => {
    quoteMock.mockResolvedValue({
      currency: 'GBp',
      regularMarketPrice: 2500,
      regularMarketPreviousClose: 2000,
      regularMarketTime: new Date(),
    })
    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'yahoo-pence',
          provider: 'yahoo',
          symbol: 'VWRL.L',
        },
      },
      {},
    )
    expect(quote).toMatchObject({
      price: 25,
      previousClose: 20,
      currency: 'GBP',
      changePercent: 25,
    })
  })

  it('devuelve unavailable si Yahoo no encuentra el símbolo o no devuelve precio', async () => {
    quoteMock.mockResolvedValue(undefined)
    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'yahoo-not-found',
          provider: 'yahoo',
        },
      },
      {},
    )
    expect(quote).toMatchObject({ status: 'unavailable', source: 'unavailable' })
  })

  it('usa Twelve Data cuando Yahoo Finance responde 429', async () => {
    quoteMock.mockRejectedValue(new YahooFinanceHttpError(429, 60_000))
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          price: '9.276',
          previous_close: '9.312',
          datetime: new Date().toISOString(),
        }),
        { status: 200 },
      ),
    )

    const quote = await loadMarketQuote(
      {
        instrument: {
          ...instrument,
          id: 'aged-mi-rate-limit-fallback',
          symbol: 'AGED.MI',
          market: '',
          provider: 'yahoo',
        },
      },
      { MARKET_DATA_PROVIDER: 'twelve-data', TWELVE_DATA_API_KEY: 'fallback-secret' },
      fetchMock,
    )

    expect(quote).toMatchObject({
      instrumentId: 'aged-mi-rate-limit-fallback',
      price: 9.276,
      source: 'twelve-data',
      status: 'fresh',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.twelvedata.com/quote?symbol=AGED.MI'),
      expect.objectContaining({ headers: { Authorization: 'apikey fallback-secret' } }),
    )
  })

  it('deduplica las cotizaciones iguales que llegan mientras hay una petición en vuelo', async () => {
    let resolveResponse: ((response: unknown) => void) | undefined
    const responsePromise = new Promise((resolve) => {
      resolveResponse = resolve
    })
    quoteMock.mockReturnValue(responsePromise)
    const request = {
      instrument: {
        ...instrument,
        id: 'in-flight-quote',
        symbol: 'INFLIGHT',
        provider: 'yahoo',
      },
    }

    const first = loadMarketQuote(request, {})
    const second = loadMarketQuote(request, {})

    await Promise.resolve()
    expect(quoteMock).toHaveBeenCalledTimes(1)
    resolveResponse?.({ currency: 'EUR', regularMarketPrice: 10, regularMarketTime: new Date() })

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ price: 10 }),
      expect.objectContaining({ price: 10 }),
    ])
  })

  it('enfría la fuente después de un 429 para no repetir el golpe al proveedor', async () => {
    quoteMock.mockRejectedValue(new YahooFinanceHttpError(429, 60_000))
    const request = {
      instrument: {
        ...instrument,
        id: 'rate-limit-cooldown',
        symbol: 'COOLDOWN',
        provider: 'yahoo',
      },
    }

    await loadMarketQuote(request, {})
    await loadMarketQuote(request, {})

    expect(quoteMock).toHaveBeenCalledTimes(1)
  })
})
