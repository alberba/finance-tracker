import { describe, expect, it } from 'vitest'

import { groupByInstrument, groupByType } from '../../src/domain/investment/grouping'
import { buildAccountPositions } from '../../src/domain/investment/positions'
import type { Month } from '../../src/lib/month'
import { normalizeState } from '../../src/scripts/state'

function instrument(id: string, accountId: string, symbol: string, type: string) {
  return {
    id,
    investmentAssetId: accountId,
    type,
    symbol,
    market: 'X',
    currency: 'EUR',
    provider: 'yahoo',
    active: true,
  }
}

function buy(
  id: string,
  date: string,
  units: number,
  unitPrice: number,
  extra: Record<string, unknown>,
) {
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'investment',
    accountId: 'cash',
    category: 'Inversión',
    description: `buy ${units}`,
    amount: units * unitPrice,
    side: 'buy',
    units,
    unitPrice,
    ...extra,
  }
}

function quote(instrumentId: string, price: number) {
  return {
    instrumentId,
    price,
    currency: 'EUR',
    timestamp: '2026-03-10T10:00:00.000Z',
    fetchedAt: '2026-03-10T10:00:00.000Z',
    dataType: 'live',
    source: 'test',
    status: 'fresh',
    isStale: false,
    previousClose: null,
    changePercent: null,
  }
}

// ETH en dos cuentas (Bitvavo y Trade Republic), BTC en Bitvavo, un ETF y una
// acción en Trade Republic. Cotizan todos.
function portfolio() {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [
      { id: 'bitvavo', name: 'Bitvavo', openingBalance: 0 },
      { id: 'tr', name: 'Trade Republic', openingBalance: 0 },
    ],
    liabilities: [],
    instruments: [
      instrument('i-btc', 'bitvavo', 'BTC', 'crypto'),
      instrument('i-eth', 'bitvavo', 'ETH', 'crypto'),
      instrument('i-xdwh', 'tr', 'XDWH', 'etf'),
      instrument('i-aapl', 'tr', 'AAPL', 'stock'),
    ],
    quotes: {
      'i-btc': quote('i-btc', 3000),
      'i-eth': quote('i-eth', 200),
      'i-xdwh': quote('i-xdwh', 120),
      'i-aapl': quote('i-aapl', 150),
    },
    transactions: [
      buy('t1', '2026-01-10', 1, 1000, { instrumentId: 'i-btc', destinationAccountId: 'bitvavo' }),
      buy('t2', '2026-01-11', 2, 100, { instrumentId: 'i-eth', destinationAccountId: 'bitvavo' }),
      buy('t3', '2026-01-12', 3, 100, { instrumentId: 'i-eth', destinationAccountId: 'tr' }),
      buy('t4', '2026-02-01', 10, 100, { instrumentId: 'i-xdwh', destinationAccountId: 'tr' }),
      buy('t5', '2026-02-02', 4, 100, { instrumentId: 'i-aapl', destinationAccountId: 'tr' }),
    ],
    snapshots: {},
    contributions: [],
  })
}

const positionsOf = () => buildAccountPositions(portfolio(), 3, { quotes: true })

describe('agrupar posiciones por instrumento', () => {
  it('un instrumento en varias cuentas sale una vez, con unidades, valor, invertido y ganancia sumados', () => {
    const groups = groupByInstrument(positionsOf())

    const eth = groups.find((group) => group.instrumentId === 'i-eth')!
    expect(eth).toMatchObject({
      symbol: 'ETH',
      instrumentType: 'crypto',
      units: 5,
      invested: 500,
      value: 1000,
      gain: 500,
      accounts: 2,
      priced: true,
    })
    expect(eth.returnPct).toBeCloseTo(100)
    expect(groups.filter((group) => group.symbol === 'ETH')).toHaveLength(1)
  })

  it('ordena por valor y los pesos suman 100', () => {
    const groups = groupByInstrument(positionsOf())

    // BTC 3.000, XDWH 1.200, ETH 1.000, AAPL 600.
    expect(groups.map((group) => group.symbol)).toEqual(['BTC', 'XDWH', 'ETH', 'AAPL'])
    expect(groups.reduce((sum, group) => sum + group.weight, 0)).toBeCloseTo(100)
    expect(groups[0].weight).toBeCloseTo((3000 / 5800) * 100)
  })

  it('avisa de que el valor es una estimación si alguna de sus posiciones no tiene precio', () => {
    const state = portfolio()
    const positions = buildAccountPositions({ ...state, quotes: {} }, 3, { quotes: true })

    expect(groupByInstrument(positions).every((group) => !group.priced)).toBe(true)
  })
})

describe('agrupar posiciones por tipo de instrumento', () => {
  it('suma las posiciones de los instrumentos del mismo tipo, sea cual sea su cuenta', () => {
    const groups = groupByType(positionsOf())

    const crypto = groups.find((group) => group.type === 'crypto')!
    expect(crypto).toMatchObject({ value: 4000, invested: 1500, gain: 2500 })
    expect(crypto.returnPct).toBeCloseTo((2500 / 1500) * 100)
    expect(crypto.instruments.map((item) => item.symbol)).toEqual(['BTC', 'ETH'])
  })

  it('usa el tipo del instrumento, no el de la cuenta, y ordena los tipos por valor', () => {
    const groups = groupByType(positionsOf())

    expect(groups.map((group) => group.type)).toEqual(['crypto', 'etf', 'stock'])
    expect(groups.reduce((sum, group) => sum + group.weight, 0)).toBeCloseTo(100)
    expect(groups[0].weight).toBeCloseTo((4000 / 5800) * 100)
  })
})
