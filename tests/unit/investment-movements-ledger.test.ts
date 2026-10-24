import { describe, expect, it } from 'vitest'

import {
  buildInvestmentMovementRows,
  groupInvestmentMovementsByMonth,
  summarizeInvestmentYear,
} from '../../src/domain/investment/view-model'
import type { Month } from '../../src/lib/month'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'

function movement(
  id: string,
  date: string,
  side: 'buy' | 'sell',
  amount: number,
  fee: number,
  declared = false,
) {
  return {
    id,
    date,
    time: '10:00',
    month: Number(date.slice(5, 7)) as Month,
    type: 'investment',
    accountId: 'broker',
    category: 'Fondos',
    description: id,
    amount,
    side,
    units: 1,
    unitPrice: Math.abs(amount),
    fee,
    symbol: 'VWCE',
    declared,
  }
}

function state(transactions: unknown[]): State {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
    transactions,
  })
}

const sample = state([
  movement('a', '2026-07-15', 'buy', 416.26, 1),
  movement('b', '2026-07-03', 'buy', 99.54, 0.15, true),
  movement('c', '2026-06-16', 'sell', -97.2, 1, true),
  movement('d', '2026-06-02', 'buy', 186.6, 1.5),
  movement('e', '2025-12-30', 'buy', 50, 1),
  { ...movement('f', '2026-06-10', 'buy', 30, 0), type: 'expense' },
])

describe('summarizeInvestmentYear', () => {
  it('totals what was bought, sold and paid in fees in the year', () => {
    const summary = summarizeInvestmentYear(sample, 2026)

    expect(summary.bought).toBeCloseTo(702.4)
    expect(summary.sold).toBeCloseTo(97.2)
    expect(summary.fees).toBeCloseTo(3.65)
  })

  it('counts the undeclared movements of the year', () => {
    expect(summarizeInvestmentYear(sample, 2026).pending).toBe(2)
  })

  it('is all zeros for a year without movements', () => {
    expect(summarizeInvestmentYear(sample, 2024)).toEqual({
      bought: 0,
      sold: 0,
      fees: 0,
      pending: 0,
    })
  })
})

describe('groupInvestmentMovementsByMonth', () => {
  const rows = buildInvestmentMovementRows(sample, 2026, false, () => 'Broker')

  it('groups the rows by month, newest month first', () => {
    const groups = groupInvestmentMovementsByMonth(rows)

    expect(groups.map((group) => group.month)).toEqual([7, 6])
    expect(groups.map((group) => group.count)).toEqual([2, 2])
    expect(groups[0].rows.map((row) => row.tx.id)).toEqual(['a', 'b'])
  })

  it('nets purchases with their fee minus what sales brought in', () => {
    const [july, june] = groupInvestmentMovementsByMonth(rows)

    expect(july.net).toBeCloseTo(515.8)
    expect(june.net).toBeCloseTo(89.4)
  })

  it('goes negative when sales outweigh purchases', () => {
    const sales = buildInvestmentMovementRows(
      state([
        movement('s', '2026-03-01', 'sell', -300, 1),
        movement('p', '2026-03-02', 'buy', 100, 1),
      ]),
      2026,
      false,
      () => 'Broker',
    )

    expect(groupInvestmentMovementsByMonth(sales)[0].net).toBeCloseTo(-200)
  })

  it('returns no groups for no rows', () => {
    expect(groupInvestmentMovementsByMonth([])).toEqual([])
  })
})
