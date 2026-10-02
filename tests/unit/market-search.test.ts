import { describe, expect, it, vi } from 'vitest'

import { searchYahooSymbols } from '../../src/lib/server/market-search'

describe('búsqueda de símbolos de mercado', () => {
  it('normaliza resultados aproximados de Yahoo Finance', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      quotes: [{
        symbol: 'XDWH.DE',
        longname: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
        exchDisp: 'XETRA',
        quoteType: 'ETF',
      }],
    }), { status: 200 }))

    const results = await searchYahooSymbols('XDWH.XETRA', fetchMock)

    expect(results).toEqual([{
      symbol: 'XDWH.DE',
      name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
      exchange: 'XETRA',
      currency: '',
      type: 'ETF',
    }])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/finance/search?q=XDWH.XETRA'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('usa la búsqueda de Twelve Data cuando Yahoo está limitado', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          symbol: 'XDWH.DE', instrument_name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
          exchange: 'XETRA', currency: 'EUR', instrument_type: 'ETF',
        }],
      }), { status: 200 }))

    const results = await searchYahooSymbols('XDWH-FALLBACK', fetchMock, { TWELVE_DATA_API_KEY: 'fallback-secret' })

    expect(results).toEqual([{
      symbol: 'XDWH.DE',
      name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
      exchange: 'XETRA',
      currency: 'EUR',
      type: 'ETF',
    }])
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('api.twelvedata.com/symbol_search?symbol=XDWH-FALLBACK'),
      expect.objectContaining({ headers: { Authorization: 'apikey fallback-secret' } }),
    )
  })
})
