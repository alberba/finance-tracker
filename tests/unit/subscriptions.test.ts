import { describe, expect, it } from 'vitest'

import {
  getFirstUpcomingChargeDate,
  materializeDueSubscriptions,
} from '../../src/scripts/subscriptions'
import type { State, Subscription } from '../../src/scripts/types'

function createSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'netflix',
    name: 'Netflix',
    amount: 12.99,
    accountId: 'main',
    category: 'Ocio',
    frequency: 'monthly',
    startDate: '2026-01-31',
    nextChargeDate: '2026-01-31',
    active: true,
    ...overrides,
  }
}

function createState(subscription: Subscription): State {
  return {
    meta: { source: 'test', generatedAt: '2026-01-01T00:00:00.000Z', version: 1, savedAt: null },
    year: 2026,
    currency: 'EUR',
    twrLiquidityAccountIds: [],
    accounts: [{ id: 'main', name: 'Main', openingBalance: 0 }],
    investmentAssets: [],
    liabilities: [],
    incomeCategories: [],
    expenseCategories: ['Ocio'],
    investmentCategories: [],
    transactions: [],
    subscriptions: [subscription],
    snapshots: {},
    budget: { income: {}, expense: {}, investment: {} },
    goals: {
      short: { name: '', targetYear: 2026, targetAmount: 0 },
      medium: { name: '', targetYear: 2026, targetAmount: 0 },
      long: { name: '', targetYear: 2026, targetAmount: 0 },
      investmentTotal: { name: '', targetYear: 2026, targetAmount: 0 },
      investmentFunds: { name: '', targetYear: 2026, targetAmount: 0 },
      investmentCrypto: { name: '', targetYear: 2026, targetAmount: 0 },
    },
    contributions: [],
    instruments: [],
    quotes: {},
    recurringRules: [],
    pendingMovements: [],
    stockEvents: { enabled: false, apiKey: '', symbolMappings: [] },
  }
}

describe('suscripciones', () => {
  it('recupera cada cobro pendiente y conserva sus fechas', () => {
    const state = createState(createSubscription({ nextChargeDate: '2026-03-31' }))

    const result = materializeDueSubscriptions(state, '2026-05-31')

    expect(result.generatedCount).toBe(3)
    expect(state.transactions.map((transaction) => transaction.date)).toEqual([
      '2026-03-31', '2026-04-30', '2026-05-31',
    ])
    expect(state.subscriptions[0]?.nextChargeDate).toBe('2026-06-30')
  })

  it('no duplica los cargos al ejecutarse de nuevo', () => {
    const state = createState(createSubscription({ nextChargeDate: '2026-05-01' }))

    materializeDueSubscriptions(state, '2026-05-01')
    const result = materializeDueSubscriptions(state, '2026-05-01')

    expect(state.transactions).toHaveLength(1)
    expect(result.generatedCount).toBe(0)
  })

  it('no materializa una suscripción pausada', () => {
    const state = createState(createSubscription({ active: false, nextChargeDate: '2026-05-01' }))

    const result = materializeDueSubscriptions(state, '2026-05-01')

    expect(result.generatedCount).toBe(0)
    expect(state.subscriptions[0]?.nextChargeDate).toBe('2026-05-01')
  })

  it('calcula la primera fecha futura al reactivar una suscripción pausada', () => {
    const subscription = createSubscription({
      active: false,
      nextChargeDate: '2026-03-31',
    })

    expect(getFirstUpcomingChargeDate(subscription, '2026-05-15')).toBe('2026-05-31')
  })

  it('ignora suscripciones vinculadas a cuentas eliminadas', () => {
    const state = createState(
      createSubscription({
        accountId: 'deleted-account',
        nextChargeDate: '2026-05-01',
      }),
    )

    const result = materializeDueSubscriptions(state, '2026-05-15')

    expect(result.generatedCount).toBe(0)
    expect(state.transactions).toHaveLength(0)
    expect(state.subscriptions[0]?.nextChargeDate).toBe('2026-05-01')
  })
})
