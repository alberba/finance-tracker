import { describe, expect, it } from 'vitest'

import { buildBudgetViewModel } from '../../src/domain/budget/view-model'
import type { Month } from '../../src/lib/month'
import {
  aggregate,
  barOf,
  buildGrid,
  buildMonthList,
  defaultCursor,
  deviationSpan,
  deviationTone,
  isChange,
  moveCursor,
  navigation,
  parseDraft,
  planFigures,
  planKicker,
  planReference,
  remainingText,
  windowMonths,
  yearSummary,
} from '../../src/neon/sections/budget/year-view-model'
import type { State } from '../../src/scripts/types'

/** 3 October 2026: January to September are closed, October is in progress. */
const NOW = new Date(2026, 9, 3)

function plan(value: number, overrides: Record<number, number> = {}): number[] {
  return Array.from({ length: 12 }, (_, month) => overrides[month] ?? value)
}

function tx(type: string, category: string, month: number, amount: number) {
  return { id: `${type}-${category}-${month}-${amount}`, type, category, month, amount }
}

function state(): State {
  return {
    year: 2026,
    incomeCategories: ['Nómina'],
    expenseCategories: ['Comida', 'Ocio'],
    savingCategories: [],
    investmentCategories: [],
    categoryEmojis: {},
    budget: {
      income: { Nómina: plan(2000) },
      expense: { Comida: plan(300), Ocio: plan(100) },
      saving: {},
      investment: {},
    },
    transactions: [
      tx('expense', 'Comida', 1, 280),
      tx('expense', 'Comida', 2, 320.5),
      tx('expense', 'Comida', 10, 150),
      tx('expense', 'Ocio', 1, 100),
      tx('income', 'Nómina', 1, 1900),
    ],
  } as unknown as State
}

/** Money formats with no-break spaces; compare with plain ones. */
const plain = (text: string) => text.replace(/\u00a0/g, ' ')

const vm = buildBudgetViewModel(state(), NOW)
const expense = vm.types.expense

describe('deviationTone', () => {
  it('paints spending over the plan as a loss and nothing for under it', () => {
    expect(deviationTone('expense', 300, 320, true)).toBe('loss')
    expect(deviationTone('expense', 300, 280, true)).toBeNull()
    expect(deviationTone('investment', 300, 320, true)).toBe('loss')
  })

  it('paints income over the plan as a gain and short of it as a loss only once closed', () => {
    expect(deviationTone('income', 2000, 2100, false)).toBe('gain')
    expect(deviationTone('income', 2000, 1900, true)).toBe('loss')
    expect(deviationTone('income', 2000, 1900, false)).toBeNull()
  })

  it('ignores a difference below a cent', () => {
    expect(deviationTone('expense', 300, 300.004, true)).toBeNull()
  })
})

describe('windows and navigation', () => {
  it('starts the quarter the month before the current one and the month on the current', () => {
    expect(defaultCursor(10)).toEqual({ quarter: 9, month: 10 })
    expect(defaultCursor(1)).toEqual({ quarter: 1, month: 1 })
    expect(defaultCursor(13)).toEqual({ quarter: 10, month: 12 })
    expect(defaultCursor(0)).toEqual({ quarter: 1, month: 1 })
  })

  it('lists the months of each view', () => {
    const cursor = { quarter: 9 as Month, month: 10 as Month }
    expect(windowMonths('year', cursor)).toHaveLength(12)
    expect(windowMonths('quarter', cursor)).toEqual([9, 10, 11])
    expect(windowMonths('month', cursor)).toEqual([10])
  })

  it('slides the quarter and the month inside the year', () => {
    expect(moveCursor('quarter', { quarter: 10, month: 1 }, 1).quarter).toBe(10)
    expect(moveCursor('quarter', { quarter: 1, month: 1 }, -1).quarter).toBe(1)
    expect(moveCursor('quarter', { quarter: 5, month: 1 }, 1).quarter).toBe(6)
    expect(moveCursor('month', { quarter: 1, month: 12 }, 1).month).toBe(12)
    expect(moveCursor('month', { quarter: 1, month: 10 }, -1).month).toBe(9)
    const year = { quarter: 3 as Month, month: 3 as Month }
    expect(moveCursor('year', year, 1)).toBe(year)
  })

  it('labels the view and its arrows', () => {
    const cursor = { quarter: 9 as Month, month: 10 as Month }
    expect(navigation('year', cursor, 2026)).toMatchObject({ label: 'Todo 2026', arrows: false })
    expect(navigation('quarter', cursor, 2026)).toMatchObject({
      label: 'Sep – Nov 2026',
      prevLabel: 'Trimestre anterior',
      nextLabel: 'Trimestre siguiente',
      canPrev: true,
      canNext: true,
    })
    expect(navigation('month', cursor, 2026).label).toBe('Octubre 2026')
  })

  it('disables the arrow at the edge of the year', () => {
    expect(navigation('month', { quarter: 1, month: 1 }, 2026)).toMatchObject({
      canPrev: false,
      canNext: true,
    })
    expect(navigation('quarter', { quarter: 10, month: 1 }, 2026)).toMatchObject({
      canPrev: true,
      canNext: false,
    })
  })
})

describe('yearSummary', () => {
  it('reads the planned, recorded, remaining and deviation figures of the year', () => {
    const figures = yearSummary('expense', expense, 2026, vm.currentMonth)

    expect(figures.map((figure) => figure.label)).toEqual([
      'Presupuestado en 2026',
      'Real hasta hoy',
      'Queda por gastar',
      'Desvío hasta sep.',
    ])
    expect(figures[0].value).toContain('4.800,00')
    expect(figures[0].note).toBe('unos 400 € al mes')
    expect(figures[1].value).toContain('850,50')
    expect(figures[2].value).toContain('3.949,50')
    // Comida: -20 +20.5; Ocio: 0 on Jan, -100 on the other closed months.
    expect(figures[3].value).toContain('−')
    expect(figures[3].tone).toBeNull()
  })

  it('says there is no deviation before a month closes', () => {
    const january = buildBudgetViewModel(state(), new Date(2026, 0, 5))
    const figures = yearSummary('expense', january.types.expense, 2026, january.currentMonth)
    expect(figures[3]).toMatchObject({ label: 'Desvío', value: '—', tone: null })
  })

  it('names the span of a past year and of a month in progress', () => {
    expect(deviationSpan(10)).toBe('hasta sep.')
    expect(deviationSpan(13)).toBe('en el año')
    expect(deviationSpan(1)).toBe('')
    expect(deviationSpan(0)).toBe('')
  })

  it('colours the income deviation when it falls short', () => {
    const figures = yearSummary('income', vm.types.income, 2026, vm.currentMonth)
    expect(figures[3].tone).toBe('loss')
    expect(figures[2].label).toBe('Falta por ingresar')
  })
})

describe('buildGrid', () => {
  const grid = buildGrid('expense', expense, windowMonths('year', defaultCursor(10)), 10)
  const comida = grid.rows[0]

  it('has a row per category and a cell per month', () => {
    expect(grid.rows.map((row) => row.category)).toEqual(['Comida', 'Ocio'])
    expect(comida.cells).toHaveLength(12)
  })

  it('judges closed months, shows the current one and leaves the rest without data', () => {
    expect(comida.cells[0]).toMatchObject({ actual: 280, plan: 300, tone: null, current: false })
    expect(comida.cells[1]).toMatchObject({ actual: 320.5, tone: 'loss' })
    expect(comida.cells[9]).toMatchObject({ actual: 150, current: true })
    expect(comida.cells[10]).toMatchObject({ actual: null, tone: null })
  })

  it('gives each cell a title and the accessible name of its plan button', () => {
    expect(plain(comida.cells[1].title)).toBe(
      'Febrero: 320,50 € de 300,00 € presupuestados · +20,50 €',
    )
    expect(plain(comida.cells[10].title)).toBe(
      'Noviembre: sin movimientos, 300,00 € presupuestados',
    )
    expect(comida.cells[1].editLabel).toBe('Presupuesto de Comida en febrero')
  })

  it('adds a row up over the months that have data, against the plan of those months', () => {
    expect(comida.total).toMatchObject({ actual: 750.5, planDone: 3000, planAll: 3600 })
    expect(grid.total.actual).toBe(850.5)
  })

  it('totals every column and marks the current one', () => {
    const october = grid.monthTotals[9]
    expect(october).toMatchObject({ month: 10, current: true, actual: 150, planAll: 400 })
    expect(grid.monthTotals[10].actual).toBeNull()
  })

  it('says how far each month of a quarter is', () => {
    const quarter = buildGrid('expense', expense, [9, 10, 11], 10)
    expect(quarter.statuses).toEqual({ 9: 'cerrado', 10: 'en curso', 11: 'previsto' })
    expect(quarter.rows[0].cells).toHaveLength(3)
  })
})

describe('aggregate', () => {
  it('has no recorded amount when no cell has data', () => {
    const none = aggregate('expense', [{ planned: 100, actual: null }], true)
    expect(none).toEqual({ actual: null, planDone: 0, planAll: 100, tone: null })
  })

  it('leaves out of the compared plan the months without data', () => {
    const sum = aggregate(
      'expense',
      [
        { planned: 100, actual: 130 },
        { planned: 100, actual: null },
      ],
      true,
    )
    expect(sum).toMatchObject({ actual: 130, planDone: 100, planAll: 200, tone: 'loss' })
  })
})

describe('bars', () => {
  it('draws within-budget fill, the excess and the plan tick over a scale a fifth above the larger', () => {
    expect(barOf(100, 60)).toEqual({ fill: 50, over: 0, tick: 83.3 })
    const over = barOf(100, 150)
    expect(over.fill + over.over).toBeCloseTo(83.3, 0)
    expect(over.tick).toBeLessThan(over.fill + over.over)
  })

  it('is empty without a plan or data', () => {
    expect(barOf(0, null)).toEqual({ fill: 0, over: 0, tick: 0 })
  })
})

describe('buildMonthList', () => {
  const list = buildMonthList('expense', expense, 2, 10)

  it('orders the categories by how much of the budget they used', () => {
    expect(list.lines.map((line) => line.category)).toEqual(['Comida', 'Ocio'])
    const october = buildMonthList('expense', expense, 10, 10)
    expect(october.lines.map((line) => line.category)).toEqual(['Comida', 'Ocio'])
    const november = buildMonthList('expense', expense, 11, 10)
    expect(november.lines.every((line) => line.ratio === -1)).toBe(true)
  })

  it('says what is left or over per category and in total', () => {
    expect(list.lines[0].remaining).toBe('Pasado 21 €')
    expect(list.lines[0].remainingTone).toBe('loss')
    expect(list.lines[1].remaining).toBe('Queda 100 €')
    expect(list.total).toMatchObject({ actual: 320.5, plan: 400, remaining: 'Queda 80 €' })
  })

  it('words the remainder by the type', () => {
    expect(remainingText('income', 300)).toBe('Falta 300 €')
    expect(remainingText('income', -50)).toBe('Sobra 50 €')
    expect(remainingText('expense', -50)).toBe('Pasado 50 €')
    expect(remainingText('expense', 0.001)).toBe('Sin diferencia')
  })
})

describe('plan panel', () => {
  const row = expense.rows[0]
  const saved = row.cells.map((cell) => String(cell.planned).replace('.', ','))

  it('titles the kicker with the year and the type', () => {
    expect(planKicker(2026, 'saving')).toBe('Plan de 2026 · Ahorro')
  })

  it('shows the saved plan, what was recorded and the deviation of the closed months', () => {
    const figures = planFigures('expense', row, saved, 10)
    expect(figures.planned).toContain('3.600,00')
    expect(figures.actual).toContain('750,50')
    expect(figures.deviationLabel).toBe('Desvío hasta sep.')
    // Nine closed months planned at 300, 600,50 recorded.
    expect(plain(figures.deviation)).toBe('−2.099,50 €')
    expect(figures.tone).toBeNull()
  })

  it('follows what is typed and keeps the saved amount of a field that does not parse', () => {
    const typed = [...saved]
    typed[0] = '400'
    typed[1] = 'abc'
    const figures = planFigures('expense', row, typed, 10)
    expect(figures.planned).toContain('3.700,00')
    expect(plain(figures.deviation)).toBe('−2.199,50 €')
    expect(figures.tone).toBeNull()
  })

  it('has no deviation before a month closes', () => {
    const figures = planFigures('expense', row, saved, 1)
    expect(figures).toMatchObject({ deviationLabel: 'Desvío', deviation: '—', tone: null })
  })

  it('references each month by what was recorded', () => {
    expect(plain(planReference(row.cells[0]))).toBe('real 280,00 €')
    expect(plain(planReference(row.cells[9]))).toBe('en curso · real 150,00 €')
    expect(planReference(row.cells[10])).toBe('sin movimientos')
  })
})

describe('drafts', () => {
  it('parses Spanish and plain decimals and takes a blank as zero', () => {
    expect(parseDraft('64,32')).toBe(64.32)
    expect(parseDraft('1.250,5')).toBe(1250.5)
    expect(parseDraft('123.45')).toBe(123.45)
    expect(parseDraft('  ')).toBe(0)
  })

  it('refuses what is not a non-negative number', () => {
    expect(parseDraft('abc')).toBeNull()
    expect(parseDraft('-5')).toBeNull()
  })

  it('tells a change from the saved amount by a cent', () => {
    expect(isChange(300, 300.004)).toBe(false)
    expect(isChange(300, 310)).toBe(true)
  })
})
