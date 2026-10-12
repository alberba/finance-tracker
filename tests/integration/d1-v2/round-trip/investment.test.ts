// @vitest-environment happy-dom
/**
 * Round trip for inversión — audit §4.3 (a movement is stored as a bare
 * amount: symbol, units, unit price, fee and buy/sell have nowhere to go)
 * and §3.2 (bug (b) of issue #134: a recurring investment rule cannot be
 * represented, and editing one emits nothing at all).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startRoundTrip, type RoundTrip } from './harness'

async function seedAccountAndCategory(trip: RoundTrip) {
  const { useSettingsStore } = await import('../../../../src/stores/settings')
  const { useFinancialStateStore } = await import('../../../../src/stores/financial-state')
  const financialState = useFinancialStateStore()
  financialState.commitState((draft) => {
    draft.investmentCategories = ['Acciones']
    draft.expenseCategories = ['Ocio']
  })
  useSettingsStore().addEntity('accounts', 'MyInvestor', '0')
  // The account's own identity, read from the state instead of assumed from
  // its name: a new entity carries the id the client minted (ADR 0001).
  const accountId = financialState.accounts[0].id
  await trip.reload()
  return accountId
}

describe('round trip: inversión', () => {
  let trip: RoundTrip
  let accountId: string

  beforeEach(async () => {
    trip = await startRoundTrip()
    accountId = await seedAccountAndCategory(trip)
  })

  afterEach(() => {
    trip.cleanup()
    delete (window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__
  })

  it('keeps symbol, units, unit price and side of a movement (§4.3)', async () => {
    const { useInvestmentStore } = await import('../../../../src/stores/investment')
    expect(
      useInvestmentStore().addMovement({
        date: '2026-09-12',
        time: '10:30',
        side: 'buy',
        symbol: 'VWCE',
        category: 'Acciones',
        unitPrice: '120.50',
        units: '10',
        fee: '1.20',
        movementCurrency: 'EUR',
        accountId,
        declared: false,
      }),
    ).toBe(true)

    const reloaded = await trip.reload()

    const movement = reloaded.transactions.find((tx) => tx.type === 'investment')
    expect(movement).toBeDefined()
    expect(movement).toMatchObject({
      symbol: 'VWCE',
      side: 'buy',
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
    })
  })

  it('keeps every field of a recurring investment rule (§3.2b)', async () => {
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    expect(
      useRecurringStore().addRule({
        type: 'investment',
        accountId,
        category: 'Acciones',
        description: 'Aportación mensual VWCE',
        amount: 200,
        symbol: 'VWCE',
        side: 'buy',
        units: 1.5,
        unitPrice: 133.33,
        fee: 0,
        time: '09:00',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-09-01',
      }),
    ).toBe(true)

    const reloaded = await trip.reload()

    expect(reloaded.recurringRules).toHaveLength(1)
    expect(reloaded.recurringRules[0]).toMatchObject({
      type: 'investment',
      symbol: 'VWCE',
      side: 'buy',
      units: 1.5,
      unitPrice: 133.33,
      interval: 1,
      startDate: '2026-09-01',
    })
  })

  it('recovers a rule and its first occurrences after an offline restart', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)

    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    expect(
      useRecurringStore().addRule({
        type: 'expense',
        accountId,
        category: 'Ocio',
        description: 'Cuota mensual',
        amount: 25,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-09-01',
      }),
    ).toBe(true)

    const offline = await trip.reloadOffline()
    expect(offline.recurringRules).toHaveLength(1)
    expect(offline.pendingMovements).toHaveLength(2)

    trip.setOffline(false)
    const reloaded = await trip.reload()
    expect(reloaded.recurringRules).toHaveLength(1)
    expect(reloaded.pendingMovements).toHaveLength(2)
    expect(reloaded.pendingMovements.map((pending) => pending.occurrenceDate)).toEqual([
      '2026-09-01',
      '2026-10-01',
    ])
    expect(
      reloaded.pendingMovements.every(
        (pending) => pending.ruleId === reloaded.recurringRules[0].id,
      ),
    ).toBe(true)
    expect(await trip.pending()).toEqual([])
  })

  it('retries creating a rule and its pending movements after an enqueue failure', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    const realEnqueue = trip.syncStore.enqueueCommand.bind(trip.syncStore)
    let failed!: () => void
    const failure = new Promise<void>((resolve) => {
      failed = resolve
    })
    let rejectRuleCreate = true
    trip.syncStore.enqueueCommand = async (command) => {
      if (
        rejectRuleCreate &&
        command.action === 'create' &&
        command.entityType === 'recurringRule'
      ) {
        rejectRuleCreate = false
        failed()
        return null
      }
      return realEnqueue(command)
    }

    expect(
      recurring.addRule({
        type: 'expense',
        accountId,
        category: 'Ocio',
        description: 'Cuota recuperable',
        amount: 25,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-09-01',
      }),
    ).toBe(true)
    await failure
    trip.syncStore.enqueueCommand = realEnqueue
    recurring.refreshPending('2026-10-01')
    trip.setOffline(false)
    const reloaded = await trip.reload()

    expect(reloaded.recurringRules).toHaveLength(1)
    expect(reloaded.pendingMovements).toHaveLength(2)
    expect(
      reloaded.pendingMovements.every(
        (pending) => pending.ruleId === reloaded.recurringRules[0].id,
      ),
    ).toBe(true)
    expect(await trip.pending()).toEqual([])
  })

  it('recovers missing occurrences after a pending enqueue fails and the client restarts', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const realEnqueue = trip.syncStore.enqueueCommand.bind(trip.syncStore)
    let failed!: () => void
    const failure = new Promise<void>((resolve) => {
      failed = resolve
    })
    let occurrences = 0
    trip.syncStore.enqueueCommand = async (command) => {
      if (
        command.action === 'create' &&
        command.entityType === 'pendingMovement' &&
        ++occurrences === 2
      ) {
        failed()
        return null
      }
      return realEnqueue(command)
    }
    useRecurringStore().addRule({
      type: 'expense',
      accountId,
      category: 'Ocio',
      description: 'Cuota con fallo local',
      amount: 25,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
    })
    await failure
    await trip.reloadOffline()
    expect(useRecurringStore().refreshPending()).toBe(1)
    await trip.reloadOffline()
    trip.setOffline(false)
    const reloaded = await trip.reload()
    expect(reloaded.recurringRules).toHaveLength(1)
    expect(reloaded.pendingMovements.map((item) => item.occurrenceDate)).toEqual([
      '2026-09-01',
      '2026-10-01',
    ])
    expect(await trip.pending()).toEqual([])
  })

  it('keeps concurrent rule creation and shared category references after reload', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    for (const description of ['Primera cuota', 'Segunda cuota']) {
      expect(
        recurring.addRule({
          type: 'expense',
          accountId,
          category: 'Ocio',
          description,
          amount: 25,
          frequency: 'monthly',
          interval: 1,
          startDate: '2026-09-01',
        }),
      ).toBe(true)
    }

    await trip.reloadOffline()
    trip.setOffline(false)
    const reloaded = await trip.reload()

    expect(reloaded.recurringRules.map((rule) => rule.description).sort()).toEqual([
      'Primera cuota',
      'Segunda cuota',
    ])
    expect(reloaded.pendingMovements).toHaveLength(4)
    for (const rule of reloaded.recurringRules) {
      expect(
        reloaded.pendingMovements.filter((pending) => pending.ruleId === rule.id),
      ).toHaveLength(2)
    }
    expect(await trip.pending()).toEqual([])
  })

  it('confirms and edits investment occurrences before sending, then recovers their links after restart', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    recurring.addRule({
      type: 'investment',
      accountId,
      category: 'Nueva inversión',
      description: 'Compra mensual',
      amount: 101,
      symbol: 'VWCE',
      side: 'buy',
      units: 1,
      unitPrice: 100,
      fee: 1,
      time: '09:30',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
    })
    const ruleId = recurring.rules[0].id
    const first = recurring.openPendingMovements[0].id
    const second = recurring.openPendingMovements[1].id
    expect(
      recurring.editPending(first, {
        type: 'investment',
        date: '2026-09-02',
        accountId,
        category: 'Nueva inversión',
        description: 'Compra editada',
        amount: 252,
        symbol: 'VWCE',
        side: 'buy',
        units: 2,
        unitPrice: 125,
        fee: 2,
        time: '10:45',
      }),
    ).toBe(true)
    expect(recurring.confirmPending(first)).toBe(true)
    recurring.skipPending(second)
    recurring.toggleRule(ruleId, false)

    const offline = await trip.reloadOffline()
    expect(offline.pendingMovements.find((item) => item.id === first)?.status).toBe('confirmed')
    trip.setOffline(false)
    const reloaded = await trip.reload()
    const movement = reloaded.transactions.find((item) => item.description === 'Compra editada')
    expect(movement).toMatchObject({
      amount: 252,
      category: 'Nueva inversión',
      symbol: 'VWCE',
      side: 'buy',
      units: 2,
      unitPrice: 125,
      fee: 2,
      time: '10:45',
    })
    expect(reloaded.pendingMovements.find((item) => item.id === first)).toMatchObject({
      ruleId,
      status: 'confirmed',
      transactionId: movement!.id,
    })
    expect(reloaded.pendingMovements.find((item) => item.id === second)?.status).toBe('skipped')
    expect(reloaded.recurringRules[0].active).toBe(false)
    expect(reloaded.investmentCategories.filter((name) => name === 'Nueva inversión')).toHaveLength(
      1,
    )
    expect(await trip.pending()).toEqual([])
  })

  // A future start date means `refreshPending` generates nothing and the
  // calendar does not move — which, per audit §3.2a, is precisely when the
  // edit has nothing to piggyback on and is lost.
  it('persists an edit to a recurring rule whose calendar has not moved (§3.2a)', async () => {
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    recurring.addRule({
      type: 'expense',
      accountId,
      category: 'Ocio',
      description: 'Gimnasio',
      amount: 30,
      frequency: 'monthly',
      interval: 1,
      startDate: '2027-01-01',
    })
    const first = await trip.reload()
    const ruleId = first.recurringRules[0].id

    useRecurringStore().updateRule(ruleId, {
      type: 'expense',
      accountId,
      category: 'Ocio',
      description: 'Gimnasio Premium',
      amount: 45,
      frequency: 'monthly',
      interval: 1,
      startDate: '2027-01-01',
    })

    const reloaded = await trip.reload()

    expect(reloaded.recurringRules[0]).toMatchObject({
      description: 'Gimnasio Premium',
      amount: 45,
    })
  })

  it("keeps a pending movement's type instead of calling it a gasto (§3.2c)", async () => {
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    useRecurringStore().addRule({
      type: 'investment',
      accountId,
      category: 'Acciones',
      description: 'Aportación mensual VWCE',
      amount: 200,
      symbol: 'VWCE',
      side: 'buy',
      units: 1.5,
      unitPrice: 133.33,
      fee: 0,
      time: '09:00',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
    })

    const reloaded = await trip.reload()

    expect(reloaded.pendingMovements.length).toBeGreaterThan(0)
    expect(reloaded.pendingMovements[0]).toMatchObject({
      type: 'investment',
      description: 'Aportación mensual VWCE',
    })
  })

  it('syncs edited pending movement without losing investment operation fields', async () => {
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    recurring.addRule({
      type: 'expense',
      accountId,
      category: 'Ocio',
      description: 'Gasto original',
      amount: 100,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
    })

    let reloaded = await trip.reload()
    expect(reloaded.pendingMovements.length).toBeGreaterThan(0)
    const pmId = reloaded.pendingMovements[0].id

    // Edit and reclassify to investment
    const ok = useRecurringStore().editPending(pmId, {
      type: 'investment',
      date: '2026-09-02',
      accountId,
      category: 'Acciones',
      description: 'Reclasificado a Inversión',
      amount: 250,
      symbol: 'VWCE',
      side: 'buy',
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: '15:00',
    })
    expect(ok).toBe(true)

    // Reload from server after sync flush
    reloaded = await trip.reload()
    expect(reloaded.pendingMovements[0]).toMatchObject({
      type: 'investment',
      description: 'Reclasificado a Inversión',
      category: 'Acciones',
      symbol: 'VWCE',
      side: 'buy',
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: '15:00',
    })
  })

  it('keeps investment operation fields when a pending movement is confirmed (#205)', async () => {
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    recurring.addRule({
      type: 'expense',
      accountId,
      category: 'Ocio',
      description: 'Gasto original',
      amount: 100,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
    })
    let reloaded = await trip.reload()
    const pmId = reloaded.pendingMovements[0].id
    useRecurringStore().editPending(pmId, {
      type: 'investment',
      date: '2026-09-02',
      accountId,
      category: 'Acciones',
      description: 'Aportación VWCE',
      amount: 250,
      symbol: 'VWCE',
      side: 'buy',
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: '15:00',
    })
    await trip.reload()
    // A reloaded page has new stores; the pre-reload instance is gone.
    expect(useRecurringStore().confirmPending(pmId)).toBe(true)

    reloaded = await trip.reload()
    expect(reloaded.transactions.find((tx) => tx.type === 'investment')).toMatchObject({
      symbol: 'VWCE',
      side: 'buy',
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: '15:00',
    })
  })

  it('keeps the declared flag (§4.3)', async () => {
    const { useInvestmentStore } = await import('../../../../src/stores/investment')
    const investment = useInvestmentStore()
    investment.addMovement({
      date: '2026-09-12',
      time: '10:30',
      side: 'buy',
      symbol: 'VWCE',
      category: 'Acciones',
      unitPrice: '120.50',
      units: '10',
      fee: '1.20',
      movementCurrency: 'EUR',
      accountId,
      declared: false,
    })
    const first = await trip.reload()
    const movementId = first.transactions.find((tx) => tx.type === 'investment')!.id

    useInvestmentStore().toggleDeclared(movementId)

    const reloaded = await trip.reload()

    expect(reloaded.transactions.find((tx) => tx.id === movementId)?.declared).toBe(true)
  })

  it("keeps how a contribution's flow was split across accounts (§5)", async () => {
    const { useInvestmentStore } = await import('../../../../src/stores/investment')
    const saved = useInvestmentStore().saveContribution(
      '2026-03-31',
      2,
      [{ kind: 'investments', id: 'indexa', value: '1000' }],
      [{ accountId, amount: 200 }],
      [],
    )
    expect(saved).toBe(true)

    const reloaded = await trip.reload()

    const contribution = reloaded.contributions.find((item) => item.date === '2026-03-31')
    expect(contribution?.flowAllocations).toEqual([{ accountId, amount: 200 }])

    useInvestmentStore().setContributionFlow('2026-03-31', 0)
    const edited = await trip.reload()
    expect(edited.contributions.find((item) => item.date === '2026-03-31')).toMatchObject({
      amount: 0,
      flow: 0,
      flowAllocations: [],
    })
  })
})
