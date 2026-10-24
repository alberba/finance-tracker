// @vitest-environment happy-dom
/**
 * Round trip for ahorro — a movement type with a destination cash account
 * (ADR 0006). The destination travels inside the movement's own command, so
 * it has to survive create, edit, a type change, recurring rules and pending
 * movements, and it must keep its account from being deleted.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startRoundTrip, type RoundTrip } from './harness'

async function seed(trip: RoundTrip) {
  const { useSettingsStore } = await import('../../../../src/stores/settings')
  const { useFinancialStateStore } = await import('../../../../src/stores/financial-state')
  const financialState = useFinancialStateStore()
  financialState.commitState((draft) => {
    draft.savingCategories = ['Fondo de emergencia']
    draft.expenseCategories = ['Ocio']
  })
  const settings = useSettingsStore()
  settings.addEntity('accounts', 'Corriente', '1000')
  settings.addEntity('accounts', 'Hucha', '0')
  settings.addEntity('investmentAssets', 'Broker', '0')
  const [origin, destination] = financialState.accounts.map((account) => account.id)
  const broker = financialState.investmentAssets[0].id
  await trip.reload()
  return { origin, destination, broker }
}

describe('round trip: ahorro', () => {
  let trip: RoundTrip
  let ids: { origin: string; destination: string; broker: string }

  beforeEach(async () => {
    trip = await startRoundTrip()
    ids = await seed(trip)
  })

  afterEach(() => {
    trip.cleanup()
    delete (window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__
  })

  async function addSaving(amount = 200) {
    const { useMovementsStore } = await import('../../../../src/stores/movements')
    return useMovementsStore().addTransaction({
      date: '2026-09-12',
      month: 8,
      type: 'saving',
      accountId: ids.origin,
      destinationAccountId: ids.destination,
      category: 'Fondo de emergencia',
      description: 'Ahorro',
      amount,
    })
  }

  it('keeps origin and destination of a saving after reload', async () => {
    expect(await addSaving()).toBe(true)

    const reloaded = await trip.reload()

    expect(reloaded.transactions[0]).toMatchObject({
      type: 'saving',
      accountId: ids.origin,
      destinationAccountId: ids.destination,
      amount: 200,
    })
  })

  it('moves the balance from origin to destination without touching the total', async () => {
    await addSaving(300)
    const reloaded = await trip.reload()
    const { computeAccountBalance } = await import('../../../../src/lib/finance-core')
    const balance = (id: string) =>
      computeAccountBalance(id, 8, reloaded.accounts, reloaded.transactions, {})

    expect(balance(ids.origin)).toBe(700)
    expect(balance(ids.destination)).toBe(300)
  })

  it('rejects a saving to its own origin or to a non-cash account before queueing', async () => {
    const { useMovementsStore } = await import('../../../../src/stores/movements')
    const input = {
      date: '2026-09-12',
      month: 8,
      type: 'saving' as const,
      accountId: ids.origin,
      category: 'Fondo de emergencia',
      description: 'Ahorro',
      amount: 50,
    }

    expect(useMovementsStore().addTransaction({ ...input, destinationAccountId: ids.origin })).toBe(
      false,
    )
    expect(useMovementsStore().addTransaction({ ...input, destinationAccountId: ids.broker })).toBe(
      false,
    )
    expect((await trip.reload()).transactions).toHaveLength(0)
  })

  it('refuses a saving the server sees with the same origin and destination', async () => {
    await trip.asOtherDevice([
      {
        commandId: 'bad-saving',
        action: 'create',
        entityType: 'transaction',
        data: {
          id: 'bad-saving-tx',
          accountId: 'x',
          destinationAccountId: 'x',
          type: 'saving',
          date: '2026-09-12',
          amount: 10,
          currency: 'EUR',
        },
      },
    ])
    expect((await trip.reload()).transactions).toHaveLength(0)
  })

  it('drops the destination when a saving becomes an expense', async () => {
    const { useMovementsStore } = await import('../../../../src/stores/movements')
    await addSaving()
    const first = await trip.reload()

    useMovementsStore().saveEdit(first.transactions[0].id, {
      date: '2026-09-12',
      accountId: ids.origin,
      type: 'expense',
      category: 'Ocio',
      description: 'Ya no es ahorro',
      amount: '200',
    })

    const reloaded = await trip.reload()
    expect(reloaded.transactions[0].type).toBe('expense')
    expect(reloaded.transactions[0]).not.toHaveProperty('destinationAccountId')
  })

  it('changes the destination of an existing saving', async () => {
    const { useMovementsStore } = await import('../../../../src/stores/movements')
    const { useSettingsStore } = await import('../../../../src/stores/settings')
    const { useFinancialStateStore } = await import('../../../../src/stores/financial-state')
    useSettingsStore().addEntity('accounts', 'Otra', '0')
    const other = useFinancialStateStore().accounts.at(-1)!.id
    await trip.reload()
    await addSaving()
    const first = await trip.reload()

    useMovementsStore().saveEdit(first.transactions[0].id, {
      date: '2026-09-12',
      accountId: ids.origin,
      destinationAccountId: other,
      type: 'saving',
      category: 'Fondo de emergencia',
      description: 'Ahorro',
      amount: '200',
    })

    const reloaded = await trip.reload()
    expect(reloaded.transactions[0].destinationAccountId).toBe(other)
  })

  it('creates the saving from a recurring rule and confirms its pending', async () => {
    Object.assign(window, { __FINANCE_TODAY__: '2026-10-01' })
    const { useRecurringStore } = await import('../../../../src/stores/recurring')
    const recurring = useRecurringStore()
    expect(
      recurring.addRule({
        type: 'saving',
        accountId: ids.origin,
        destinationAccountId: ids.destination,
        category: 'Fondo de emergencia',
        description: 'Ahorro mensual',
        amount: 100,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-10-01',
      }),
    ).toBe(true)

    const withPending = await trip.reload()
    expect(withPending.recurringRules[0]).toMatchObject({
      type: 'saving',
      destinationAccountId: ids.destination,
    })
    expect(withPending.pendingMovements[0]).toMatchObject({
      type: 'saving',
      destinationAccountId: ids.destination,
    })

    // A reloaded page has new stores; the pre-reload instance is gone.
    expect(useRecurringStore().confirmPending(withPending.pendingMovements[0].id)).toBe(true)
    const confirmed = await trip.reload()
    expect(confirmed.transactions[0]).toMatchObject({
      type: 'saving',
      accountId: ids.origin,
      destinationAccountId: ids.destination,
      amount: 100,
    })
  })

  it('blocks deleting an account that is the destination of a saving', async () => {
    const { useSettingsStore } = await import('../../../../src/stores/settings')
    await addSaving()
    await trip.reload()

    useSettingsStore().removeEntity('accounts', ids.destination)

    const reloaded = await trip.reload()
    expect(reloaded.accounts.map((account) => account.id)).toContain(ids.destination)
  })

  it('also refuses it on the server', async () => {
    await addSaving()
    await trip.reload()
    const accountsRepository = await import('../../../../src/db/repositories/accounts')
    const rows = await accountsRepository.listByUser(trip.testDb.db as never, trip.userId)
    const hucha = rows.find((row) => row.name === 'Hucha')!

    await expect(
      accountsRepository.remove(trip.testDb.db as never, trip.userId, hucha.id),
    ).rejects.toThrow()
  })
})
