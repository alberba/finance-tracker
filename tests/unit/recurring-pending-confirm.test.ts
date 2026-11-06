import { setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { createTestPinia } from '../helpers/pinia'
import type { PendingMovement } from '../../src/scripts/types'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useRecurringStore } from '../../src/stores/recurring'

function expensePending(overrides: Partial<PendingMovement> = {}): PendingMovement {
  return {
    id: 'pm-exp',
    occurrenceKey: 'rule-exp:2024-02-01',
    ruleId: 'rule-exp',
    occurrenceDate: '2024-02-01',
    type: 'expense',
    accountId: 'checking',
    category: 'Vivienda',
    description: 'Alquiler',
    amount: 900,
    status: 'pending',
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
    transactionId: null,
    ...overrides,
  }
}

function investmentPending(overrides: Partial<PendingMovement> = {}): PendingMovement {
  return {
    id: 'pm-inv',
    occurrenceKey: 'rule-inv:2024-02-01',
    ruleId: 'rule-inv',
    occurrenceDate: '2024-02-01',
    type: 'investment',
    accountId: 'broker',
    category: 'Cripto',
    description: 'Aportación BTC',
    amount: 100,
    symbol: 'BTC',
    side: 'buy',
    units: 1,
    unitPrice: 100,
    fee: 0,
    status: 'pending',
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
    transactionId: null,
    ...overrides,
  }
}

function setupState(pendingMovements: PendingMovement[]) {
  setActivePinia(createTestPinia())
  const financialStore = useFinancialStateStore()
  financialStore.replaceState({
    year: 2024,
    currency: 'EUR',
    accounts: [
      { id: 'checking', name: 'Cuenta', openingBalance: 1000 },
      { id: 'savings', name: 'Ahorro', openingBalance: 0 },
    ],
    investmentAssets: [{ id: 'broker', name: 'Binance', openingBalance: 500 }],
    liabilities: [],
    incomeCategories: [],
    expenseCategories: ['Vivienda', 'Ocio'],
    investmentCategories: ['Cripto'],
    transactions: [],
    snapshots: {},
    budget: { income: {}, expense: {}, investment: {} },
    goals: {},
    contributions: [],
    recurringRules: [],
    pendingMovements,
    instruments: [],
    quotes: {},
  })
  return { financialStore, recurringStore: useRecurringStore() }
}

describe('confirmPending — editing and confirming in one step (issue #408)', () => {
  it('applies the edit and the confirmation together', () => {
    const { financialStore, recurringStore } = setupState([expensePending()])

    expect(
      recurringStore.confirmPending('pm-exp', {
        date: '2024-02-03',
        accountId: 'checking',
        category: 'Ocio',
        description: 'Alquiler ajustado',
        amount: 925,
      }),
    ).toBe(true)

    expect(recurringStore.openPendingMovements).toHaveLength(0)
    expect(recurringStore.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      description: 'Alquiler ajustado',
      amount: 925,
      occurrenceDate: '2024-02-03',
    })
    expect(financialStore.transactions).toHaveLength(1)
    expect(financialStore.transactions[0]).toMatchObject({
      type: 'expense',
      date: '2024-02-03',
      accountId: 'checking',
      category: 'Ocio',
      description: 'Alquiler ajustado',
      amount: 925,
    })
  })

  it('recomputes a purchase from units, price and fee instead of the previous amount', () => {
    const { financialStore, recurringStore } = setupState([investmentPending()])

    expect(
      recurringStore.confirmPending('pm-inv', {
        date: '2024-02-02',
        accountId: 'broker',
        category: 'Cripto',
        description: 'Compra BTC',
        amount: 999,
        symbol: 'btc',
        side: 'buy',
        units: 0.5,
        unitPrice: 20000,
        fee: 10,
        time: '10:30',
      }),
    ).toBe(true)

    expect(financialStore.transactions[0]).toMatchObject({
      type: 'investment',
      symbol: 'BTC',
      side: 'buy',
      units: 0.5,
      unitPrice: 20000,
      fee: 10,
      time: '10:30',
      description: 'Compra BTC',
      amount: 10010,
    })
    expect(recurringStore.pendingMovements[0].amount).toBe(10010)
  })

  it('recomputes a sale as a negative amount', () => {
    const { financialStore, recurringStore } = setupState([investmentPending()])

    expect(
      recurringStore.confirmPending('pm-inv', {
        date: '2024-02-02',
        accountId: 'broker',
        category: 'Cripto',
        description: 'Venta BTC',
        amount: 1,
        symbol: 'BTC',
        side: 'sell',
        units: 2,
        unitPrice: 100,
        fee: 1,
      }),
    ).toBe(true)

    expect(financialStore.transactions[0]).toMatchObject({
      type: 'investment',
      side: 'sell',
      amount: -199,
    })
    expect(recurringStore.pendingMovements[0].amount).toBe(199)
  })

  it('recalculates when an expense is reclassified as an investment', () => {
    const { financialStore, recurringStore } = setupState([expensePending()])

    expect(
      recurringStore.confirmPending('pm-exp', {
        date: '2024-02-02',
        accountId: 'broker',
        category: 'Cripto',
        description: 'Compra ETH',
        amount: 50,
        type: 'investment',
        symbol: 'eth',
        side: 'buy',
        units: 2,
        unitPrice: 90,
        fee: 2,
      }),
    ).toBe(true)

    expect(financialStore.transactions[0]).toMatchObject({
      type: 'investment',
      symbol: 'ETH',
      units: 2,
      unitPrice: 90,
      fee: 2,
      amount: 182,
    })
  })

  it('rejects a saving whose destination is its origin', () => {
    const { financialStore, recurringStore } = setupState([expensePending()])

    expect(
      recurringStore.confirmPending('pm-exp', {
        date: '2024-02-01',
        accountId: 'checking',
        type: 'saving',
        destinationAccountId: 'checking',
        category: 'Vivienda',
        description: 'Alquiler',
        amount: 900,
      }),
    ).toBe(false)

    expectInvalidEdit(financialStore, recurringStore)
  })

  it('rejects a non-positive amount', () => {
    const { financialStore, recurringStore } = setupState([expensePending()])

    expect(
      recurringStore.confirmPending('pm-exp', {
        date: '2024-02-01',
        accountId: 'checking',
        category: 'Vivienda',
        description: 'Alquiler',
        amount: 0,
      }),
    ).toBe(false)

    expectInvalidEdit(financialStore, recurringStore)
  })

  it('rejects a blank description', () => {
    const { financialStore, recurringStore } = setupState([expensePending()])

    expect(
      recurringStore.confirmPending('pm-exp', {
        date: '2024-02-01',
        accountId: 'checking',
        category: 'Vivienda',
        description: '   ',
        amount: 900,
      }),
    ).toBe(false)

    expectInvalidEdit(financialStore, recurringStore)
  })

  it('confirms without editing exactly as before', () => {
    const { financialStore, recurringStore } = setupState([
      expensePending({ description: '  Alquiler  ' }),
    ])

    expect(recurringStore.confirmPending('pm-exp')).toBe(true)

    expect(financialStore.transactions[0]).toMatchObject({
      type: 'expense',
      date: '2024-02-01',
      description: 'Alquiler',
      amount: 900,
    })
    expect(recurringStore.pendingCount).toBe(0)
    expect(recurringStore.pendingMovements[0].description).toBe('  Alquiler  ')
  })
})

function expectInvalidEdit(
  financialStore: ReturnType<typeof useFinancialStateStore>,
  recurringStore: ReturnType<typeof useRecurringStore>,
): void {
  expect(financialStore.transactions).toHaveLength(0)
  expect(recurringStore.pendingCount).toBe(1)
  expect(recurringStore.openPendingMovements[0]).toMatchObject({
    status: 'pending',
    amount: 900,
    description: 'Alquiler',
  })
}
