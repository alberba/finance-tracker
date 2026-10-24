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

    expect(vm.positions.map((position) => position.id)).toEqual(['fondos', 'oro'])
    const [fondos, oro] = vm.positions
    expect(fondos).toMatchObject({ name: 'Fondos', value: 2200, invested: 2200, gain: 0 })
    expect(oro).toMatchObject({ name: 'Oro', value: 200, invested: 200 })
    expect(fondos.weight).toBeCloseTo((2200 / 2400) * 100)
    expect(oro.weight).toBeCloseTo((200 / 2400) * 100)
  })

  it('omite los activos sin valor en el mes', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 1, 'simple')

    expect(vm.positions.map((position) => position.id)).toEqual(['fondos'])
    expect(vm.positions[0].weight).toBe(100)
  })

  it('calcula resultado y rentabilidad con el valor del snapshot', () => {
    const vm = buildInvestmentDashboardViewModel(
      portfolio({ snapshots: { '3': { month: 3, accounts: {}, investments: { fondos: 2420 }, liabilities: {} } } }),
      3,
      'simple',
    )

    const fondos = vm.positions.find((position) => position.id === 'fondos')!
    expect(fondos.gain).toBe(220)
    expect(fondos.returnPct).toBeCloseTo(10)
    expect(vm.gain).toBe(vm.portfolioValue - vm.investedCapital)
  })

  it('da el detalle de cada posición: instrumento, títulos, precio medio y último movimiento', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 7, 'simple')

    const oro = vm.positions.find((position) => position.id === 'oro')!
    expect(oro.symbol).toBe('SGLN')
    expect(oro.units).toBe(6)
    expect(oro.averagePrice).toBeCloseTo((4 * 50 + 2 * 60) / 6)
    expect(oro.lastMovementDate).toBe('2026-05-02')
  })

  it('solo cuenta los movimientos hasta el mes de análisis', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    const oro = vm.positions.find((position) => position.id === 'oro')!
    expect(oro.units).toBe(4)
    expect(oro.lastMovementDate).toBe('2026-02-20')
  })

  it('prefiere el símbolo del instrumento vinculado al activo', () => {
    const vm = buildInvestmentDashboardViewModel(
      portfolio({
        instruments: [
          {
            id: 'i-oro',
            investmentAssetId: 'oro',
            type: 'etf',
            symbol: 'SGLN.L',
            market: 'LSE',
            currency: 'EUR',
            provider: 'twelve-data',
            active: true,
          },
        ],
      }),
      7,
      'simple',
    )

    expect(vm.positions.find((position) => position.id === 'oro')!.symbol).toBe('SGLN.L')
  })

  it('las ventas restan títulos y no cuentan para el precio medio', () => {
    const state = portfolio()
    state.transactions.push({
      ...state.transactions[0],
      id: 't5',
      date: '2026-03-01',
      month: 3,
      side: 'sell',
      units: 5,
      unitPrice: 150,
      amount: -750,
    })

    const fondos = buildInvestmentDashboardViewModel(state, 3, 'simple').positions.find(
      (position) => position.id === 'fondos',
    )!
    expect(fondos.units).toBe(15)
    expect(fondos.averagePrice).toBeCloseTo(110)
  })

  it('deja sin detalle las posiciones sin operaciones con títulos', () => {
    const vm = buildInvestmentDashboardViewModel(
      portfolio({
        transactions: [],
        investmentAssets: [{ id: 'fondos', name: 'Fondos', openingBalance: 1000 }],
      }),
      1,
      'simple',
    )

    expect(vm.positions[0]).toMatchObject({
      symbol: null,
      units: null,
      averagePrice: null,
      lastMovementDate: null,
    })
  })

  it('asigna a cada posición un color de la paleta de series', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    expect(vm.positions.map((position) => position.color)).toEqual([
      'var(--chart-series-1)',
      'var(--chart-series-2)',
    ])
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

  it('en % da una sola serie de rentabilidad acumulada', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    expect(vm.percentSeries).toHaveLength(1)
    expect(vm.percentSeries[0].name).toBe('Cartera Total')
    expect(vm.percentSeries[0].values).toHaveLength(4)
  })

  it('cada posición trae su serie de rentabilidad con los mismos puntos', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'simple')

    expect(vm.positions[0].series.values).toHaveLength(vm.chartLabels.length)
  })

  it('fecha el valor de la cartera al cierre del mes de análisis', () => {
    expect(buildInvestmentDashboardViewModel(portfolio(), 2, 'simple').asOf).toBe('2026-02-28')
  })
})
