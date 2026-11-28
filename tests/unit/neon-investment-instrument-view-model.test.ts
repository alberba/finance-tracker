import { describe, expect, it } from 'vitest'

import { buildInvestmentDashboardViewModel } from '../../src/domain/investment/view-model'
import type { Month } from '../../src/lib/month'
import { instrumentDetail } from '../../src/neon/sections/investment/instrument-view-model'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'

function instrument(id: string, accountId: string, symbol: string) {
  return {
    id,
    investmentAssetId: accountId,
    type: 'crypto',
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

const ethQuote = (price: number) => ({
  'i-eth': {
    instrumentId: 'i-eth',
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
  },
})

/**
 * ETH is held in two accounts: Crypto (10 bought in two goes, 2 sold) and
 * Bitvavo (4, a movement that carries only the symbol and its category).
 * BTC, in Crypto only, must stay out of ETH's detail.
 */
function portfolio(overrides: Record<string, unknown> = {}): State {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [
      { id: 'crypto', name: 'Crypto', openingBalance: 0 },
      { id: 'bitvavo', name: 'Bitvavo', openingBalance: 0 },
    ],
    liabilities: [],
    instruments: [instrument('i-btc', 'crypto', 'BTC'), instrument('i-eth', 'crypto', 'ETH')],
    quotes: ethQuote(150),
    transactions: [
      operation('t1', '2026-01-10', 'buy', 1, 1000, { instrumentId: 'i-btc', symbol: 'BTC' }),
      operation('t2', '2026-01-20', 'buy', 8, 100, { instrumentId: 'i-eth', symbol: 'ETH' }),
      operation('t3', '2026-02-12', 'buy', 4, 100, { instrumentId: 'i-eth', symbol: 'ETH' }),
      operation('t4', '2026-02-20', 'sell', 2, 130, { instrumentId: 'i-eth', symbol: 'ETH' }),
      operation('t5', '2026-03-02', 'buy', 4, 120, { category: 'Bitvavo', symbol: 'ETH' }),
    ],
    snapshots: {},
    contributions: [],
    ...overrides,
  })
}

function detailOf(state: State, id: string) {
  const vm = buildInvestmentDashboardViewModel(state, 3, 'simple', { quotes: true })
  return instrumentDetail(state, vm, id)
}

describe('instrumentDetail', () => {
  it('lista la posición del instrumento en cada cuenta con sus unidades y su valor, y el total', () => {
    const detail = detailOf(portfolio(), 'i-eth')!

    expect(detail.symbol).toBe('ETH')
    expect(detail.typeLabel).toBe('Cripto')
    expect(detail.positions.map((line) => line.accountName)).toEqual(['Crypto', 'Bitvavo'])
    const [crypto, bitvavo] = detail.positions
    expect(crypto.units).toBe('10')
    expect(crypto.value).toContain('1.500,00')
    expect(bitvavo.units).toBe('4')
    expect(bitvavo.value).toContain('600,00')
    expect(detail.total).toMatchObject({ units: '14' })
    expect(detail.total!.value).toContain('2.100,00')
  })

  it('el total suma lo invertido y la ganancia de todas sus posiciones', () => {
    const detail = detailOf(portfolio(), 'i-eth')!

    // 12 × 100 − 2 × 130 = 940 in Crypto, 480 in Bitvavo.
    expect(detail.total!.invested).toContain('1.420,00')
    expect(detail.total!.gain).toContain('680,00')
    expect(detail.total!.tone).toBe('gain')
  })

  it('con una sola cuenta el total es esa posición', () => {
    const detail = detailOf(portfolio(), 'i-btc')!

    expect(detail.positions.map((line) => line.accountName)).toEqual(['Crypto'])
    expect(detail.total!.units).toBe('1')
  })

  it('lista sus movimientos de compra y venta, de más nuevo a más viejo, sin los de otros instrumentos', () => {
    const detail = detailOf(portfolio(), 'i-eth')!

    expect(detail.count).toBe('4 operaciones')
    expect(detail.years).toHaveLength(1)
    expect(detail.years[0].year).toBe('2026')
    expect(detail.years[0].rows.map((row) => [row.id, row.operation])).toEqual([
      ['t5', 'Compra'],
      ['t4', 'Venta'],
      ['t3', 'Compra'],
      ['t2', 'Compra'],
    ])
  })

  it('avisa de que el valor es una estimación cuando el instrumento no tiene cotización', () => {
    const detail = detailOf(portfolio({ quotes: {} }), 'i-eth')!

    expect(detail.unpricedNote).toMatch(/Sin cotización/)
    expect(detail.positions.every((line) => line.estimated)).toBe(true)
  })

  it('con cotización no lleva aviso', () => {
    expect(detailOf(portfolio(), 'i-eth')!.unpricedNote).toBeNull()
  })

  it('un instrumento vendido del todo sigue teniendo detalle: sin posiciones, con su historial', () => {
    const state = portfolio({
      transactions: [
        operation('t1', '2026-01-10', 'buy', 2, 100, { instrumentId: 'i-eth', symbol: 'ETH' }),
        operation('t2', '2026-02-10', 'sell', 2, 150, { instrumentId: 'i-eth', symbol: 'ETH' }),
      ],
    })
    const detail = detailOf(state, 'i-eth')!

    expect(detail.positions).toEqual([])
    expect(detail.total).toBeNull()
    expect(detail.count).toBe('2 operaciones')
  })

  it('un instrumento que no existe no tiene detalle', () => {
    expect(detailOf(portfolio(), 'i-nope')).toBeNull()
  })
})
