import { beforeEach, describe, expect, it, vi } from 'vitest'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('../../src/lib/server/yahoo-finance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/server/yahoo-finance')>()),
  yahooFinance: { search: searchMock },
}))

import { Effect } from 'effect'
import { searchYahooSymbols } from '../../src/lib/server/market-search'

const search = (query: string) => Effect.runPromise(searchYahooSymbols(query))

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
  })
})
