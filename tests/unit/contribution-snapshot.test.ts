import { beforeEach, describe, expect, it } from 'vitest'

import { computeContributionMetrics, type ContributionEntry } from '../../src/lib/finance-core'
import {
  applyContributionSave,
  getContributionEntriesFromSnapshots,
} from '../../src/domain/investment/contributions'
import { normalizeState } from '../../src/scripts/state'

describe('applyContributionSave', () => {
  describe('allocation adjustments', () => {
    let state: ReturnType<typeof normalizeState>

    beforeEach(() => {
      state = normalizeState({
        year: 2026,
        accounts: [
          { id: 'cash', name: 'MyInvestor', openingBalance: 1200 },
          { id: 'other', name: 'Other', openingBalance: 0 },
        ],
        investmentAssets: [{ id: 'fund', name: 'Fund', openingBalance: 1000 }],
        twrLiquidityAccountIds: ['cash', 'other'],
        transactions: [],
        contributions: [],
        snapshots: {},
      })
    })

    function save(amount: number, accountId = 'cash'): void {
      // The form starts from the saved balances, or the opening ones the first time.
      const saved = state.snapshots['4']?.accounts
      const result = applyContributionSave(state, {
        month: 4,
        date: '2026-04-15',
        snapshotInputs: [
          { kind: 'investments', id: 'fund', value: '1000' },
          { kind: 'accounts', id: 'cash', value: String(saved?.cash ?? 1200) },
          { kind: 'accounts', id: 'other', value: String(saved?.other ?? 0) },
        ],
        allocations: [{ accountId, amount }],
        warnings: [],
      })
      if (!result.state) throw new Error(result.error)
      state = result.state
    }

    it('adds a new contribution to wealth while keeping the pre-flow portfolio value', () => {
      save(100)
      expect(state.snapshots['4'].accounts.cash).toBe(1300)
      expect(state.contributions[0].portfolioValue).toBe(2200)
    })

    it.each([
      { name: 'repeated save', amount: 100, accountId: 'cash', balances: { cash: 1300, other: 0 } },
      { name: 'amount edit', amount: 150, accountId: 'cash', balances: { cash: 1350, other: 0 } },
      {
        name: 'reassignment',
        amount: 150,
        accountId: 'other',
        balances: { cash: 1200, other: 150 },
      },
    ])('applies only the difference for $name', ({ amount, accountId, balances }) => {
      save(100)
      save(amount, accountId)

      expect(state.snapshots['4'].accounts).toEqual(balances)
      expect(state.contributions).toHaveLength(1)
      expect(state.contributions[0].portfolioValue).toBe(2200)
    })
  })
})


describe('TWR desde snapshots guardados', () => {
  it('no cuenta dos veces el flujo cuando el mercado no se mueve', () => {
    let state = normalizeState({
      year: 2026,
      accounts: [{ id: 'cash', name: 'MyInvestor', openingBalance: 1200 }],
      investmentAssets: [{ id: 'fund', name: 'Fund', openingBalance: 1000 }],
      twrLiquidityAccountIds: ['cash'],
      transactions: [],
      contributions: [],
      snapshots: {},
    })

    function save(date: string, month: 1 | 2, amount: number, cash: string): void {
      const result = applyContributionSave(state, {
        month,
        date,
        snapshotInputs: [
          { kind: 'investments', id: 'fund', value: '1000' },
          { kind: 'accounts', id: 'cash', value: cash },
        ],
        allocations: amount > 0 ? [{ accountId: 'cash', amount }] : [],
        warnings: [],
      })
      if (!result.state) throw new Error(result.error)
      state = result.state
    }

    save('2026-01-31', 1, 100, '1200')
    save('2026-02-28', 2, 0, '1300')

    const rows = computeContributionMetrics(getContributionEntriesFromSnapshots(state) as ContributionEntry[])
    expect(rows).toHaveLength(2)
    expect(rows[1].periodReturn).toBeCloseTo(0, 6)
    expect(rows[1].cumulativeReturn).toBeCloseTo(0, 6)
  })
})
