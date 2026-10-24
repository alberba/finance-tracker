import { beforeEach, describe, expect, it, vi } from 'vitest'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('../../src/lib/server/yahoo-finance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/server/yahoo-finance')>()),
  yahooFinance: { search: searchMock },
}))

import { Effect } from 'effect'
import { searchYahooSymbols, type MarketSearchEnv } from '../../src/lib/server/market-search'
import { Http } from '../../src/lib/server/http'
import { YahooFinanceHttpError } from '../../src/lib/server/yahoo-finance'

const search = (query: string, env: MarketSearchEnv = {}, request: typeof fetch = fetch) =>
  Effect.runPromise(Effect.provideService(searchYahooSymbols(query, env), Http, { request }))

describe('búsqueda de símbolos de mercado', () => {
  beforeEach(() => {
    searchMock.mockReset()
  })

  it('normaliza resultados aproximados de Yahoo Finance', async () => {
    searchMock.mockResolvedValue({
      quotes: [
        {
          symbol: 'XDWH.DE',
          longname: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
          exchDisp: 'XETRA',
          quoteType: 'ETF',
        },
      ],
    })

    const results = await search('XDWH.XETRA')

    expect(results).toEqual([
      {
        symbol: 'XDWH.DE',
        name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
        exchange: 'XETRA',
        currency: '',
        type: 'ETF',
      },
    ])
    expect(searchMock).toHaveBeenCalledWith('XDWH.XETRA', { quotesCount: 10, newsCount: 0 })
  })

  it('usa la búsqueda de Twelve Data cuando Yahoo está limitado', async () => {
    searchMock.mockRejectedValue(new YahooFinanceHttpError(429, 60_000))
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              symbol: 'XDWH.DE',
              instrument_name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
              exchange: 'XETRA',
              currency: 'EUR',
              instrument_type: 'ETF',
            },
          ],
        }),
        { status: 200 },
      ),
    )

    const results = await search(
      'XDWH-FALLBACK',
      { TWELVE_DATA_API_KEY: 'fallback-secret' },
      fetchMock,
    )

    expect(results).toEqual([
      {
        symbol: 'XDWH.DE',
        name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
        exchange: 'XETRA',
        currency: 'EUR',
        type: 'ETF',
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.twelvedata.com/symbol_search?symbol=XDWH-FALLBACK'),
      expect.objectContaining({ headers: { Authorization: 'apikey fallback-secret' } }),
    )
  })
})
