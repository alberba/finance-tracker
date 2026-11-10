import { describe, expect, it } from 'vitest'

import { buildBudgetViewModel } from '../../src/domain/budget/view-model'
import type { Month } from '../../src/lib/month'
import {
  averageLabel,
  categoryAria,
  categoryDetail,
  categoryStatus,
  chartLabel,
  dailyCumulative,
  daysText,
  deltaText,
  detailReading,
  monthCategories,
  monthHero,
  monthKicker,
  monthPosition,
  spendChart,
  unbudgetedCategories,
} from '../../src/neon/sections/budget/month-view-model'
import type { State, Transaction } from '../../src/scripts/types'

/** 10 October 2026: January to September are closed, October is in progress. */
const NOW = new Date(2026, 9, 10)

function plan(value: number): number[] {
  return Array.from({ length: 12 }, () => value)
}

function tx(date: string, category: string, amount: number, type = 'expense'): Transaction {
  return {
    id: `${date}-${category}-${amount}`,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: type as Transaction['type'],
    accountId: 'nomina',
    category,
    description: category,
    amount,
  }
}

function state(transactions: Transaction[], budget: Record<string, number[]> = {}): State {
  return {
    year: 2026,
    incomeCategories: ['Nómina'],
    expenseCategories: ['Súper', 'Ocio', 'Salud', 'Regalos'],
    savingCategories: [],
    investmentCategories: [],
    categoryEmojis: {},
    budget: {
      income: {},
      expense: { Súper: plan(400), Ocio: plan(200), Salud: plan(60), ...budget },
      saving: {},
      investment: {},
    },
    transactions,
  } as unknown as State
}

const OCTOBER = [
  tx('2026-10-02', 'Súper', 120),
  tx('2026-10-05', 'Súper', 94.8),
  tx('2026-10-03', 'Ocio', 210),
  tx('2026-10-04', 'Regalos', 35),
  tx('2026-10-06', 'Nómina', 3000, 'income'),
]
const SEPTEMBER = [
  tx('2026-09-01', 'Súper', 100),
  tx('2026-09-10', 'Súper', 50),
  tx('2026-09-28', 'Ocio', 230),
  tx('2026-08-15', 'Súper', 380),
]

function setup(transactions = [...OCTOBER, ...SEPTEMBER]) {
  const view = buildBudgetViewModel(state(transactions), NOW)
  const position = monthPosition(view, NOW)
  return { view, position, rows: view.types.expense.rows }
}

describe('monthPosition', () => {
  it('is today in the budget year', () => {
    const { position } = setup()
    expect(position).toEqual({ year: 2026, month: 10, day: 10, days: 31 })
    expect(monthKicker(position)).toBe('Octubre 2026 · día 10 de 31')
  })

  it('is the end of December for a past year and before January for a future one', () => {
    const past = buildBudgetViewModel({ ...state([]), year: 2025 } as State, NOW)
    expect(monthPosition(past, NOW)).toEqual({ year: 2025, month: 12, day: 31, days: 31 })
    const future = buildBudgetViewModel({ ...state([]), year: 2027 } as State, NOW)
    expect(monthPosition(future, NOW)).toEqual({ year: 2027, month: 1, day: 0, days: 31 })
  })
})

describe('categoryStatus', () => {
  it('reads over and exhausted budgets before the pace', () => {
    expect(categoryStatus(100, 120, 10, 31)).toBe('over')
    expect(categoryStatus(100, 100, 10, 31)).toBe('spent')
  })

  it('compares the spending with an even spread of the budget', () => {
    // 10 of 31 days: an even pace is 32,26\u00a0€ of 100\u00a0€.
    expect(categoryStatus(100, 40, 10, 31)).toBe('ahead')
    expect(categoryStatus(100, 32, 10, 31)).toBe('on-pace')
    expect(categoryStatus(100, 20, 10, 31)).toBe('slack')
  })
})

describe('monthCategories', () => {
  it('lists the categories with a budget this month, with what is left and the pace', () => {
    const { rows, position } = setup()
    const categories = monthCategories(rows, position)
    expect(categories.map((c) => c.category)).toEqual(['Súper', 'Ocio', 'Salud'])
    expect(categories[0]).toMatchObject({
      plan: 400,
      spent: 214.8,
      left: 185.2,
      status: 'ahead',
      fill: 53.7,
      tick: 32.3,
    })
    expect(categories[1]).toMatchObject({ left: -10, status: 'over', fill: 100 })
    expect(categories[2]).toMatchObject({ spent: 0, left: 60, status: 'slack' })
  })

  it('names the categories with spending and no budget apart', () => {
    const { rows, position } = setup()
    expect(unbudgetedCategories(rows, position)).toEqual(['Regalos'])
  })

  it('reads each card for a screen reader', () => {
    const { rows, position } = setup()
    const [super_, ocio] = monthCategories(rows, position)
    expect(categoryAria(super_)).toBe('Súper: 185,20\u00a0€ libres. Ver mes a mes')
    expect(categoryAria(ocio)).toBe('Ocio: 10,00\u00a0€ por encima. Ver mes a mes')
  })
})

describe('monthHero', () => {
  it('adds up what is still free, leaving out the budgets already exceeded', () => {
    const { rows, position } = setup()
    const hero = monthHero(monthCategories(rows, position), position)
    expect(hero).toEqual({
      free: 245.2,
      spent: 424.8,
      planned: 660,
      daysLeft: 21,
      perDay: 11.68,
      perWeek: 81.73,
    })
    expect(daysText(hero.daysLeft)).toBe('21 días')
    expect(daysText(1)).toBe('1 día')
  })

  it('has no daily figure once the month is over', () => {
    const position = { year: 2025, month: 12 as Month, day: 31, days: 31 }
    expect(monthHero([], position)).toMatchObject({ daysLeft: 0, perDay: null, perWeek: null })
  })
})

describe('spendChart', () => {
  it('adds up the expenses of a month day by day', () => {
    expect(dailyCumulative(OCTOBER, 2026, 10, 6)).toEqual([0, 120, 330, 365, 459.8, 459.8])
  })

  it('compares the month with the one before at the same day', () => {
    const { position } = setup()
    const chart = spendChart([...OCTOBER, ...SEPTEMBER], position)
    expect(chart.total).toBe(459.8)
    expect(chart.points).toHaveLength(10)
    expect(chart.previous).toMatchObject({ name: 'septiembre', atDay: 150, total: 380 })
    expect(chart.previous?.points).toHaveLength(30)
    expect(chart.delta).toBe(309.8)
    expect(deltaText(chart.delta ?? 0, 'septiembre', 10)).toBe(
      '+309,80\u00a0€ más que septiembre a día 10',
    )
    expect(deltaText(-5, 'septiembre', 10)).toBe('−5,00\u00a0€ menos que septiembre a día 10')
    expect(chart.ticks.map((t) => [t.day, t.today])).toEqual([
      [1, false],
      [10, true],
      [20, false],
      [30, false],
    ])
    expect(chartLabel(chart, 10)).toBe(
      'Gasto acumulado día a día: octubre 459,80\u00a0€ a día 10, septiembre 150,00\u00a0€ a la misma fecha y 380,00\u00a0€ en total',
    )
  })

  it('has no comparison in January', () => {
    const chart = spendChart([], { year: 2026, month: 1, day: 5, days: 31 })
    expect(chart.previous).toBeNull()
    expect(chart.delta).toBeNull()
    expect(chartLabel(chart, 5)).toBe('Gasto acumulado día a día: enero 0,00\u00a0€ a día 5')
  })
})

describe('categoryDetail', () => {
  it('sums up the closed months and lists the year newest first', () => {
    const { rows, position } = setup()
    const detail = categoryDetail(
      rows.find((r) => r.category === 'Súper')!,
      position,
    )
    expect(detail).toMatchObject({
      plan: 400,
      closedCount: 9,
      overCount: 0,
      average: 58.89,
      yearToDate: 744.8,
      reading: 'No se ha pasado ningún mes.',
    })
    expect(detail.rows.map((r) => r.name)).toEqual([
      'Octubre',
      'Septiembre',
      'Agosto',
      'Julio',
      'Junio',
      'Mayo',
      'Abril',
      'Marzo',
      'Febrero',
      'Enero',
    ])
    expect(detail.rows[0]).toMatchObject({
      sub: 'en curso · día 10 de 31',
      dev: 'quedan 185,20\u00a0€',
    })
    expect(detail.rows[1]).toMatchObject({ dev: '250,00\u00a0€ por debajo', over: false })
    expect(detail.bars.map((b) => b.kind).slice(8)).toEqual(['normal', 'current', 'empty', 'empty'])
  })

  it('marks the closed months over budget', () => {
    const { rows, position } = setup()
    const detail = categoryDetail(
      rows.find((r) => r.category === 'Ocio')!,
      position,
    )
    expect(detail.overCount).toBe(1)
    expect(detail.rows[1]).toMatchObject({
      name: 'Septiembre',
      dev: '+30,00\u00a0€ de más',
      over: true,
    })
    expect(detail.rows[0].dev).toBe('10,00\u00a0€ por encima')
    expect(detail.bars[8].kind).toBe('over')
  })

  it('reads how often the budget fell short', () => {
    expect(detailReading(0, 0)).toBe('')
    expect(detailReading(1, 9)).toBe('Se pasó un mes.')
    expect(detailReading(4, 9)).toBe('Se pasó 4 de 9 meses; quizá el presupuesto se queda corto.')
  })

  it('names the span of the average', () => {
    expect(averageLabel(0)).toBe('Media')
    expect(averageLabel(1)).toBe('Media de enero')
    expect(averageLabel(9)).toBe('Media ene–sep')
  })
})

describe('spendChart scale', () => {
  it('fits a longer month before inside the chart', () => {
    const chart = spendChart([tx('2026-10-31', 'Súper', 10)], {
      year: 2026,
      month: 11,
      day: 9,
      days: 30,
    })
    expect(Math.max(...(chart.previous?.points ?? []).map((p) => p.x))).toBe(300)
    expect(chart.ticks.at(-1)).toMatchObject({ day: 30 })
  })
})
