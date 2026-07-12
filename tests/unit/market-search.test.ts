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
})
