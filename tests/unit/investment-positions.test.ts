import { describe, expect, it } from 'vitest'

import { computeInvestmentValue } from '../../src/domain/investment/calculations'
import {
  buildAccountPositions,
  buildUninstrumentedHoldings,
} from '../../src/domain/investment/positions'
import type { Month } from '../../src/lib/month'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'

function instrument(id: string, accountId: string, symbol: string, type = 'crypto') {
  return {
    id,
    investmentAssetId: accountId,
    type,
    symbol,
    market: 'CRYPTO',
    currency: 'EUR',
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
  extra: Record<string, unknown> = {},
) {
  const total = units * unitPrice
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'investment',
    accountId: 'cash',
    category: 'Crypto',
    description: `${side} ${units}`,
    amount: side === 'buy' ? total : -total,
    side,
    units,
    unitPrice,
    ...extra,
  }
}

function quote(instrumentId: string, price: number, status = 'fresh') {
  return {
    instrumentId,
    price,
    currency: 'EUR',
    timestamp: '2026-03-10T10:00:00.000Z',
    fetchedAt: '2026-03-10T10:00:00.000Z',
    dataType: 'live',
    source: 'test',
    status,
    isStale: false,
    previousClose: null,
    changePercent: null,
  }
}

function crypto(overrides: Record<string, unknown> = {}): State {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [
      { id: 'crypto', name: 'Crypto', openingBalance: 0 },
      { id: 'oro', name: 'Oro', openingBalance: 0 },
    ],
    liabilities: [],
    instruments: [instrument('i-btc', 'crypto', 'BTC'), instrument('i-eth', 'crypto', 'ETH')],
    quotes: {},
    transactions: [
      operation('t1', '2026-01-10', 'buy', 1, 1000, { instrumentId: 'i-btc', symbol: 'BTC' }),
      operation('t2', '2026-02-10', 'buy', 1, 3000, { instrumentId: 'i-btc', symbol: 'BTC' }),
      operation('t3', '2026-02-12', 'buy', 10, 100, { instrumentId: 'i-eth', symbol: 'ETH' }),
    ],
    snapshots: {},
    contributions: [],
    ...overrides,
  })
}

const inAccount = (positions: ReturnType<typeof buildAccountPositions>, id: string) =>
  positions.filter((position) => position.accountId === id)

describe('buildAccountPositions', () => {
  it('muestra todas las posiciones de una cuenta, cada una con sus títulos, precio medio e invertido', () => {
    const positions = inAccount(buildAccountPositions(crypto(), 3), 'crypto')

    expect(positions.map((position) => position.symbol).sort()).toEqual(['BTC', 'ETH'])
    const btc = positions.find((position) => position.symbol === 'BTC')!
    const eth = positions.find((position) => position.symbol === 'ETH')!
    expect(btc).toMatchObject({
      instrumentId: 'i-btc',
      units: 2,
      averagePrice: 2000,
      invested: 4000,
    })
    expect(eth).toMatchObject({
      instrumentId: 'i-eth',
      units: 10,
      averagePrice: 100,
      invested: 1000,
    })
  })

  it('sin cotización, reparte el valor de la cuenta en proporción a lo invertido y lo marca sin precio', () => {
    // La cuenta vale 5.200 según su cierre: 4.000 de BTC y 1.000 de ETH invertidos.
    const state = crypto({
      snapshots: {
        '3': { month: 3, accounts: {}, investments: { crypto: 5200 }, liabilities: {} },
      },
    })

    const positions = inAccount(buildAccountPositions(state, 3), 'crypto')

    const btc = positions.find((position) => position.symbol === 'BTC')!
    const eth = positions.find((position) => position.symbol === 'ETH')!
    expect(btc).toMatchObject({ value: 4160, priced: false, gain: 160 })
    expect(eth).toMatchObject({ value: 1040, priced: false, gain: 40 })
    expect(btc.returnPct).toBeCloseTo(4)
    expect(btc.weight).toBeCloseTo(80)
    expect(eth.weight).toBeCloseTo(20)
  })

  it('con cotización, valora cada posición en títulos × precio y el peso sale de esos valores', () => {
    const state = crypto({
      quotes: { 'i-btc': quote('i-btc', 5000), 'i-eth': quote('i-eth', 200) },
    })

    const positions = inAccount(buildAccountPositions(state, 3, { quotes: true }), 'crypto')

    const btc = positions.find((position) => position.symbol === 'BTC')!
    const eth = positions.find((position) => position.symbol === 'ETH')!
    expect(btc).toMatchObject({ value: 10000, priced: true, gain: 6000 })
    expect(eth).toMatchObject({ value: 2000, priced: true, gain: 1000 })
    expect(btc.weight).toBeCloseTo((10000 / 12000) * 100)
  })

  it('una posición sin cotización se queda con lo que no cubren las valoradas', () => {
    // BTC cotiza a 5.000 (10.000 con 2 títulos). La cuenta vale 12.000: ETH recoge los 2.000 restantes.
    const state = crypto({
      quotes: { 'i-btc': quote('i-btc', 5000) },
      snapshots: {
        '3': { month: 3, accounts: {}, investments: { crypto: 12000 }, liabilities: {} },
      },
    })

    const positions = inAccount(buildAccountPositions(state, 3, { quotes: true }), 'crypto')

    expect(positions.find((position) => position.symbol === 'BTC')).toMatchObject({
      value: 10000,
      priced: true,
    })
    expect(positions.find((position) => position.symbol === 'ETH')).toMatchObject({
      value: 2000,
      priced: false,
    })
  })

  it('ignora una cotización no disponible', () => {
    const state = crypto({ quotes: { 'i-btc': quote('i-btc', 5000, 'unavailable') } })

    const btc = inAccount(buildAccountPositions(state, 3, { quotes: true }), 'crypto').find(
      (position) => position.symbol === 'BTC',
    )!

    expect(btc.priced).toBe(false)
  })

  it('los movimientos sin instrumento ni títulos suman a la cuenta pero no forman posición', () => {
    const state = crypto({
      transactions: [
        ...crypto().transactions,
        {
          id: 'legacy',
          date: '2026-02-20',
          month: 2,
          type: 'investment',
          accountId: 'cash',
          category: 'Crypto',
          description: 'Aportación por importe',
          amount: 500,
          instrumentId: 'i-btc',
          side: 'buy',
        },
      ],
    })

    const positions = inAccount(buildAccountPositions(state, 3), 'crypto')

    expect(positions).toHaveLength(2)
    // La cuenta vale 5.500; los 500 sin títulos no son de ninguna posición.
    expect(positions.map((position) => [position.symbol, position.value]).sort()).toEqual([
      ['BTC', 4000],
      ['ETH', 1000],
    ])
  })

  it('una posición vendida del todo no aparece', () => {
    const state = crypto({
      transactions: [
        ...crypto().transactions,
        operation('t4', '2026-03-01', 'sell', 10, 120, { instrumentId: 'i-eth', symbol: 'ETH' }),
      ],
    })

    const symbols = inAccount(buildAccountPositions(state, 3), 'crypto').map(
      (position) => position.symbol,
    )

    expect(symbols).toEqual(['BTC'])
  })

  it('una venta parcial resta títulos y no entra en el precio medio', () => {
    const state = crypto({
      transactions: [
        ...crypto().transactions,
        operation('t4', '2026-03-01', 'sell', 4, 120, { instrumentId: 'i-eth', symbol: 'ETH' }),
      ],
    })

    const eth = inAccount(buildAccountPositions(state, 3), 'crypto').find(
      (position) => position.symbol === 'ETH',
    )!

    expect(eth).toMatchObject({ units: 6, averagePrice: 100 })
  })

  it('vincula por símbolo el movimiento al que le falta el instrumento', () => {
    const state = crypto({
      transactions: [operation('t1', '2026-01-10', 'buy', 3, 100, { symbol: 'ETH' })],
    })

    const positions = inAccount(buildAccountPositions(state, 3), 'crypto')

    expect(positions).toHaveLength(1)
    expect(positions[0]).toMatchObject({ instrumentId: 'i-eth', units: 3 })
  })

  it('solo cuenta los movimientos hasta el mes de análisis', () => {
    const positions = inAccount(buildAccountPositions(crypto(), 1), 'crypto')

    expect(positions.map((position) => [position.symbol, position.units])).toEqual([['BTC', 1]])
  })

  it('no mezcla las posiciones de cuentas distintas', () => {
    const state = crypto({
      instruments: [
        instrument('i-btc', 'crypto', 'BTC'),
        instrument('i-sgln', 'oro', 'SGLN', 'etf'),
      ],
      transactions: [
        operation('t1', '2026-01-10', 'buy', 1, 1000, { instrumentId: 'i-btc' }),
        operation('t2', '2026-01-11', 'buy', 4, 50, {
          instrumentId: 'i-sgln',
          category: 'Oro',
        }),
      ],
    })

    const positions = buildAccountPositions(state, 3)

    expect(positions.map((position) => [position.accountId, position.symbol])).toEqual([
      ['crypto', 'BTC'],
      ['oro', 'SGLN'],
    ])
  })
})

describe('cuenta de inversión destino del movimiento', () => {
  const withBitvavo = (transactions: Record<string, unknown>[]) =>
    crypto({
      investmentAssets: [
        { id: 'crypto', name: 'Crypto', openingBalance: 0 },
        { id: 'bitvavo', name: 'Bitvavo', openingBalance: 0 },
        { id: 'oro', name: 'Oro', openingBalance: 0 },
      ],
      transactions,
    })

  it('la cuenta destino explícita manda sobre la del instrumento', () => {
    const state = withBitvavo([
      operation('t1', '2026-01-10', 'buy', 2, 100, {
        instrumentId: 'i-eth',
        symbol: 'ETH',
        destinationAccountId: 'bitvavo',
      }),
    ])

    const positions = buildAccountPositions(state, 3)

    expect(positions.map((position) => [position.accountId, position.symbol])).toEqual([
      ['bitvavo', 'ETH'],
    ])
    expect(computeInvestmentValue(state, 'bitvavo', 3)).toBe(200)
    expect(computeInvestmentValue(state, 'crypto', 3)).toBe(0)
  })

  it('un instrumento comprado en dos cuentas es una posición en cada una', () => {
    const state = withBitvavo([
      operation('t1', '2026-01-10', 'buy', 1, 100, { instrumentId: 'i-eth' }),
      operation('t2', '2026-01-11', 'buy', 3, 100, {
        instrumentId: 'i-eth',
        destinationAccountId: 'bitvavo',
      }),
    ])

    const positions = buildAccountPositions(state, 3)

    expect(
      positions.map((position) => [position.accountId, position.symbol, position.units]),
    ).toEqual([
      ['crypto', 'ETH', 1],
      ['bitvavo', 'ETH', 3],
    ])
  })

  it('sin cuenta destino, manda la cuenta del instrumento sobre la categoría', () => {
    const state = withBitvavo([
      operation('t1', '2026-01-10', 'buy', 1, 100, { instrumentId: 'i-eth', category: 'Oro' }),
    ])

    expect(buildAccountPositions(state, 3).map((position) => position.accountId)).toEqual([
      'crypto',
    ])
    expect(computeInvestmentValue(state, 'oro', 3)).toBe(0)
  })

  it('sin cuenta destino ni instrumento, la categoría atribuye el movimiento (legacy)', () => {
    const state = withBitvavo([operation('t1', '2026-01-10', 'buy', 1, 100, { category: 'Oro' })])

    expect(computeInvestmentValue(state, 'oro', 3)).toBe(100)
  })

  it('una cuenta destino que ya no existe no deja el movimiento huérfano', () => {
    const state = withBitvavo([
      operation('t1', '2026-01-10', 'buy', 1, 100, {
        instrumentId: 'i-eth',
        destinationAccountId: 'borrada',
      }),
    ])

    expect(computeInvestmentValue(state, 'crypto', 3)).toBe(100)
  })
})

describe('buildUninstrumentedHoldings', () => {
  const legacy = (amount: number, accountId = 'crypto') => ({
    id: `legacy-${accountId}-${amount}`,
    date: '2026-02-20',
    month: 2,
    type: 'investment',
    accountId: 'cash',
    destinationAccountId: accountId,
    category: 'Crypto',
    description: 'Aportación por importe',
    amount,
  })

  it('da lo que una cuenta tiene sin instrumento: el importe de esos movimientos y la parte de su valor', () => {
    const state = crypto({ transactions: [...crypto().transactions, legacy(500)] })

    expect(buildUninstrumentedHoldings(state, 3)).toEqual([
      { accountId: 'crypto', invested: 500, value: 500 },
    ])
  })

  it('incluye una cuenta que solo tiene movimientos sin instrumento', () => {
    const state = crypto({ transactions: [...crypto().transactions, legacy(200, 'oro')] })

    expect(buildUninstrumentedHoldings(state, 3)).toEqual([
      { accountId: 'oro', invested: 200, value: 200 },
    ])
  })

  it('no lista un importe despreciable ni una cuenta cuyas posiciones lo explican todo', () => {
    expect(buildUninstrumentedHoldings(crypto(), 3)).toEqual([])
    const dust = crypto({ transactions: [...crypto().transactions, legacy(0.2)] })
    expect(buildUninstrumentedHoldings(dust, 3)).toEqual([])
  })
})
