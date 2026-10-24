import { describe, expect, it } from 'vitest'
import { buildSavingGoals } from '../../src/domain/goals/view-model'
import type { Month } from '../../src/lib/month'
import type { State, Transaction } from '../../src/scripts/types'

function saving(id: string, category: string, amount: number, date = '2026-03-10'): Transaction {
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'saving',
    accountId: 'corriente',
    destinationAccountId: 'hucha',
    category,
    description: id,
    amount,
  }
}

function state(transactions: Transaction[]): State {
  return {
    transactions,
    savingGoals: [
      { id: 'g1', name: 'Fondo de emergencia', category: 'Emergencia', targetAmount: 1000 },
      { id: 'g2', name: 'Viaje', category: 'Viaje', targetAmount: 500 },
    ],
  } as unknown as State
}

describe('buildSavingGoals', () => {
  it("sums the savings of the goal's category, whenever they were made", () => {
    const rows = buildSavingGoals(
      state([
        saving('a', 'Emergencia', 300, '2025-11-02'),
        saving('b', 'Emergencia', 200, '2026-03-10'),
        saving('c', 'Viaje', 100),
      ]),
    )

    expect(rows[0]).toMatchObject({ saved: 500, target: 1000, progress: 50, remaining: 500 })
    expect(rows[0].met).toBe(false)
    expect(rows[1]).toMatchObject({ saved: 100, progress: 20 })
  })

  it('ignores other movement types in the same category', () => {
    const expense: Transaction = { ...saving('x', 'Emergencia', 999), type: 'expense' }

    expect(buildSavingGoals(state([expense]))[0].saved).toBe(0)
  })

  it('caps the progress once met and reports the surplus as negative remaining', () => {
    const [goal] = buildSavingGoals(state([saving('a', 'Emergencia', 1200)]))

    expect(goal).toMatchObject({ progress: 100, remaining: -200, met: true })
  })
})
