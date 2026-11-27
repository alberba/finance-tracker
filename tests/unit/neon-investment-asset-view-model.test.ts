import { describe, expect, it } from 'vitest'

import { buildInvestmentDashboardViewModel } from '../../src/domain/investment/view-model'
import type { Month } from '../../src/lib/month'
import { assetDetail } from '../../src/neon/sections/investment/asset-view-model'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'

function operation(
  id: string,
  category: string,
  date: string,
  side: 'buy' | 'sell',
  units: number,
  unitPrice: number,
  { fee = 0, declared = true }: { fee?: number; declared?: boolean } = {},
) {
  const gross = units * unitPrice
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'investment',
    accountId: 'broker',
    category,
    description: `${side === 'buy' ? 'Compra' : 'Venta'} ${units} VWCE`,
    amount: side === 'buy' ? gross + fee : gross - fee,
    side,
    units,
    unitPrice,
    symbol: 'VWCE',
    fee,
    declared,
  }
}

/**
 * Fondos (VWCE): 10 titles at 100 € in January (1,50 € fee) and 10 at 120 € in
 * February, 5 sold at 130 € in March. The March close values the 15 left at
 * 1.980 €, 132 € each. Oro has no operation with units.
 */
function portfolio(overrides: Record<string, unknown> = {}): State {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
    investmentAssets: [
      { id: 'fondos', name: 'Fondos', openingBalance: 0 },
      { id: 'oro', name: 'Oro', openingBalance: 0 },
    ],
    liabilities: [],
    transactions: [
      operation('t1', 'Fondos', '2026-01-10', 'buy', 10, 100, { fee: 1.5, declared: false }),
      operation('t2', 'Fondos', '2026-02-15', 'buy', 10, 120),
      operation('t3', 'Fondos', '2026-03-05', 'sell', 5, 130, { fee: 1 }),
      {
        id: 't4',
        date: '2026-02-20',
        month: 2,
        type: 'investment',
        accountId: 'broker',
        category: 'Oro',
        description: 'Aportación oro',
        amount: 200,
      },
    ],
    snapshots: { '3': { month: 3, investments: { fondos: 1980, oro: 180 }, accounts: {} } },
    contributions: [],
    instruments: [],
    quotes: {},
    ...overrides,
  })
}

const detailOf = (id: string, state = portfolio()) =>
  assetDetail(state, buildInvestmentDashboardViewModel(state, 3, 'simple'), id)

describe('assetDetail', () => {
  it('titula con el símbolo y da las cuatro cifras del resumen', () => {
    const detail = detailOf('fondos')
    expect(detail?.symbol).toBe('VWCE')
    expect(detail?.name).toBe('Fondos')
    expect(detail?.figures.map(({ key, label, value }) => ({ key, label, value }))).toEqual([
      { key: 'value', label: 'Vale hoy', value: '1.980,00 €' },
      { key: 'result', label: 'Resultado', value: expect.stringMatching(/^[+−-]/) },
      { key: 'invested', label: 'Has puesto', value: expect.stringContaining('€') },
      { key: 'weight', label: 'Peso en la cartera', value: expect.stringContaining('%') },
    ])
  })

  it('un activo sin símbolo se titula con su nombre', () => {
    expect(detailOf('oro')?.symbol).toBe('Oro')
  })

  it('un activo que ya no está en la cartera no tiene detalle', () => {
    expect(detailOf('nada')).toBeNull()
  })

  it('agrupa las operaciones por año, de la más reciente a la más antigua', () => {
    const detail = detailOf('fondos')
    expect(detail?.years).toHaveLength(1)
    expect(detail?.years[0].year).toBe('2026')
    expect(detail?.years[0].sum).toBe('Comprado 2.201,50 € · Vendido +649,00 €')
    expect(detail?.years[0].rows).toEqual([
      {
        id: 't3',
        day: '5 mar',
        side: 'sell',
        operation: 'Venta',
        fee: 'Comisión 1,00 €',
        feeCharged: true,
        quantity: '5 × 130,00 €',
        total: '+649,00 €',
      },
      expect.objectContaining({
        id: 't2',
        side: 'buy',
        fee: 'Sin comisión',
        feeCharged: false,
        total: '1.200,00 €',
      }),
      expect.objectContaining({
        id: 't1',
        fee: 'Comisión 1,50 €',
        quantity: '10 × 100,00 €',
      }),
    ])
  })

  it('cuenta las operaciones', () => {
    expect(detailOf('fondos')?.count).toBe('3 operaciones')
  })

  it('un movimiento sin títulos se lista con su descripción', () => {
    const row = detailOf('oro')?.years[0].rows[0]
    expect(row).toMatchObject({ operation: 'Aportación oro', side: null, quantity: '', fee: '' })
    expect(detailOf('oro')?.count).toBe('1 operación')
  })

  it('resume en cifras el precio medio, la primera compra y las comisiones', () => {
    // El precio de hoy no se repite: lo lee la gráfica.
    const facts = detailOf('fondos')?.facts
    expect(facts?.map((fact) => [fact.label, fact.value])).toEqual([
      ['Precio medio de compra', '110,00 €'],
      ['Primera compra', '10 ene 2026'],
      ['Comisiones pagadas', '2,50 €'],
    ])
  })

  it('el resultado lleva su porcentaje sobre lo puesto', () => {
    const result = detailOf('fondos')?.figures.find((figure) => figure.key === 'result')
    expect(result).toMatchObject({ tone: 'loss' })
    expect(result?.note).toMatch(/^−30,5\s%$/)
  })
})

describe('assetDetail · gráfica de precio', () => {
  it('dibuja un punto por operación, en orden de fecha y sin punto de hoy', () => {
    const chart = detailOf('fondos')?.chart
    expect(chart?.points.map((point) => [point.date, point.price, point.operation])).toEqual([
      ['10 ene 2026', '100,00 €', 'buy'],
      ['15 feb 2026', '120,00 €', 'buy'],
      ['5 mar 2026', '130,00 €', 'sell'],
    ])
    expect(chart?.points[0].left).toBeLessThan(chart?.points[2].left ?? 0)
  })

  it('compara cada precio con la media de compra', () => {
    const [first, , sale] = detailOf('fondos')?.chart?.points ?? []
    expect(first.delta).toBe('−9,1 % frente a tu media')
    expect(first.deltaTone).toBe('loss')
    expect(sale.delta).toBe('+18,2 % frente a tu media')
    expect(sale.note).toBe('Venta')
  })

  it('deja el precio medio como línea', () => {
    const chart = detailOf('fondos')?.chart
    expect(chart?.average).not.toBeNull()
  })

  it('sin operaciones con precio no hay gráfica', () => {
    expect(detailOf('oro')?.chart).toBeNull()
  })

  it('el texto alternativo cuenta el recorrido del precio', () => {
    expect(detailOf('fondos')?.chart?.label).toBe(
      'Precio de Fondos (10 ene 2026 – 5 mar 2026): 100,00 € en la primera operación y 130,00 € en la última, con 3 operaciones marcadas.',
    )
  })
})

describe('assetDetail · móvil', () => {
  it('cuenta los títulos que se tienen', () => {
    expect(detailOf('fondos')?.units).toEqual({ count: '15', word: 'títulos' })
  })

  it('un activo sin títulos no los cuenta', () => {
    expect(detailOf('oro')?.units).toBeNull()
  })

  it('resume tu posición con el precio medio, el resultado y lo que has puesto', () => {
    const position = detailOf('fondos')?.position
    expect(position?.rows.map(({ label, value, note }) => [label, value, note])).toEqual([
      ['Precio medio', '110,00\u00a0€', ''],
      ['Resultado', '−870,50\u00a0€', '−30,5\u00a0%'],
      ['Has puesto', '2.850,50\u00a0€', ''],
    ])
    expect(position?.rows[1].tone).toBe('loss')
  })

  it('el anillo enseña lo que vale el activo y su peso en la cartera', () => {
    expect(detailOf('fondos')?.position.ring).toEqual({
      share: 91.67,
      value: '1.980\u00a0€',
      weight: '91,7\u00a0%',
      label: '1.980,00\u00a0€, el 91,7\u00a0% de la cartera',
    })
  })
})

describe('assetDetail · gráfica compacta', () => {
  const compactOf = (id: string, state = portfolio()) =>
    assetDetail(state, buildInvestmentDashboardViewModel(state, 3, 'simple'), id, {
      compact: true,
    })

  it('dibuja la gráfica a la proporción del móvil, con los mismos puntos', () => {
    const chart = compactOf('fondos')?.chart
    expect(chart?.viewBox).toBe('0 0 412 266')
    expect(chart?.points.map((point) => point.date)).toEqual([
      '10 ene 2026',
      '15 feb 2026',
      '5 mar 2026',
    ])
    for (const point of chart?.points ?? []) {
      expect(point.x).toBeGreaterThan(0)
      expect(point.x).toBeLessThan(412)
      expect(point.y).toBeLessThan(266)
    }
  })

  it('sin la opción, la gráfica sigue siendo la de escritorio', () => {
    expect(detailOf('fondos')?.chart?.viewBox).toBe('0 0 880 280')
  })
})
