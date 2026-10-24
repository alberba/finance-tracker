import { describe, expect, it } from 'vitest'

import { symbolsMatchInstrument } from '../../src/domain/investment/symbol-matching'
import { calculateInstrumentUnits } from '../../src/domain/investment/valuation'
import type { Instrument, Transaction } from '../../src/scripts/types'

const bitcoin: Instrument = {
  id: 'bitcoin',
  investmentAssetId: 'crypto',
  type: 'crypto',
  symbol: 'BTC-EUR',
  market: '',
  currency: 'EUR',
  provider: 'yahoo',
  active: true,
}

describe('símbolos de cripto y pares de cotización Yahoo', () => {
  it('reconoce los movimientos BTC al cotizar BTC-EUR', () => {
    expect(symbolsMatchInstrument('BTC', bitcoin)).toBe(true)
    expect(symbolsMatchInstrument('ETH', bitcoin)).toBe(false)
    expect(symbolsMatchInstrument('BTC', { ...bitcoin, type: 'etf' })).toBe(false)
  })

  it('conserva los títulos de los movimientos al usar el par BTC-EUR', () => {
    const buy: Transaction = {
      id: 'buy-bitcoin',
      date: '2026-07-01',
      month: 7,
      type: 'investment',
      accountId: 'broker',
      category: 'Crypto',
      description: 'Compra BTC',
      amount: 100,
      symbol: 'BTC',
      side: 'buy',
      units: 0.09491284,
    }
    expect(calculateInstrumentUnits(bitcoin, [buy])).toBe(0.09491284)
  })
})
