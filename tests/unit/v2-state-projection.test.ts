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

  it('counts a movement in its persisted accounting month, else in the month of its date', () => {
    const b = bootstrap()
    b.transactions[0] = { ...b.transactions[0], date: '2026-01-31', accountingMonth: 2 }

    expect(projectSyncV2State(b).transactions[0].month).toBe(1)
    b.transactions[0] = { ...b.transactions[0], accountingMonth: null }
    expect(projectSyncV2State(b).transactions[0].month).toBe(0)
  })

  it('projects pending movements including investment operation fields and investment accounts', () => {
    const b = bootstrap()
    b.accounts.push({ id: 'server-asset', legacyId: 'local-asset', name: 'Broker', kind: 'investment', openingBalance: 0 })
    b.categories.push({ id: 'server-inv-cat', legacyId: 'investment:Acciones', name: 'Acciones', kind: 'investment', sortOrder: 0 })
    b.recurringRules.push({ id: 'server-rule', legacyId: 'local-rule', name: 'Regla', type: 'investment', frequency: 'monthly' })
    b.pendingMovements = [
      {
        id: 'server-pm-inv',
        legacyId: 'local-pm-inv',
        recurringRuleId: 'server-rule',
        accountId: 'server-asset',
        categoryId: 'server-inv-cat',
        type: 'investment',
        dueDate: '2026-02-15',
        amount: 500,
        symbol: 'AAPL',
        side: 'buy',
        units: 3,
        unitPrice: 166.66,
        fee: 0.02,
        time: '14:30',
        status: 'pending',
      },
    ]

    const state = projectSyncV2State(b)
    expect(state.pendingMovements).toHaveLength(1)
    expect(state.pendingMovements[0]).toEqual(expect.objectContaining({
      id: 'local-pm-inv',
      ruleId: 'local-rule',
      type: 'investment',
      accountId: 'local-asset',
      category: 'Acciones',
      symbol: 'AAPL',
      side: 'buy',
      units: 3,
      unitPrice: 166.66,
      fee: 0.02,
      time: '14:30',
      status: 'pending',
    }))
  })
})
