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
        quantity: '5 × 130,00 €',
        total: '+649,00 €',
        declared: true,
      },
      expect.objectContaining({ id: 't2', side: 'buy', fee: 'Sin comisión', total: '1.200,00 €' }),
      expect.objectContaining({
        id: 't1',
        fee: 'Comisión 1,50 €',
        quantity: '10 × 100,00 €',
        declared: false,
      }),
    ])
  })

  it('cuenta las operaciones y señala las que faltan por declarar', () => {
    const detail = detailOf('fondos')
    expect(detail?.count).toBe('3 operaciones · 1 sin declarar')
    expect(detail?.undeclared).toEqual(['t1'])
  })

  it('un movimiento sin títulos se lista con su descripción', () => {
    const row = detailOf('oro')?.years[0].rows[0]
    expect(row).toMatchObject({ operation: 'Aportación oro', side: null, quantity: '', fee: '' })
    expect(detailOf('oro')?.count).toBe('1 operación')
  })

  it('resume en cifras el precio medio, el de hoy, la primera compra, las operaciones y las comisiones', () => {
    const facts = detailOf('fondos')?.facts
    expect(facts?.map((fact) => [fact.label, fact.value])).toEqual([
      ['Precio medio de compra', '110,00 €'],
      ['Precio hoy', '132,00 €'],
      ['Primera compra', '10 ene 2026'],
      ['Operaciones', '2 compras · 1 venta'],
      ['Comisiones pagadas', '2,50 €'],
      ['Declaración', '1 sin declarar'],
    ])
    expect(facts?.[1]).toMatchObject({ note: '+20,0 % sobre tu media', tone: 'gain' })
  })

  it('con todo declarado, la declaración está al día', () => {
    const state = portfolio()
    state.transactions.forEach((tx) => (tx.declared = true))
    expect(detailOf('fondos', state)?.facts.at(-1)).toMatchObject({
      label: 'Declaración',
      value: 'Al día',
    })
  })
})

describe('assetDetail · gráfica de precio', () => {
  it('dibuja un punto por operación y el de hoy, en orden de fecha', () => {
    const chart = detailOf('fondos')?.chart
    expect(chart?.points.map((point) => [point.date, point.price, point.operation])).toEqual([
      ['10 ene 2026', '100,00 €', 'buy'],
      ['15 feb 2026', '120,00 €', 'buy'],
      ['5 mar 2026', '130,00 €', 'sell'],
      ['Hoy', '132,00 €', null],
    ])
    expect(chart?.points[0].left).toBeLessThan(chart?.points[3].left ?? 0)
  })

  it('compara cada precio con la media de compra', () => {
    const [first, , , today] = detailOf('fondos')?.chart?.points ?? []
    expect(first.delta).toBe('−9,1 % frente a tu media')
    expect(first.deltaTone).toBe('loss')
    expect(today.delta).toBe('+20,0 % frente a tu media')
    expect(today.note).toBe('')
  })

  it('marca la operación sin declarar y deja el precio medio como línea', () => {
    const chart = detailOf('fondos')?.chart
    expect(chart?.points[0].declared).toBe(false)
    expect(chart?.points[1].declared).toBe(true)
    expect(chart?.average).not.toBeNull()
  })

  it('sin operaciones con precio no hay gráfica', () => {
    expect(detailOf('oro')?.chart).toBeNull()
  })

  it('el texto alternativo cuenta el recorrido del precio', () => {
    expect(detailOf('fondos')?.chart?.label).toBe(
      'Precio de Fondos (10 ene 2026 – hoy): 100,00 € en la primera operación y 132,00 € hoy, con 3 operaciones marcadas.',
    )
  })
})
