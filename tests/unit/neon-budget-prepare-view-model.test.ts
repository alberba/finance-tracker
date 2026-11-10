import { describe, expect, it } from 'vitest'

import { buildBudgetViewModel } from '../../src/domain/budget/view-model'
import {
  barLabel,
  buildPrepareGroups,
  cellsToWrite,
  defaultStart,
  freeFigures,
  prepareKicker,
  prepareTarget,
  repeatLabel,
  rowNote,
  savedSummary,
  seedValue,
  showUseAverage,
  split,
  startOptions,
  stepValue,
} from '../../src/neon/sections/budget/prepare-view-model'
import type { State } from '../../src/scripts/types'

/** 3 October 2026: January to September are closed, October is in progress. */
const NOW = new Date(2026, 9, 3)

function plan(value: number, overrides: Record<number, number> = {}): number[] {
  return Array.from({ length: 12 }, (_, month) => overrides[month] ?? value)
}

function tx(type: string, category: string, month: number, amount: number) {
  return { id: `${type}-${category}-${month}-${amount}`, type, category, month, amount }
}

function state(novemberPlanned: boolean, categories: Partial<State> = {}): State {
  const nov: Record<number, number> = novemberPlanned ? {} : { 10: 0 }
  return {
    year: 2026,
    incomeCategories: ['Nómina'],
    expenseCategories: ['Comida'],
    savingCategories: ['Hucha'],
    investmentCategories: ['Fondos'],
    categoryEmojis: {},
    budget: {
      income: { Nómina: plan(2000, nov) },
      expense: { Comida: plan(300, { 9: 310, ...nov }) },
      saving: { Hucha: plan(150, nov) },
      investment: { Fondos: plan(200, nov) },
    },
    transactions: [
      tx('expense', 'Comida', 1, 200),
      tx('expense', 'Comida', 2, 400),
      tx('expense', 'Comida', 10, 50),
      tx('income', 'Nómina', 1, 1900),
    ],
    ...categories,
  } as unknown as State
}

const view = buildBudgetViewModel(state(false), NOW)
const target = 11
const groups = buildPrepareGroups(view, target)
const comida = groups[1].rows[0]

describe('prepareTarget', () => {
  it('is the month after the one in progress, only inside the year', () => {
    expect(prepareTarget(view)).toBe(11)
    expect(prepareTarget(buildBudgetViewModel(state(false), new Date(2026, 11, 5)))).toBeNull()
    expect(prepareTarget(buildBudgetViewModel(state(false), new Date(2027, 2, 5)))).toBeNull()
    expect(prepareTarget(buildBudgetViewModel(state(false), new Date(2025, 2, 5)))).toBeNull()
  })

  it('words the kicker', () => {
    expect(prepareKicker(2026, 11)).toBe('Planificación · noviembre 2026')
  })
})

describe('groups and rows', () => {
  it('maps each budget type to a group in screen order', () => {
    expect(groups.map((g) => g.label)).toEqual(['Lo que entra', 'Gastos', 'Ahorro', 'Inversión'])
    expect(groups[0].income).toBe(true)
  })

  it('averages the actuals of the closed months and keeps the current plan', () => {
    expect(comida.average).toBeCloseTo(66.67, 2)
    expect(comida.closedCount).toBe(9)
    expect(comida.current).toBe(310)
    expect(comida.stored).toBe(0)
  })

  it('keeps an empty group for a type without categories', () => {
    const empty = buildBudgetViewModel(
      state(false, { savingCategories: [] } as Partial<State>),
      NOW,
    )
    expect(buildPrepareGroups(empty, 11)[2].rows).toEqual([])
  })
})

describe('start modes', () => {
  it('starts from the average, or from what is saved when the month has a plan', () => {
    expect(defaultStart(groups)).toBe('average')
    const saved = buildPrepareGroups(buildBudgetViewModel(state(true), NOW), 11)
    expect(defaultStart(saved)).toBe('saved')
  })

  it('offers «Lo guardado» only with a saved plan', () => {
    expect(startOptions(10, false).map((o) => o.label)).toEqual(['Media', 'Octubre', 'En blanco'])
    expect(startOptions(10, true)[0]).toEqual({ mode: 'saved', label: 'Lo guardado' })
  })

  it('seeds each mode', () => {
    expect(seedValue(comida, 'average')).toBeCloseTo(66.67, 2)
    expect(seedValue(comida, 'current')).toBe(310)
    expect(seedValue(comida, 'blank')).toBe(0)
    expect(seedValue(comida, 'saved')).toBe(0)
  })

  it('falls back to the current plan without closed months', () => {
    const january = buildPrepareGroups(buildBudgetViewModel(state(false), new Date(2026, 0, 5)), 2)
    expect(january[1].rows[0].average).toBeNull()
    expect(seedValue(january[1].rows[0], 'average')).toBe(300)
  })
})

describe('row text and steps', () => {
  it('writes the note with the average and the current month', () => {
    expect(rowNote(comida, 'Octubre')).toMatch(/^Media 9 meses: .*66,67.* · octubre: .*310,00/)
  })

  it('shows only the current month without an average', () => {
    expect(rowNote({ ...comida, average: null, closedCount: 0 }, 'Octubre')).toMatch(
      /^Octubre: .*310,00/,
    )
  })

  it('offers «Usar media» while the value differs from the average', () => {
    expect(showUseAverage(comida, 310)).toBe(true)
    expect(showUseAverage(comida, 66.67)).toBe(false)
    expect(showUseAverage({ ...comida, average: null }, 310)).toBe(false)
  })

  it('steps by 5 under 100 and by 10 above, 50 for income and investment, never below 0', () => {
    expect(stepValue('expense', 60, 1)).toBe(65)
    expect(stepValue('expense', 100, 1)).toBe(110)
    expect(stepValue('income', 2000, -1)).toBe(1950)
    expect(stepValue('expense', 3, -1)).toBe(0)
  })
})

describe('split', () => {
  const values = {
    'income:Nómina': 2000,
    'expense:Comida': 500,
    'saving:Hucha': 300,
    'investment:Fondos': 200,
  }

  it('totals the groups and the share of the income', () => {
    const figure = split(groups, values)
    expect(figure.income).toBe(2000)
    expect(figure.assigned).toBe(1000)
    expect(figure.free).toBe(1000)
    expect(figure.groups.map((g) => g.share)).toEqual([100, 25, 15, 10])
  })

  it('has no shares without income', () => {
    expect(split(groups, {}).groups.every((g) => g.share === null)).toBe(true)
  })

  it('labels the free figure', () => {
    expect(freeFigures(1000).label).toBe('Sin destino')
    expect(freeFigures(0).note).toBe('Cada euro que entra tiene destino.')
    expect(freeFigures(-20)).toMatchObject({ label: 'Te pasas', tone: 'over' })
  })

  it('describes the bar', () => {
    expect(barLabel(groups, split(groups, values))).toBe(
      'Reparto: Gastos 25 %, Ahorro 15 %, Inversión 10 %, sin destino 50 %',
    )
  })
})

describe('what is saved', () => {
  const values = {
    'income:Nómina': 2000,
    'expense:Comida': 320,
    'saving:Hucha': 0,
    'investment:Fondos': 0,
  }

  it('writes only the target month when it differs from the stored plan', () => {
    expect(cellsToWrite(view, groups, values, 11, false)).toEqual([
      { type: 'income', category: 'Nómina', month: 11, value: 2000 },
      { type: 'expense', category: 'Comida', month: 11, value: 320 },
    ])
  })

  it('repeats through December where the plan differs', () => {
    const writes = cellsToWrite(view, groups, values, 11, true)
    expect(writes.filter((w) => w.category === 'Comida').map((w) => w.month)).toEqual([11, 12])
    // Hucha is 150 in December, so 0 is written there but not in November (already 0).
    expect(writes.filter((w) => w.category === 'Hucha').map((w) => w.month)).toEqual([12])
  })

  it('writes nothing when nothing changed', () => {
    const same = {
      'income:Nómina': 0,
      'expense:Comida': 0,
      'saving:Hucha': 0,
      'investment:Fondos': 0,
    }
    expect(cellsToWrite(view, groups, same, 11, false)).toEqual([])
  })

  it('words the repeat option and the confirmation', () => {
    expect(repeatLabel(11)).toBe('Repetir este reparto en diciembre')
    expect(repeatLabel(8)).toBe('Repetir este reparto hasta diciembre')
    expect(repeatLabel(12)).toBeNull()
    expect(savedSummary(11, false)).toBe('Guardado para noviembre')
    expect(savedSummary(11, true)).toBe('Guardado para noviembre y diciembre')
    expect(savedSummary(8, true)).toBe('Guardado de agosto a diciembre')
  })
})
