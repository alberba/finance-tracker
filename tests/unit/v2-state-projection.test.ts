import { describe, expect, it } from 'vitest'

import { projectSyncV2State, type SyncV2Bootstrap } from '../../src/lib/client/v2-state-projection'

function bootstrap(): SyncV2Bootstrap {
  return {
    revision: 7,
    settings: { currency: 'USD' },
    accounts: [{ id: 'server-account', legacyId: 'local-account', name: 'Cuenta', kind: 'cash', openingBalance: 250 }],
    categories: [{ id: 'server-category', legacyId: 'income:Nómina', name: 'Nómina', kind: 'income', sortOrder: 0 }],
    transactions: [{
      id: 'server-transaction', legacyId: 'local-transaction', accountId: 'server-account',
      categoryId: 'server-category', type: 'income', date: '2026-01-10', description: 'Nómina', amount: 1500,
    }],
    subscriptions: [], recurringRules: [], pendingMovements: [], budgetEntries: [], goals: [],
    wealthSnapshots: [], contributions: [], userInstruments: [],
  }
}

describe('projectSyncV2State', () => {
  it('preserves legacy ids and resolves relational ids for the current UI model', () => {
    const state = projectSyncV2State(bootstrap())

    expect(state.currency).toBe('USD')
    expect(state.accounts).toEqual([{ id: 'local-account', name: 'Cuenta', openingBalance: 250 }])
    expect(state.incomeCategories).toEqual(['Nómina'])
    expect(state.transactions).toEqual([expect.objectContaining({
      id: 'local-transaction', accountId: 'local-account', category: 'Nómina', month: 0,
    })])
  })
})
