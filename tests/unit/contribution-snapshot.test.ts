import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyContributionSave,
  buildWorkflowSnapshotState,
} from '../../src/domain/investment/contributions'
import { normalizeState } from '../../src/scripts/state'

describe('contribution snapshot defaults', () => {
  it('uses calculated wealth balances when the selected month has no snapshot', () => {
    const state = normalizeState({
      year: 2026,
      accounts: [{ id: 'cash', name: 'MyInvestor', openingBalance: 1200 }],
      investmentAssets: [{ id: 'fund', name: 'Fund', openingBalance: 1000 }],
      twrLiquidityAccountIds: ['cash'],
      transactions: [
        {
          id: 'buy',
          date: '2026-02-10',
          month: 2,
          type: 'investment',
          accountId: 'cash',
          category: 'Fund',
          amount: 200,
        },
        {
          id: 'future',
          date: '2026-03-10',
          month: 3,
          type: 'income',
          accountId: 'cash',
          category: 'Salary',
          amount: 500,
        },
      ],
      snapshots: {},
    })
    const before = structuredClone(state)

    const workflow = buildWorkflowSnapshotState(state, 2, '2026-02-28')

    expect(workflow.investments).toEqual([{ id: 'fund', name: 'Fund', value: '1200' }])
    expect(workflow.liquidity).toEqual([{ id: 'cash', name: 'MyInvestor', value: '1000' }])
    expect(state).toEqual(before)
  })

  it('combines a saved zero with balances calculated from previous snapshots', () => {
    const state = normalizeState({
      year: 2025,
      accounts: [{ id: 'cash', name: 'MyInvestor', openingBalance: 1200 }],
      investmentAssets: [
        { id: 'fund', name: 'Fund', openingBalance: 1000 },
        { id: 'other', name: 'Other', openingBalance: 500 },
      ],
      twrLiquidityAccountIds: ['cash'],
      snapshots: {
        1: { month: 1, accounts: { cash: 1500 }, investments: { other: 750 }, liabilities: {} },
        2: { month: 2, accounts: {}, investments: { fund: 0 }, liabilities: {} },
      },
      transactions: [
        {
          id: 'expense',
          date: '2025-02-10',
          month: 2,
          type: 'expense',
          accountId: 'cash',
          category: 'Food',
          amount: 100,
        },
      ],
    })

    const workflow = buildWorkflowSnapshotState(state, 2, '2025-02-28')

    expect(workflow.investments.map((item) => item.value)).toEqual(['0', '750'])
    expect(workflow.liquidity[0].value).toBe('1400')
    expect(buildWorkflowSnapshotState(state, 1, '2025-01-31').liquidity[0].value).toBe('1500')
  })

  it('prefers saved liquidity including zero over opening balances', () => {
    const state = normalizeState({
      accounts: [{ id: 'cash', name: 'MyInvestor', openingBalance: 1200 }],
      twrLiquidityAccountIds: ['cash'],
      snapshots: { 1: { month: 1, accounts: { cash: 0 }, investments: {}, liabilities: {} } },
    })

    expect(buildWorkflowSnapshotState(state, 1, '2026-01-31').liquidity[0].value).toBe('0')
  })

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
      const workflow = buildWorkflowSnapshotState(state, 4, '2026-04-15')
      const result = applyContributionSave(state, {
        month: 4,
        date: '2026-04-15',
        snapshotInputs: [
          ...workflow.investments.map((item) => ({
            kind: 'investments' as const,
            id: item.id,
            value: item.value,
          })),
          ...workflow.liquidity.map((item) => ({
            kind: 'accounts' as const,
            id: item.id,
            value: item.value,
          })),
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
