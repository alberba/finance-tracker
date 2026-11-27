import { describe, expect, it } from 'vitest'

import type { Month } from '../../src/lib/month'
import type { State } from '../../src/scripts/types'
import {
  availableRanges,
  EVOLUTION_RANGES,
  rangeWindow,
  wealthTimeline,
  type TimelinePoint,
} from '../../src/neon/sections/wealth/evolution-range'

/** `count` months ending in November 2026, worth 100 more each month. */
function timeline(count: number): TimelinePoint[] {
  return Array.from({ length: count }, (_, index) => {
    const back = count - 1 - index
    const absolute = 2026 * 12 + 10 - back
    return {
      year: Math.floor(absolute / 12),
      month: ((absolute % 12) + 1) as Month,
      value: 1000 + index * 100,
      open: false,
    }
  })
}

describe('rangeWindow', () => {
  it('ends at the newest month and keeps the month before as its base', () => {
    const { points, base } = rangeWindow(timeline(30), '6m', 2026)
    expect(points.map((p) => p.month)).toEqual([6, 7, 8, 9, 10, 11])
    expect(base).toMatchObject({ year: 2026, month: 5 })
  })

  it('draws the year so far for «ytd», based on last December', () => {
    const { points, base } = rangeWindow(timeline(30), 'ytd', 2026)
    expect(points).toHaveLength(11)
    expect(points[0]).toMatchObject({ year: 2026, month: 1 })
    expect(base).toMatchObject({ year: 2025, month: 12 })
  })

  it('draws what there is when the range goes back further, with no base', () => {
    const { points, base } = rangeWindow(timeline(30), '5y', 2026)
    expect(points).toHaveLength(30)
    expect(base).toBeNull()
  })
})

describe('availableRanges', () => {
  it('offers only the ranges that draw more months than a shorter one', () => {
    expect([...availableRanges(timeline(11), 2026)]).toEqual(['3m', '6m', 'ytd'])
    expect([...availableRanges(timeline(30), 2026)]).toEqual(['3m', '6m', 'ytd', '1y', '2y', '3y'])
  })
})

describe('wealthTimeline', () => {
  it('is the current year alone when there is nothing earlier', () => {
    const state = {
      transactions: [],
      historicalSnapshots: {},
      accounts: [],
      investmentAssets: [],
      liabilities: [],
    } as unknown as State
    const current = [
      { month: 1 as Month, value: 10, open: false, monthChange: null, yearChange: 0 },
      { month: 2 as Month, value: 20, open: true, monthChange: 10, yearChange: 10 },
    ]
    expect(wealthTimeline(state, current, 2026)).toEqual([
      { year: 2026, month: 1, value: 10, open: false },
      { year: 2026, month: 2, value: 20, open: true },
    ])
  })
})

describe('wealthTimeline con años anteriores', () => {
  const current = [{ month: 1 as Month, value: 700, open: false, monthChange: null, yearChange: 0 }]
  const tx = (id: string, date: string, type: 'income' | 'expense', amount: number) => ({
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type,
    accountId: 'a',
    category: '',
    description: '',
    amount,
  })
  const base = {
    accounts: [{ id: 'a', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [],
    liabilities: [],
  }

  it('empieza en el primer mes con saldo y sigue con los meses del año actual', () => {
    const state = {
      ...base,
      transactions: [tx('t1', '2025-03-10', 'income', 100), tx('t2', '2025-05-02', 'expense', 40)],
      historicalSnapshots: {},
    } as unknown as State
    const points = wealthTimeline(state, current, 2026)
    expect(points[0]).toEqual({ year: 2025, month: 3, value: 100, open: false })
    expect(points.slice(0, 4).map((p) => p.value)).toEqual([100, 100, 60, 60])
    expect(points.filter((p) => p.year === 2025)).toHaveLength(10)
    expect(points.at(-1)).toEqual({ year: 2026, month: 1, value: 700, open: false })
  })

  it('toma los saldos de los cierres guardados de años sin movimientos', () => {
    const state = {
      ...base,
      transactions: [],
      historicalSnapshots: {
        2024: { 6: { month: 6, accounts: { a: 500 }, investments: {}, liabilities: {} } },
      },
    } as unknown as State
    const points = wealthTimeline(state, current, 2026)
    expect(points[0]).toEqual({ year: 2024, month: 6, value: 500, open: false })
    // 2024 desde junio (7 meses) + 2025 entero (12) + el año actual.
    expect(points).toHaveLength(7 + 12 + 1)
  })

  it('ignora los años que no son anteriores y los movimientos sin fecha válida', () => {
    const state = {
      ...base,
      transactions: [
        tx('t1', '2026-02-01', 'income', 100),
        tx('t2', '2027-02-01', 'income', 100),
        { ...tx('t3', 'sin-fecha', 'income', 100), month: 1 as Month },
      ],
      historicalSnapshots: { 2026: {}, 2030: {} },
    } as unknown as State
    expect(wealthTimeline(state, current, 2026)).toEqual([
      { year: 2026, month: 1, value: 700, open: false },
    ])
  })

  it('no dibuja nada anterior si los años pasados no tienen saldo', () => {
    const state = {
      ...base,
      transactions: [tx('t1', '2025-04-01', 'income', 100), tx('t2', '2025-04-02', 'expense', 100)],
    } as unknown as State
    const points = wealthTimeline(state, current, 2026)
    expect(points).toEqual([{ year: 2026, month: 1, value: 700, open: false }])
  })
})

describe('rangeWindow y availableRanges en los bordes', () => {
  it('no tiene base cuando el rango cubre toda la línea', () => {
    const { points, base } = rangeWindow(timeline(3), '3m', 2026)
    expect(points).toHaveLength(3)
    expect(base).toBeNull()
  })

  it('dibuja los años pedidos y deja el mes anterior como base', () => {
    const { points, base } = rangeWindow(timeline(40), '3y', 2026)
    expect(points).toHaveLength(36)
    expect(base).toMatchObject({ value: 1000 + 3 * 100 })
  })

  it('sin meses del año actual «ytd» no dibuja nada', () => {
    const past = timeline(5).map((point) => ({ ...point, year: 2025 }))
    const { points, base } = rangeWindow(past, 'ytd', 2026)
    expect(points).toEqual([])
    expect(base).toMatchObject({ value: 1400 })
  })

  it('ofrece todos los rangos cuando hay cinco años de historia', () => {
    expect([...availableRanges(timeline(70), 2026)]).toEqual([
      '3m',
      '6m',
      'ytd',
      '1y',
      '2y',
      '3y',
      '5y',
    ])
  })

  it('con una línea vacía solo ofrece el año y tres meses', () => {
    expect([...availableRanges([], 2026)]).toEqual(['3m', 'ytd'])
  })

  it('nombra cada rango con su etiqueta corta y el «ytd» sin título', () => {
    expect(EVOLUTION_RANGES.map((range) => range.short)).toEqual([
      '3M',
      '6M',
      'YTD',
      '1Y',
      '2Y',
      '3Y',
      '5Y',
    ])
    expect(EVOLUTION_RANGES.find((range) => range.value === 'ytd')?.title).toBe('')
  })
})
