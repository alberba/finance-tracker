import { describe, expect, it } from 'vitest'

import { buildPositionEvolution } from '../../src/domain/investment/position-evolution'
import type { Month } from '../../src/lib/month'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'

function instrument(id: string, symbol: string, currency = 'EUR') {
  return {
    id,
    investmentAssetId: 'crypto',
    type: 'crypto',
    symbol,
    market: 'CRYPTO',
    currency,
    provider: 'yahoo',
    active: true,
  }
}

function operation(
  id: string,
  date: string,
  side: 'buy' | 'sell',
  units: number,
  unitPrice: number,
  instrumentId: string,
  symbol: string,
) {
  const total = units * unitPrice
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'investment',
    accountId: 'cash',
    category: 'Crypto',
    description: `${side} ${symbol}`,
    amount: side === 'buy' ? total : -total,
    side,
    units,
    unitPrice,
    symbol,
    instrumentId,
  }
}

function snapshot(month: number, value: number) {
  return { month, accounts: {}, investments: { crypto: value }, liabilities: {} }
}

// BTC: 1 unit in January, a second in February. ETH: 10 units in February.
function crypto(overrides: Record<string, unknown> = {}): State {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [{ id: 'crypto', name: 'Crypto', openingBalance: 0 }],
    liabilities: [],
    instruments: [instrument('i-btc', 'BTC'), instrument('i-eth', 'ETH')],
    quotes: {},
    transactions: [
      operation('t1', '2026-01-10', 'buy', 1, 1000, 'i-btc', 'BTC'),
      operation('t2', '2026-02-10', 'buy', 1, 3000, 'i-btc', 'BTC'),
      operation('t3', '2026-02-12', 'buy', 10, 100, 'i-eth', 'ETH'),
    ],
    snapshots: {
      '1': snapshot(1, 1100),
      '2': snapshot(2, 6200),
      '3': snapshot(3, 6800),
    },
    contributions: [],
    ...overrides,
  })
}

const valuesOf = (evolution: ReturnType<typeof buildPositionEvolution>, symbol: string) =>
  evolution.find((position) => position.symbol === symbol)?.values

describe('buildPositionEvolution', () => {
  it('con histórico, cada mes vale los títulos a fin de mes por el cierre de ese mes', () => {
    // Cierres: diciembre anterior y de enero a marzo.
    const evolution = buildPositionEvolution(crypto(), 'crypto', 3, {
      'i-btc': [900, 1100, 2500, 2600],
      'i-eth': [90, 95, 110, 120],
    })

    expect(valuesOf(evolution, 'BTC')).toEqual([0, 1100, 5000, 5200])
    expect(valuesOf(evolution, 'ETH')).toEqual([0, 0, 1100, 1200])
  })

  it('sin histórico, reparte el valor de la cuenta de cada cierre según lo invertido en cada instrumento', () => {
    const evolution = buildPositionEvolution(crypto(), 'crypto', 3, {})

    // Febrero: 6.200 con 4.000 de BTC y 1.000 de ETH invertidos. Marzo: 6.800.
    expect(valuesOf(evolution, 'BTC')).toEqual([0, 1100, 4960, 5440])
    expect(valuesOf(evolution, 'ETH')).toEqual([0, 0, 1240, 1360])
  })

  it('con histórico solo de una posición, la otra se queda con lo que le deja el cierre de la cuenta', () => {
    const evolution = buildPositionEvolution(crypto(), 'crypto', 3, {
      'i-btc': [900, 1100, 2500, 2600],
    })

    expect(valuesOf(evolution, 'BTC')).toEqual([0, 1100, 5000, 5200])
    expect(valuesOf(evolution, 'ETH')).toEqual([0, 0, 1200, 1600])
  })

  it('un mes sin títulos vale cero aunque el instrumento tenga cierre', () => {
    const state = crypto({
      transactions: [
        operation('t1', '2026-01-10', 'buy', 1, 1000, 'i-btc', 'BTC'),
        operation('t2', '2026-03-05', 'sell', 1, 2600, 'i-btc', 'BTC'),
      ],
    })

    const evolution = buildPositionEvolution(state, 'crypto', 3, {
      'i-btc': [900, 1100, 2500, 2600],
    })

    expect(valuesOf(evolution, 'BTC')).toEqual([0, 1100, 2500, 0])
  })
})
