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
    quotes: {},
    ...overrides,
  })
}

const detailOf = (id: string, state = portfolio()) =>
  assetDetail(state, buildInvestmentDashboardViewModel(state, 3, 'simple'), id)

describe('assetDetail', () => {
  it('titula con el nombre de la cuenta y da las cuatro cifras del resumen', () => {
    const detail = detailOf('fondos')
    expect(detail?.name).toBe('Fondos')
    expect(detail?.figures.map(({ key, label, value }) => ({ key, label, value }))).toEqual([
      { key: 'value', label: 'Vale hoy', value: '1.980,00 €' },
      { key: 'result', label: 'Resultado', value: expect.stringMatching(/^[+−-]/) },
      { key: 'invested', label: 'Has puesto', value: expect.stringContaining('€') },
      { key: 'weight', label: 'Peso en la cartera', value: expect.stringContaining('%') },
    ])
  })

  it('lista las posiciones de la cuenta con sus cifras y avisa de las que no tienen cotización', () => {
    const detail = detailOf('fondos')

    expect(detail?.positions).toEqual([
      {
        instrumentId: 'i-vwce',
        symbol: 'VWCE',
        units: '15',
        averagePrice: '110,00\u00a0€',
        value: '1.980,00\u00a0€',
        invested: '2.850,50\u00a0€',
        gain: '−870,50\u00a0€',
        ret: '−30,5\u00a0%',
        tone: 'loss',
        weight: '100,0\u00a0%',
        weightPct: 100,
        estimated: true,
        evolution: null,
      },
    ])
    expect(detail?.unpricedNote).toMatch(/^Sin cotización/)
  })

  it('una cuenta sin instrumentos no tiene posiciones ni aviso', () => {
    const detail = detailOf('oro')

    expect(detail?.positions).toEqual([])
    expect(detail?.unpricedNote).toBeNull()
  })

  it('muestra «sin instrumento» cuando la cuenta tiene capital que ninguna posición explica', () => {
    expect(detailOf('oro')?.uninstrumented).toEqual({
      value: '180,00\u00a0€',
      invested: '200,00\u00a0€',
      gain: '−20,00\u00a0€',
      ret: '−10,0\u00a0%',
      tone: 'loss',
    })
    expect(detailOf('fondos')?.uninstrumented).toBeNull()
  })

  it('una cuenta con varios instrumentos no tiene un recuento único de títulos', () => {
    const state = portfolio({
      instruments: [
        ...portfolio().instruments,
        {
          id: 'i-iwda',
          investmentAssetId: 'fondos',
          type: 'etf',
          symbol: 'IWDA',
          market: 'XETRA',
          currency: 'EUR',
          provider: 'yahoo',
          active: true,
        },
      ],
      transactions: [
        ...portfolio().transactions,
        {
          ...operation('t5', 'Fondos', '2026-03-02', 'buy', 2, 50),
          symbol: 'IWDA',
          instrumentId: 'i-iwda',
        },
      ],
    })

    const detail = detailOf('fondos', state)

    expect(detail?.positions.map((line) => line.symbol).sort()).toEqual(['IWDA', 'VWCE'])
    expect(detail?.units).toBeNull()
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
