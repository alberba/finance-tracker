// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { useRecurringStore } from '../../../../src/stores/recurring'
import { startRoundTrip, type RoundTrip } from './harness'
import { runWithDb } from '../../../../src/db/database'

describe('round trip: recurring rules and pending movements', () => {
  let trip: RoundTrip | undefined

  afterEach(() => {
    trip?.cleanup()
    delete (window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__
  })

  it('refreshes and edits hydrated migrated rows without recreating them', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip = await startRoundTrip(async (db, userId) => {
      const accounts = await import('../../../../src/db/repositories/accounts')
      const rules = await import('../../../../src/db/repositories/recurring-rules')
      const pending = await import('../../../../src/db/repositories/pending-movements')
      const account = await runWithDb(db, accounts.create(userId, {
        name: 'Cuenta',
        kind: 'cash',
        currency: 'EUR',
        openingBalance: 0,
        legacyId: 'old-account',
      }))
      const category = await runWithDb(db, accounts.createCategory(userId, {
        name: 'Cuotas',
        kind: 'expense',
        legacyId: 'expense:Cuotas',
      }))
      const rule = await runWithDb(db, rules.create(userId, {
        name: 'Cuota',
        type: 'expense',
        accountId: account.id,
        categoryId: category.id,
        amount: 25,
        currency: 'EUR',
        frequency: 'monthly',
        startDate: '2026-09-01',
        lastExecutionDate: '2026-09-01',
        nextRunDate: '2026-10-01',
        legacyId: 'old-rule',
      }))
      await runWithDb(db, pending.create(userId, {
        recurringRuleId: rule.id,
        accountId: account.id,
        categoryId: category.id,
        amount: 25,
        currency: 'EUR',
        dueDate: '2026-09-01',
        type: 'expense',
        description: 'Cuota',
        legacyId: 'old-pending',
      }))
      // The app constructs the recurring store before sync.init hydrates its state.
      useRecurringStore()
    })
    const recurring = useRecurringStore()
    expect(recurring.refreshPending()).toBe(1)
    expect(recurring.refreshPending()).toBe(0)
    let reloaded = await trip.reload()
    expect(reloaded.recurringRules).toHaveLength(1)
    expect(reloaded.pendingMovements).toHaveLength(2)

    const current = useRecurringStore()
    expect(
      current.updateRule('old-rule', {
        type: 'expense',
        accountId: 'old-account',
        category: 'Cuotas',
        description: 'Cuota editada',
        amount: 30,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-09-01',
      }),
    ).toBe(true)
    await trip.syncStore.refreshFromServer()
    current.refreshPending()
    reloaded = await trip.reload()
    expect(reloaded.recurringRules).toHaveLength(1)
    expect(reloaded.recurringRules[0]).toMatchObject({
      id: 'old-rule',
      amount: 30,
      description: 'Cuota editada',
    })
    expect(reloaded.pendingMovements).toHaveLength(2)
    expect(reloaded.pendingMovements.every((item) => item.ruleId === 'old-rule')).toBe(true)
    expect(await trip.pending()).toEqual([])
  })
})
