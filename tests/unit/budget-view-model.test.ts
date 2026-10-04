import { describe, expect, it } from 'vitest'

import {
  buildBudgetViewModel,
  cellBar,
  defaultWindowStart,
  moveWindow,
} from '../../src/domain/budget/view-model'
import type { State } from '../../src/scripts/types'

/** 3 October 2026: January to September are closed, October is in progress. */
const NOW = new Date(2026, 9, 3)
const OCTOBER = 9

function plan(value: number, overrides: Record<number, number> = {}): number[] {
  return Array.from({ length: 12 }, (_, month) => overrides[month] ?? value)
}

function tx(type: string, category: string, month: number, amount: number) {
  return { id: `${type}-${category}-${month}-${amount}`, type, category, month, amount }
}

function state(overrides: Partial<State> = {}): State {
  return {
    year: 2026,
    incomeCategories: ['Nómina'],
    expenseCategories: ['Comida', 'Ocio'],
    investmentCategories: ['Fondos'],
    categoryEmojis: {},
    budget: {
      income: { Nómina: plan(2000) },
      expense: { Comida: plan(300), Ocio: plan(100, { 11: 250 }) },
      investment: { Fondos: plan(200) },
    },
    transactions: [
      tx('expense', 'Comida', 0, 280),
      tx('expense', 'Comida', 1, 320.5),
      tx('expense', 'Comida', OCTOBER, 40),
      tx('expense', 'Ocio', 0, 150),
      tx('income', 'Nómina', 0, 1900),
    ],
    ...overrides,
  } as unknown as State
}

describe('buildBudgetViewModel', () => {
  it('marks the months before today closed, today current and the rest planned', () => {
    const vm = buildBudgetViewModel(state(), NOW)

    expect(vm.currentMonth).toBe(OCTOBER)
    const statuses = vm.types.expense.rows[0].cells.map((cell) => cell.status)
    expect(statuses.slice(0, 9)).toEqual(Array(9).fill('closed'))
    expect(statuses[OCTOBER]).toBe('current')
    expect(statuses.slice(10)).toEqual(['planned', 'planned'])
  })

  it('treats a past year as closed and a future one as planned', () => {
    expect(buildBudgetViewModel(state({ year: 2025 }), NOW).currentMonth).toBe(12)
    expect(buildBudgetViewModel(state({ year: 2027 }), NOW).currentMonth).toBe(-1)
  })

  it('sums what was recorded per month and leaves the months to come without an actual', () => {
    const [comida] = buildBudgetViewModel(state(), NOW).types.expense.rows

    expect(comida.cells[0]).toMatchObject({ planned: 300, actual: 280, diff: -20, tone: 'gain' })
    expect(comida.cells[1]).toMatchObject({ actual: 320.5, diff: 20.5, tone: 'loss' })
    expect(comida.cells[2]).toMatchObject({ actual: 0, diff: -300 })
    expect(comida.cells[OCTOBER]).toMatchObject({ actual: 40, diff: null, tone: null })
    expect(comida.cells[11]).toMatchObject({ actual: null, diff: null })
  })

  it('reads a shortfall as the bad side for income', () => {
    const [nomina] = buildBudgetViewModel(state(), NOW).types.income.rows

    expect(nomina.cells[0]).toMatchObject({ diff: -100, tone: 'loss' })
  })

  it('totals the year per category and accumulates the deviation over closed months only', () => {
    const [comida, ocio] = buildBudgetViewModel(state(), NOW).types.expense.rows

    expect(comida).toMatchObject({ plannedTotal: 3600, actualTotal: 640.5 })
    // Nine closed months of 300 planned against 600,5 recorded.
    expect(comida.diffToDate).toBe(-2099.5)
    expect(comida.tone).toBe('gain')
    expect(ocio.plannedTotal).toBe(1350)
  })

  it('adds every category into the type totals, month by month', () => {
    const expense = buildBudgetViewModel(state(), NOW).types.expense

    expect(expense.totals.cells[0]).toMatchObject({ planned: 400, actual: 430, diff: 30 })
    expect(expense.totals.plannedTotal).toBe(4950)
    expect(expense.totals.actualTotal).toBe(790.5)
    expect(expense.remaining).toBe(4159.5)
    expect(expense.count).toBe(2)
  })

  it('leaves out movements of a category that is not in the list', () => {
    const vm = buildBudgetViewModel(
      state({
        expenseCategories: ['Comida'],
        transactions: [tx('expense', 'Viajes', 0, 90)] as unknown as State['transactions'],
      }),
      NOW,
    )

    expect(vm.types.expense.rows.map((row) => row.category)).toEqual(['Comida'])
    expect(vm.types.expense.totals.cells[0].actual).toBe(0)
  })
})

describe('budget window', () => {
  it('opens on the month before, the current one and the next', () => {
    expect(defaultWindowStart(3, OCTOBER)).toBe(8)
    expect(defaultWindowStart(6, OCTOBER)).toBe(5)
    expect(defaultWindowStart(12, OCTOBER)).toBe(0)
  })

  it('stays inside the year at both ends', () => {
    expect(defaultWindowStart(3, 0)).toBe(0)
    expect(defaultWindowStart(3, 11)).toBe(9)
    expect(defaultWindowStart(3, 12)).toBe(9)
    expect(defaultWindowStart(6, -1)).toBe(0)
  })

  it('moves one month at a time and stops at the edges', () => {
    expect(moveWindow(8, 3, -1)).toBe(7)
    expect(moveWindow(8, 3, 1)).toBe(9)
    expect(moveWindow(0, 3, -1)).toBe(0)
    expect(moveWindow(9, 3, 1)).toBe(9)
  })
})

describe('cellBar', () => {
  it('splits what is within the budget from the excess, against the row scale', () => {
    expect(cellBar({ planned: 100, actual: 150 }, 200)).toEqual({ fill: 50, over: 25, plan: 50 })
    expect(cellBar({ planned: 100, actual: 40 }, 200)).toEqual({ fill: 20, over: 0, plan: 50 })
  })

  it('draws nothing for a month still to come', () => {
    expect(cellBar({ planned: 100, actual: null }, 200)).toEqual({ fill: 0, over: 0, plan: 50 })
  })

  it('survives a row with nothing planned or recorded', () => {
    expect(cellBar({ planned: 0, actual: 0 }, 0)).toEqual({ fill: 0, over: 0, plan: 0 })
  })
})
