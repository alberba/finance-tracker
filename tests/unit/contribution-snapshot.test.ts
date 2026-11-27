import { describe, expect, it } from 'vitest'

import { computeContributionMetrics, type ContributionEntry } from '../../src/lib/finance-core'
import { getContributionEntriesFromSnapshots } from '../../src/domain/investment/contributions'
import { normalizeState } from '../../src/scripts/state'

describe('TWR desde snapshots guardados', () => {
  it('no cuenta dos veces el flujo cuando el mercado no se mueve', () => {
    // January: 100 € go into the cash account; the stored portfolio value is the one before the
    // flow and the snapshot already includes it. February: nothing moves.
    const contribution = (date: string, portfolioValue: number, flow: number) => ({
      id: `contrib-${date}`,
      date,
      amount: flow,
      portfolioDate: date,
      portfolioValue,
      flow,
      flowAllocations: flow > 0 ? [{ accountId: 'cash', amount: flow }] : [],
      flowSource: 'allocations' as const,
      warnings: [],
    })
    const state = normalizeState({
      year: 2026,
      accounts: [{ id: 'cash', name: 'MyInvestor', openingBalance: 1200 }],
      investmentAssets: [{ id: 'fund', name: 'Fund', openingBalance: 1000 }],
      twrLiquidityAccountIds: ['cash'],
      transactions: [],
      contributions: [contribution('2026-01-31', 2200, 100), contribution('2026-02-28', 2300, 0)],
      snapshots: {
        1: { month: 1, accounts: { cash: 1300 }, investments: { fund: 1000 }, liabilities: {} },
        2: { month: 2, accounts: { cash: 1300 }, investments: { fund: 1000 }, liabilities: {} },
      },
    })

    const rows = computeContributionMetrics(
      getContributionEntriesFromSnapshots(state) as ContributionEntry[],
    )
    expect(rows).toHaveLength(2)
    expect(rows[1].periodReturn).toBeCloseTo(0, 6)
    expect(rows[1].cumulativeReturn).toBeCloseTo(0, 6)
  })
})
