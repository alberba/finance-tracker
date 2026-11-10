import { describe, expect, it } from 'vitest'

import { buildBudgetViewModel } from '../../src/domain/budget/view-model'
import {
  applyPlan,
  applyRange,
  applyRangeProse,
  closeVerdict,
  decisionAmount,
  reviewCategories,
  reviewChanges,
  reviewPosition,
  reviewStrip,
  reviewTotals,
  suggest,
  suggestionLine,
  type Decision,
} from '../../src/neon/sections/budget/review-view-model'
import { formatMoney } from '../../src/lib/format'
import type { State } from '../../src/scripts/types'

/** 3 October 2026: January to September are closed. */
const NOW = new Date(2026, 9, 3)

function tx(category: string, month: number, amount: number) {
  return { id: `${category}-${month}`, type: 'expense', category, month, amount }
}

function build(now = NOW, year = 2026) {
  const state = {
    year,
    incomeCategories: [],
    expenseCategories: ['Casa', 'Súper', 'Salud', 'Sin plan'],
    savingCategories: [],
    investmentCategories: [],
    categoryEmojis: {},
    budget: {
      expense: {
        Casa: Array(12).fill(650),
        Súper: Array(12).fill(400),
        Salud: Array(12).fill(60),
      },
    },
    transactions: [
      ...Array.from({ length: 9 }, (_, i) => tx('Casa', i + 1, i === 2 ? 708 : 650)),
      ...Array.from({ length: 9 }, (_, i) => tx('Súper', i + 1, i < 5 ? 500 : 450)),
      ...Array.from({ length: 9 }, (_, i) => tx('Salud', i + 1, 18.45)),
    ],
  } as unknown as State
  return buildBudgetViewModel(state, now)
}

describe('reviewPosition', () => {
  it('reviews the month before the current one and applies from the current one', () => {
    expect(reviewPosition(build())).toEqual({ year: 2026, closed: 9, applyFrom: 10 })
  })

  it('has nothing to review in January or in a future year', () => {
    expect(reviewPosition(build(new Date(2026, 0, 10)))).toBeNull()
    expect(reviewPosition(build(NOW, 2027))).toBeNull()
  })

  it('reviews December of a past year with no month left to apply to', () => {
    expect(reviewPosition(build(new Date(2027, 2, 1)))).toEqual({
      year: 2026,
      closed: 12,
      applyFrom: null,
    })
  })

  it('names the apply range', () => {
    expect(applyRange(10)).toBe('octubre–diciembre')
    expect(applyRange(12)).toBe('diciembre')
    expect(applyRangeProse(10)).toBe('octubre a diciembre')
  })
})

describe('reviewCategories', () => {
  const view = build()
  const position = reviewPosition(view)!
  const categories = reviewCategories(view.types.expense.rows, position)

  it('keeps the categories with a budget in the closed month', () => {
    expect(categories.map((c) => c.category)).toEqual(['Casa', 'Súper', 'Salud'])
  })

  it('reads the closed month against its budget', () => {
    const casa = categories[0]
    expect(casa).toMatchObject({ plan: 650, actual: 650, diff: 0, overBudget: false })
    expect(casa.deviation).toBe('Justo en el presupuesto')
    expect(casa.bars).toHaveLength(9)
    expect(casa.insight).toMatch(/^Por encima 1 de 9 meses\. Media: /)
  })

  it('words an under-spent month as spare money', () => {
    expect(categories[2].deviation).toMatch(/de sobra$/)
  })

  it('suggests raising when the average is above the budget, with a stepped amount', () => {
    const suggestion = categories[1].suggestion
    expect(suggestion.mode).toBe('up')
    expect(suggestion.amount).toBe(480)
    expect(suggestion.text).toMatch(/^Sugerencia: subir a 480 €/)
    expect(categories[1].defaultUp).toBe(480)
    expect(categories[1].defaultDown).toBe(380)
  })

  it('suggests lowering when the average is far below, with the small step', () => {
    expect(categories[2].suggestion).toMatchObject({ mode: 'down', amount: 20 })
    expect(categories[2].step).toBe(5)
    expect(categories[2].defaultDown).toBe(20)
    expect(categories[2].defaultUp).toBe(70)
  })

  it('suggests keeping when the average is within the band', () => {
    expect(categories[0].suggestion.mode).toBe('keep')
    expect(categories[0].suggestion.text).toMatch(/^Sugerencia: mantener\./)
  })
})

describe('suggest', () => {
  it('keeps at exactly +5 % and 80 %', () => {
    expect(suggest(100, 105, 0).mode).toBe('keep')
    expect(suggest(100, 80, 0).mode).toBe('keep')
    expect(suggest(100, 105.5, 0).mode).toBe('up')
  })

  it('never goes below zero', () => {
    expect(suggest(60, 0, 0)).toMatchObject({ mode: 'down', amount: 0 })
  })
})

describe('decisions', () => {
  const view = build()
  const categories = reviewCategories(view.types.expense.rows, reviewPosition(view)!)
  const [casa, supermarket] = categories

  it('takes the typed amount, or the default when it is not a number', () => {
    expect(decisionAmount(supermarket, { mode: 'up', draft: '450,5' })).toBe(450.5)
    expect(decisionAmount(supermarket, { mode: 'up', draft: 'abc' })).toBe(480)
    expect(decisionAmount(supermarket, { mode: 'keep', draft: '999' })).toBe(400)
    expect(decisionAmount(supermarket, undefined)).toBe(400)
  })

  it('lists only the categories whose budget changes and totals the plan', () => {
    const decisions: Record<string, Decision> = {
      Casa: { mode: 'keep', draft: '650' },
      Súper: { mode: 'up', draft: '450' },
    }
    const changes = reviewChanges(categories, decisions)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ category: 'Súper', before: 400, after: 450 })
    expect(reviewTotals(categories, decisions)).toEqual({
      reviewed: 2,
      total: 3,
      planBefore: 1110,
      planAfter: 1160,
    })
    expect(casa.category).toBe('Casa')
  })
})

describe('reviewStrip', () => {
  it('computes the month in figures', () => {
    const view = build()
    const categories = reviewCategories(view.types.expense.rows, reviewPosition(view)!)
    const strip = reviewStrip(categories, 9)
    expect(strip.map((k) => k.label)).toEqual([
      'Gastado en septiembre',
      'Presupuesto',
      'Diferencia',
      'Se pasaron',
    ])
    expect(strip[3]).toMatchObject({ value: '1 de 3', note: 'Súper' })
    expect(strip[2].loss).toBe(true)
  })
})

describe('applyPlan', () => {
  it('writes the new amount from the apply month through December, keeping earlier months', () => {
    const view = build()
    const rows = view.types.expense.rows
    const categories = reviewCategories(rows, reviewPosition(view)!)
    const changes = reviewChanges(categories, { Súper: { mode: 'up', draft: '450' } })
    const [write] = applyPlan(rows, changes, 10)
    expect(write.category).toBe('Súper')
    expect(write.before).toEqual(Array(12).fill(400))
    expect(write.after).toEqual([...Array(9).fill(400), 450, 450, 450])
  })
})

describe('the close card', () => {
  const view = build()
  const position = reviewPosition(view)!
  const categories = reviewCategories(view.types.expense.rows, position)

  it('says how the closed month ended against its budget', () => {
    // Súper spent 50 over, Salud 41.55 under: 8.45 over in all.
    expect(closeVerdict(categories, 'Septiembre')).toBe(
      `Septiembre cerró ${formatMoney(8.45)} por encima del presupuesto`,
    )
    expect(closeVerdict(categories.slice(0, 1), 'Septiembre')).toBe(
      'Septiembre cerró justo en el presupuesto',
    )
    expect(closeVerdict([categories[2]], 'Septiembre')).toBe(
      `Septiembre cerró ${formatMoney(41.55)} por debajo del presupuesto`,
    )
  })

  it('lists the budget each suggestion would change, and only those', () => {
    expect(suggestionLine(categories)).toBe('Súper: 400 → 480 € · Salud: 60 → 20 €')
    expect(suggestionLine(categories.slice(0, 1))).toBe('')
  })

  it('spells out two and counts the rest', () => {
    const [, souper, salud] = categories
    expect(suggestionLine([souper, salud, souper, salud])).toBe(
      'Súper: 400 → 480 € · Salud: 60 → 20 € · y 2 más',
    )
  })
})
