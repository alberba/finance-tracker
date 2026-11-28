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

  it('keeps symbol, units, unit price, side and declared flag of a movement (§4.3)', async () => {
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
        declared: true,
      }),
    ).toBe(true)

    const reloaded = await trip.reload()

    const movement = reloaded.transactions.find((tx) => tx.type === 'investment')
    expect(movement).toMatchObject({
      declared: true,
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
      await useRecurringStore().addRule({
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
      await useRecurringStore().addRule({
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
    expect(reloaded.pendingMovements.map((pending) => pending.occurrenceDate).sort()).toEqual([
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

  it('retries creating a rule and its pending movements after a local publish failure', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    // The acceptance transaction owns the rule command; the occurrences are
    // published right after. Interrupting that publication leaves the accepted
    // rule in the durable intent, not just in memory.
    const realPublish = trip.syncStore.publishIntentCommands.bind(trip.syncStore)
    let rejectPendings = true
    trip.syncStore.publishIntentCommands = async (intentId, commands) => {
      if (rejectPendings && commands.some((entry) => entry.step.startsWith('pending:'))) {
        rejectPendings = false
        return null
      }
      return realPublish(intentId, commands)
    }

    expect(
      await recurring.addRule({
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
    const acceptedIds = useRecurringStore()
      .openPendingMovements.map((pending) => pending.id)
      .sort()
    expect(acceptedIds).toHaveLength(2)
    trip.syncStore.publishIntentCommands = realPublish

    // A restart resumes the publication from the intent: the same occurrence
    // ids come back instead of a regenerated set.
    const offline = await trip.reloadOffline()
    expect(offline.recurringRules).toHaveLength(1)
    expect(offline.pendingMovements.map((pending) => pending.id).sort()).toEqual(acceptedIds)
    expect(
      offline.pendingMovements.every((pending) => pending.ruleId === offline.recurringRules[0].id),
    ).toBe(true)

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

  it('recovers missing occurrences after a pendings publish fails and the client restarts', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const realPublish = trip.syncStore.publishIntentCommands.bind(trip.syncStore)
    let rejectPendings = true
    trip.syncStore.publishIntentCommands = async (intentId, commands) => {
      if (rejectPendings && commands.some((entry) => entry.step.startsWith('pending:'))) {
        rejectPendings = false
        return null
      }
      return realPublish(intentId, commands)
    }
    await useRecurringStore().addRule({
      type: 'expense',
      accountId,
      category: 'Ocio',
      description: 'Cuota con fallo local',
      amount: 25,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
    })
    // Only the rule command is queued when the publication is interrupted.
    expect(
      (await trip.pending()).some(
        (entry) =>
          (entry as { command: { entityType: string } }).command.entityType === 'pendingMovement',
      ),
    ).toBe(false)
    trip.syncStore.publishIntentCommands = realPublish

    // The restart resumes the accepted intent; the refreshed calendar must
    // not regenerate or duplicate what the intent already decided.
    await trip.reloadOffline()
    await useRecurringStore().refreshPending()
    await trip.reloadOffline()
    trip.setOffline(false)
    const reloaded = await trip.reload()
    expect(reloaded.recurringRules).toHaveLength(1)
    expect(reloaded.pendingMovements.map((item) => item.occurrenceDate).sort()).toEqual([
      '2026-09-01',
      '2026-10-01',
    ])
    // One create per occurrence reached the server, never two.
    const creates = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { action?: string; entityType?: string }).action === 'create' &&
          (command as { entityType?: string }).entityType === 'pendingMovement',
      )
    expect(creates).toHaveLength(2)
    expect(await trip.pending()).toEqual([])
  })

  it('keeps concurrent rule creation and shared category references after reload', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    trip.setOffline(true)
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    for (const description of ['Primera cuota', 'Segunda cuota']) {
      expect(
        await recurring.addRule({
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

  it("keeps a pending movement's type instead of calling it a gasto (§3.2c)", async () => {
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    await useRecurringStore().addRule({
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
    await recurring.addRule({
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
    const ok = await useRecurringStore().editPending(pmId, {
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
})

describe('round trip: cuenta de inversión destino', () => {
  let trip: RoundTrip
  let ids: { cash: string; crypto: string; bitvavo: string }

  beforeEach(async () => {
    trip = await startRoundTrip()
    const { useSettingsStore } = await import('../../../../src/stores/settings')
    const { useFinancialStateStore } = await import('../../../../src/stores/financial-state')
    const financialState = useFinancialStateStore()
    financialState.commitState((draft) => {
      draft.investmentCategories = ['Crypto']
    })
    const settings = useSettingsStore()
    settings.addEntity('accounts', 'Corriente', '0')
    settings.addEntity('investmentAssets', 'Crypto', '0')
    settings.addEntity('investmentAssets', 'Bitvavo', '0')
    const [crypto, bitvavo] = financialState.investmentAssets.map((asset) => asset.id)
    ids = { cash: financialState.accounts[0].id, crypto, bitvavo }
    await trip.reload()
  })

  afterEach(() => trip.cleanup())

  async function buy(destinationAccountId?: string) {
    const { useInvestmentStore } = await import('../../../../src/stores/investment')
    return useInvestmentStore().addMovement({
      date: '2026-09-12',
      time: '10:30',
      side: 'buy',
      symbol: 'ETH',
      category: 'Crypto',
      unitPrice: '100',
      units: '2',
      fee: '0',
      movementCurrency: 'EUR',
      accountId: ids.cash,
      declared: false,
      ...(destinationAccountId ? { destinationAccountId } : {}),
    })
  }

  it('keeps the investment account a purchase lands in after reload', async () => {
    expect(await buy(ids.bitvavo)).toBe(true)

    const reloaded = await trip.reload()

    expect(reloaded.transactions.find((tx) => tx.type === 'investment')).toMatchObject({
      accountId: ids.cash,
      destinationAccountId: ids.bitvavo,
    })
  })

  it('keeps the investment account when the movement is edited', async () => {
    const { useMovementsStore } = await import('../../../../src/stores/movements')
    await buy(ids.bitvavo)
    const first = await trip.reload()
    const movement = first.transactions.find((tx) => tx.type === 'investment')!

    useMovementsStore().saveEdit(movement.id, {
      date: '2026-09-13',
      accountId: ids.cash,
      type: 'investment',
      category: 'Crypto',
      description: 'Compra editada',
      amount: '200',
    })

    const reloaded = await trip.reload()
    expect(reloaded.transactions.find((tx) => tx.type === 'investment')).toMatchObject({
      date: '2026-09-13',
      destinationAccountId: ids.bitvavo,
    })
  })

  it('blocks deleting an investment account that a purchase lands in', async () => {
    const { useSettingsStore } = await import('../../../../src/stores/settings')
    await buy(ids.bitvavo)
    await trip.reload()

    useSettingsStore().removeEntity('investmentAssets', ids.bitvavo)

    const { useFinancialStateStore } = await import('../../../../src/stores/financial-state')
    expect(useFinancialStateStore().investmentAssets.map((asset) => asset.id)).toContain(
      ids.bitvavo,
    )
    const reloaded = await trip.reload()
    expect(reloaded.investmentAssets.map((asset) => asset.id)).toContain(ids.bitvavo)
    expect(reloaded.transactions.find((tx) => tx.type === 'investment')).toMatchObject({
      destinationAccountId: ids.bitvavo,
    })
  })

  it('refuses on the server a destination that is not an investment account', async () => {
    const { runWithDb } = await import('../../../../src/db/database')
    const transactionsRepository = await import('../../../../src/db/repositories/transactions')

    await expect(
      runWithDb(
        trip.testDb.db as never,
        transactionsRepository.create(trip.userId, {
          accountId: ids.cash,
          destinationAccountId: ids.cash,
          type: 'investment',
          date: '2026-09-12',
          amount: 100,
          currency: 'EUR',
        }),
      ),
    ).rejects.toThrow(/cuenta de inversión/)
  })

  it('does not store a destination on a type that has none', async () => {
    const { runWithDb } = await import('../../../../src/db/database')
    const transactionsRepository = await import('../../../../src/db/repositories/transactions')

    const row = await runWithDb(
      trip.testDb.db as never,
      transactionsRepository.create(trip.userId, {
        accountId: ids.cash,
        destinationAccountId: ids.bitvavo,
        type: 'expense',
        date: '2026-09-12',
        amount: 100,
        currency: 'EUR',
      }),
    )

    expect(row.destinationAccountId).toBeNull()
  })
})
