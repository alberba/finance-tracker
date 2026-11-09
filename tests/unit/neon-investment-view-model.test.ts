import { describe, expect, it } from 'vitest'

import { buildInvestmentDashboardViewModel } from '../../src/domain/investment/view-model'
import type { Month } from '../../src/lib/month'
import {
  dropRows,
  feeRows,
  periodOptions,
  quoteNotice,
  maxDrawdown,
  periodFigures,
  portfolioChart,
  positionDetail,
  positionRows,
  sortLabel,
  sortPositions,
  twrSeries,
} from '../../src/neon/sections/investment/view-model'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'

function buy(
  id: string,
  category: string,
  date: string,
  units: number,
  unitPrice: number,
  symbol?: string,
  fee = 0,
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
    fee,
  }
}

/**
 * Fondos: 1.000 € in January and 1.200 € in February; Oro: 200 € in February.
 * The March close values them at 2.640 € and 180 €: 2.820 € against 2.400 €.
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
      buy('t1', 'Fondos', '2026-01-10', 10, 100, 'VWCE', 1.5),
      buy('t2', 'Fondos', '2026-02-15', 10, 120, 'VWCE'),
      buy('t3', 'Oro', '2026-02-20', 4, 50, undefined, 2),
    ],
    snapshots: { '3': { month: 3, investments: { fondos: 2640, oro: 180 }, accounts: {} } },
    contributions: [],
    instruments: [],
    quotes: {},
    ...overrides,
  })
}

const simple = (state = portfolio(), month = 3 as Month) =>
  buildInvestmentDashboardViewModel(state, month, 'simple')

describe('periodFigures', () => {
  it('en simple da la rentabilidad con la ganancia debajo, lo que vale y lo que has puesto', () => {
    expect(periodFigures(simple(), 'simple', { latest: true, twr: 0 })).toEqual([
      { key: 'return', label: 'Tu cartera', value: '+17,5 %', sub: '+420,00 €', tone: 'gain' },
      { key: 'value', label: 'Vale hoy', value: '2.820,00 €', sub: '', tone: 'neutral' },
      { key: 'invested', label: 'Has puesto', value: '2.400,00 €', sub: '', tone: 'neutral' },
    ])
  })

  it('en TWR la cifra es la TWR, sin importe debajo', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'twr')
    const [first] = periodFigures(vm, 'twr', { latest: true, twr: 20 })
    expect(first).toMatchObject({ label: 'Tu cartera · TWR', value: '+20,0\u00a0%', tone: 'gain' })
    expect(first.sub).toBe('')
  })

  it('un mes pasado dice cuándo valía, no «hoy»', () => {
    const [, value] = periodFigures(simple(), 'simple', { latest: false, twr: 0 })
    expect(value.label).toBe('Valía a 31 mar 2026')
  })

  it('una pérdida lleva el tono de pérdida y el menos tipográfico', () => {
    const state = portfolio({
      snapshots: { '3': { month: 3, investments: { fondos: 2000, oro: 100 }, accounts: {} } },
    })
    const [first] = periodFigures(simple(state), 'simple', { latest: true, twr: 0 })
    expect(first).toMatchObject({ value: '−12,5 %', sub: '−300,00 €', tone: 'loss' })
  })
})

describe('portfolioChart', () => {
  it('en simple dibuja lo que vale frente a lo que has puesto, con su cifra al final de cada línea', () => {
    const chart = portfolioChart(simple(), 'simple', [], null)
    expect(chart.lines.map((line) => [line.key, line.dashed])).toEqual([
      ['invested', true],
      ['value', false],
    ])
    expect(chart.ends.map(({ name, figure }) => [name, figure])).toEqual([
      ['Tu cartera', '2.820,00\u00a0€'],
      ['Has puesto', '2.400,00\u00a0€'],
    ])
    expect(chart.months.map((month) => month.text)).toEqual(['ene', 'feb', 'mar'])
    expect(chart.label).toBe(
      'Lo que vale tu cartera frente a lo que has puesto. A 31 mar 2026 vale 2.820,00\u00a0€.',
    )
    expect(chart.zero).toBeNull()
  })

  it('las líneas de la rejilla van en importes redondos, de abajo arriba y sin bajar de cero', () => {
    const { grid } = portfolioChart(simple(), 'simple', [], null)
    const values = grid.map((line) => line.value)
    expect(values[0]).toBeGreaterThanOrEqual(0)
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(grid.at(-1)?.text).toMatch(/^[\d.]+\u00a0€$/)
  })

  it('en TWR dibuja solo la rentabilidad acumulada, con la línea del cero', () => {
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'twr')
    const chart = portfolioChart(vm, 'twr', [0, 4, 9, 20], null)
    expect(chart.ends[0].figure).toBe('+20,0\u00a0%')
    expect(chart.lines.map((line) => line.key)).toEqual(['value'])
    expect(chart.ends).toHaveLength(1)
    expect(chart.ends[0].name).toBe('Tu cartera')
    expect(chart.zero).not.toBeNull()
    expect(chart.grid.some((line) => line.text === '0\u00a0%')).toBe(true)
  })

  it('separa las etiquetas finales cuando las líneas acaban juntas', () => {
    const state = portfolio({
      snapshots: { '3': { month: 3, investments: { fondos: 2210, oro: 200 }, accounts: {} } },
    })
    const [top, bottom] = portfolioChart(simple(state), 'simple', [], null).ends
    expect(bottom.top - top.top).toBeGreaterThanOrEqual(11)
  })
})

describe('maxDrawdown y dropRows', () => {
  // Cumulative TWR in %, one point per month close after the opening one.
  it('encuentra la peor caída de máximo a fondo y cuándo se recupera', () => {
    const drawdown = maxDrawdown([0, 10, 4, -1, 12, 13])
    expect(drawdown).toMatchObject({ peak: 1, trough: 3, recovery: 4 })
    expect(drawdown?.depth).toBeCloseTo(-0.1, 6)
  })

  it('una caída sin recuperar acaba en el último punto', () => {
    expect(maxDrawdown([0, 20, 5, 2])).toMatchObject({ peak: 1, trough: 3, recovery: null })
  })

  it('las caídas de hasta el 5 % no cuentan', () => {
    expect(maxDrawdown([0, 10, 5, 12])).toBeNull()
  })

  it('escribe la caída, lo que supuso en euros sobre el máximo y lo que tardó en recuperarse', () => {
    const drawdown = maxDrawdown([0, 10, 4, -1, 12])
    expect(dropRows(drawdown, [1000, 1100, 1040, 990, 1120])).toEqual([
      { label: 'Peor caída', value: '−10,0\u00a0%', tone: 'loss' },
      { label: 'En euros', value: '−110,00\u00a0€', tone: 'loss' },
      { label: 'Recuperación', value: '3 meses', tone: 'neutral' },
    ])
  })

  it('sin recuperar, o sin caídas, lo dice', () => {
    const rows = dropRows(maxDrawdown([0, 20, 5]), [1000, 1200, 1050])
    expect(rows[2]).toEqual({ label: 'Recuperación', value: 'Sin recuperar', tone: 'neutral' })
    expect(dropRows(null, [])).toEqual([
      { label: 'Sin caídas de más del 5 %', value: '—', tone: 'neutral' },
    ])
  })
})

describe('positionRows y sortPositions', () => {
  it('cada posición trae títulos y precio, peso, valor, resultado y su evolución en el periodo', () => {
    const [fondos, oro] = positionRows(portfolio(), simple(), 3)
    expect(fondos).toMatchObject({
      id: 'fondos',
      name: 'Fondos',
      symbol: 'VWCE',
      units: '20',
      price: 'a 132,00\u00a0€',
      weight: '93,6\u00a0%',
      value: '2.640,00\u00a0€',
      gain: '+440,00\u00a0€',
      ret: '+20,0\u00a0%',
      tone: 'gain',
      change: '+20,0\u00a0%',
      changeTone: 'gain',
      openLabel: 'Ver Fondos',
      sparkLabel: 'Fondos: +20,0\u00a0% en el periodo',
    })
    expect(oro).toMatchObject({ symbol: null, gain: '−20,00\u00a0€', tone: 'loss' })
    expect(fondos.spark.match(/[ML]/g)).toHaveLength(4)
  })

  it('la evolución del periodo descuenta lo aportado y parte de lo que valía al empezar', () => {
    const state = portfolio({
      investmentAssets: [{ id: 'fondos', name: 'Fondos', openingBalance: 1000 }],
      transactions: [buy('t1', 'Fondos', '2026-02-10', 5, 100, 'VWCE')],
      snapshots: { '3': { month: 3, investments: { fondos: 1650 }, accounts: {} } },
    })
    const [fondos] = positionRows(state, simple(state), 3)
    // 1.000 € at the start plus 500 € put in: 1.500 € that became 1.650 €.
    expect(fondos.change).toBe('+10,0\u00a0%')
  })

  it('ordena por peso, ganancia o cambio, en los dos sentidos', () => {
    const rows = positionRows(portfolio(), simple(), 3)
    expect(sortPositions(rows, 'gain', 'asc').map((row) => row.id)).toEqual(['oro', 'fondos'])
    expect(sortPositions(rows, 'weight', 'desc').map((row) => row.id)).toEqual(['fondos', 'oro'])
    expect(sortLabel('change', 'asc')).toBe('% cambio · menor a mayor')
  })
})

describe('feeRows', () => {
  it('suma las comisiones del año hasta el mes y las compara con lo aportado', () => {
    expect(feeRows(portfolio(), 3, 2400)).toEqual([
      { label: 'Pagadas en 2026', value: '3,50\u00a0€', tone: 'neutral' },
      { label: 'Sobre lo aportado', value: '0,15\u00a0%', tone: 'neutral' },
    ])
  })

  it('no cuenta las de meses posteriores ni las de otro año', () => {
    const state = portfolio({
      transactions: [
        buy('a', 'Fondos', '2026-01-10', 1, 100, 'VWCE', 1),
        buy('b', 'Fondos', '2026-05-10', 1, 100, 'VWCE', 4),
        buy('c', 'Fondos', '2025-01-10', 1, 100, 'VWCE', 8),
      ],
    })
    expect(feeRows(state, 3, 0)[0].value).toBe('1,00\u00a0€')
    expect(feeRows(state, 3, 0)[1].value).toBe('—')
  })
})

describe('quoteNotice', () => {
  const at = (status: 'fresh' | 'stale') => ({
    status,
    label: '',
    tone: 'gain' as const,
    latest: '2026-10-09T15:45:00.000Z',
  })

  it('con todo al día, solo dice de cuándo es el último precio', () => {
    expect(quoteNotice(at('fresh'), 'Europe/Madrid')).toEqual({
      late: false,
      text: '9 oct, 17:45',
      title: 'Cotizaciones del 9 oct, 17:45',
    })
  })

  it('con alguna atrasada, avisa de que se usa el último precio válido', () => {
    expect(quoteNotice(at('stale'), 'Europe/Madrid')).toEqual({
      late: true,
      text: 'Cotizaciones retrasadas · último precio del 9 oct, 17:45',
      title: 'Alguna cotización llega con retraso: se muestra el último precio válido',
    })
  })

  it('sin cotizaciones no hay nada que decir', () => {
    expect(quoteNotice(null)).toBeNull()
  })
})

describe('periodOptions', () => {
  it('en el año en curso llega hasta el mes de hoy', () => {
    const options = periodOptions(2026, new Date(2026, 2, 20))
    expect(options.map((option) => option.label)).toEqual(['Enero', 'Febrero', 'Marzo'])
    expect(options.at(-1)).toEqual({ value: 3, label: 'Marzo', latest: true })
  })

  it('un año cerrado ofrece los doce meses', () => {
    const options = periodOptions(2025, new Date(2026, 2, 20))
    expect(options).toHaveLength(12)
    expect(options.at(-1)?.latest).toBe(true)
  })
})

describe('positionDetail', () => {
  it('reúne las cifras de la posición y sus operaciones, de la más reciente a la más antigua', () => {
    const vm = simple()
    const detail = positionDetail(portfolio(), vm, 'fondos')
    expect(detail?.figures).toEqual([
      { label: 'Valor', value: '2.640,00\u00a0€', tone: 'neutral' },
      { label: 'Resultado', value: '+440,00\u00a0€ · +20,0\u00a0%', tone: 'gain' },
      { label: 'Títulos', value: '20', tone: 'neutral' },
      { label: 'Precio medio de compra', value: '110,00\u00a0€', tone: 'neutral' },
      { label: 'Invertido', value: '2.200,00\u00a0€', tone: 'neutral' },
      { label: 'Peso en la cartera', value: '93,6\u00a0%', tone: 'neutral' },
    ])
    expect(detail?.movements).toEqual([
      { id: 't2', title: 'Compra · 10 títulos', meta: '15 feb 2026', amount: '1.200,00\u00a0€' },
      {
        id: 't1',
        title: 'Compra · 10 títulos',
        meta: '10 ene 2026 · comisión 1,50\u00a0€',
        amount: '1.000,00\u00a0€',
      },
    ])
  })

  it('una posición que ya no está no tiene detalle', () => {
    expect(positionDetail(portfolio(), simple(), 'nada')).toBeNull()
  })
})

describe('twrSeries', () => {
  // Fondos is worth 1.000 € at the January close and 1.200 € at the March
  // one, with nothing put in: +20 % by March. February has no close.
  const closes = () =>
    portfolio({
      snapshots: {
        '1': { month: 1, investments: { fondos: 1000, oro: 0 }, accounts: {} },
        '3': { month: 3, investments: { fondos: 1200, oro: 0 }, accounts: {} },
      },
    })

  it('da la TWR acumulada en cada cierre y arrastra la última a los meses sin cierre', () => {
    const series = twrSeries(closes(), 3)
    expect(series).toHaveLength(4)
    expect(series[0]).toBe(0)
    expect(series[1]).toBeCloseTo(0, 6)
    expect(series[2]).toBeCloseTo(0, 6)
    expect(series[3]).toBeCloseTo(20, 6)
  })

  it('no mira más allá del mes de análisis', () => {
    expect(twrSeries(closes(), 2).at(-1)).toBeCloseTo(0, 6)
  })
})

describe('el gráfico y la peor caída en euros', () => {
  it('en euros no marca la caída: solo tiene sentido sobre la TWR', () => {
    const drawdown = { peak: 1, trough: 2, recovery: null, depth: -0.2 }
    expect(portfolioChart(simple(), 'simple', [], drawdown).drop).toBeNull()
    const vm = buildInvestmentDashboardViewModel(portfolio(), 3, 'twr')
    expect(portfolioChart(vm, 'twr', [0, 10, -12, -5], drawdown).drop?.text).toBe('−20,0\u00a0%')
  })
})
