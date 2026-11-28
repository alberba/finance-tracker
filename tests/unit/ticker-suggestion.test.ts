import { describe, expect, it } from 'vitest'

import { suggestYahooTicker } from '../../src/domain/investment/ticker-suggestion'

// Results as Yahoo's search returned them on 2026-11-28.
const candidates = (...rows: Array<[string, string]>) =>
  rows.map(([symbol, type]) => ({ symbol, type }))

describe('símbolo de Yahoo propuesto a partir del de los movimientos', () => {
  it('propone la bolsa en euros antes que EE. UU. o Londres, y nunca otro valor parecido', () => {
    expect(
      suggestYahooTicker(
        'IQQI',
        candidates(['IQQI', 'ETF'], ['IQQI.MU', 'ETF'], ['IQQI.DE', 'ETF'], ['IQQID.XD', 'ETF']),
      ),
    ).toBe('IQQI.DE')
    expect(suggestYahooTicker('AGED', candidates(['AGED.L', 'ETF'], ['AGED.MI', 'ETF']))).toBe(
      'AGED.MI',
    )
    expect(
      suggestYahooTicker(
        'AMZN',
        candidates(['AMZU', 'ETF'], ['AMZN', 'EQUITY'], ['AMZN.TO', 'EQUITY']),
      ),
    ).toBe('AMZN')
  })

  it('propone una criptomoneda en euros aunque Yahoo dé primero el par en dólares', () => {
    expect(
      suggestYahooTicker(
        'BTC',
        candidates(['BTC-USD', 'CRYPTOCURRENCY'], ['BTC=F', 'FUTURE'], ['GBTC', 'ETF']),
      ),
    ).toBe('BTC-EUR')
  })
})
