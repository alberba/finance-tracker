import { describe, expect, it } from 'vitest'

import { buildInvestmentDashboardViewModel } from '../../src/domain/investment/view-model'
import type { Month } from '../../src/lib/month'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'

function buy(
  id: string,
  category: string,
  date: string,
  units: number,
  unitPrice: number,
  symbol?: string,
) {
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'investment',
    accountId: 'broker',
    category,
    description: `Compra ${units} ${symbol ?? ''}`.trim(),
    amount: units * unitPrice,
    side: 'buy',
    units,
    unitPrice,
    symbol,
  }
}

function portfolio(overrides: Record<string, unknown> = {}): State {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
    investmentAssets: [
      { id: 'fondos', name: 'Fondos', openingBalance: 0 },
      { id: 'oro', name: 'Oro', openingBalance: 0 },
      { id: 'vacio', name: 'Vacío', openingBalance: 0 },
    ],
    liabilities: [],
    transactions: [
      buy('t1', 'Fondos', '2026-01-10', 10, 100, 'VWCE'),
      buy('t2', 'Fondos', '2026-02-15', 10, 120, 'VWCE'),
      buy('t3', 'Oro', '2026-02-20', 4, 50, 'SGLN'),
      buy('t4', 'Oro', '2026-05-02', 2, 60, 'SGLN'),
    ],
    snapshots: {},
    contributions: [],
    instruments: [],
    quotes: {},
    ...overrides,
  })
}

describe('buildInvestmentDashboardViewModel · posiciones', () => {
  it('lista las posiciones con valor, de mayor a menor, con peso sobre el total', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    expect(vm.accounts.map((position) => position.id)).toEqual(['fondos', 'oro'])
    const [fondos, oro] = vm.accounts
    expect(fondos).toMatchObject({ name: 'Fondos', value: 2200, invested: 2200, gain: 0 })
    expect(oro).toMatchObject({ name: 'Oro', value: 200, invested: 200 })
    expect(fondos.weight).toBeCloseTo((2200 / 2400) * 100)
    expect(oro.weight).toBeCloseTo((200 / 2400) * 100)
  })

  it('atribuye el movimiento por instrumentId aunque la categoría no coincida', () => {
    const state = portfolio({
      investmentAssets: [{ id: 'acciones', name: 'Acciones', openingBalance: 0 }],
      instruments: [
        {
          id: 'inst-aapl',
          investmentAssetId: 'acciones',
          type: 'stock',
          symbol: 'AAPL',
          market: 'NASDAQ',
          currency: 'USD',
          provider: 'yahoo',
          active: true,
        },
      ],
      transactions: [
        {
          ...buy('t-aapl', 'AAPL', '2026-01-10', 1, 100, 'AAPL'),
          instrumentId: 'inst-aapl',
        },
      ],
    })

    const vm = buildInvestmentDashboardViewModel(state, 2, 'simple')
    expect(vm.accounts).toHaveLength(1)
    expect(vm.accounts[0]).toMatchObject({
      id: 'acciones',
      value: 100,
      invested: 100,
    })
    expect(vm.positions.map((position) => [position.accountId, position.symbol])).toEqual([
      ['acciones', 'AAPL'],
    ])
  })

  it('omite los activos sin valor en el mes', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 1, 'simple')

    expect(vm.accounts.map((position) => position.id)).toEqual(['fondos'])
    expect(vm.accounts[0].weight).toBe(100)
  })

  it('calcula resultado y rentabilidad con el valor del snapshot', () => {
    const vm = buildInvestmentDashboardViewModel(
      portfolio({
        snapshots: {
          '3': { month: 3, accounts: {}, investments: { fondos: 2420 }, liabilities: {} },
        },
      }),
      3,
      'simple',
    )

    const fondos = vm.accounts.find((position) => position.id === 'fondos')!
    expect(fondos.gain).toBe(220)
    expect(fondos.returnPct).toBeCloseTo(10)
    expect(vm.gain).toBe(vm.portfolioValue - vm.investedCapital)
  })

  it('expone las posiciones de cada cuenta junto a las cuentas', () => {
    const state = portfolio({
      instruments: [
        {
          id: 'i-vwce',
          investmentAssetId: 'fondos',
          type: 'etf',
          symbol: 'VWCE',
          market: 'XETRA',
          currency: 'EUR',
          provider: 'yahoo',
          active: true,
        },
      ],
    })

    const vm = buildInvestmentDashboardViewModel(state, 3, 'simple')

    expect(
      vm.positions.map((position) => [position.accountId, position.symbol, position.units]),
    ).toEqual([['fondos', 'VWCE', 20]])
  })
})

describe('buildInvestmentDashboardViewModel · series', () => {
  it('da una etiqueta por punto: el inicio de año y cada mes hasta el de análisis', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    expect(vm.chartLabels).toEqual(['01/01', 'ENERO', 'FEBRERO', 'MARZO'])
  })

  it('en € compara el valor de cartera con el capital aportado', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    expect(vm.valueSeries.map((series) => series.name)).toEqual([
      'Valor de cartera',
      'Capital aportado',
    ])
    expect(vm.valueSeries[1]).toMatchObject({ values: [0, 1000, 2400, 2400], dashed: true })
  })

  it('cada posición trae su serie de rentabilidad con los mismos puntos', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    expect(vm.accounts[0].series.values).toHaveLength(vm.chartLabels.length)
  })

  it('fecha el valor de la cartera al cierre del mes de análisis', () => {
    expect(buildInvestmentDashboardViewModel(portfolio(), 2, 'simple').asOf).toBe('2026-02-28')
  })
})

describe('buildInvestmentDashboardViewModel · TWR', () => {
  it('en TWR el valor de cartera suma la liquidez de las cuentas elegidas, y solo de esas', () => {
    const state = portfolio({
      accounts: [
        { id: 'broker', name: 'Broker', openingBalance: 0 },
        { id: 'cash', name: 'Liquidez', openingBalance: 500 },
        { id: 'otra', name: 'Otra', openingBalance: 900 },
      ],
      twrLiquidityAccountIds: ['cash'],
    })
    const simple = buildInvestmentDashboardViewModel(state, 3, 'simple').portfolioValue
    const twr = buildInvestmentDashboardViewModel(state, 3, 'twr').portfolioValue
    expect(twr - simple).toBeCloseTo(500, 2)
  })
})
