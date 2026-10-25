// @vitest-environment happy-dom
/**
 * Round trip for ahorro — a movement type with a destination cash account
 * (ADR 0007). The destination travels inside the movement's own command, so
 * it has to survive create, edit, a type change, recurring rules and pending
 * movements, and it must keep its account from being deleted.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runWithDb } from '../../../../src/db/database'
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

/** Lets the fire-and-forget enqueue of a store action finish before the outbox is drained. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

/** The user creating the category in Configuración, which is what a goal needs first. */
async function createSavingCategory(trip: RoundTrip, name: string) {
  const { useSettingsStore } = await import('../../../../src/stores/settings')
  useSettingsStore().addCategory('savingCategories', name)
  await settled()
  await trip.reload()
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
      month: 9,
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
      computeAccountBalance(id, 9, reloaded.accounts, reloaded.transactions, {})

    expect(balance(ids.origin)).toBe(700)
    expect(balance(ids.destination)).toBe(300)
  })

  it('rejects a saving to its own origin or to a non-cash account before queueing', async () => {
    const { useMovementsStore } = await import('../../../../src/stores/movements')
    const input = {
      date: '2026-09-12',
      month: 9 as const,
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
    const rows = await runWithDb(trip.testDb.db as never, accountsRepository.listByUser(trip.userId))
    const hucha = rows.find((row) => row.name === 'Hucha')!

    await expect(
      runWithDb(trip.testDb.db as never, accountsRepository.remove(trip.userId, hucha.id)),
    ).rejects.toThrow()
  })

  it('keeps a savings goal tied to its category and sums earlier savings', async () => {
    const { useGoalsStore } = await import('../../../../src/stores/goals')
    await addSaving(250)
    await trip.reload()

    expect(
      useGoalsStore().addSavingGoal({
        name: 'Colchón',
        category: 'Fondo de emergencia',
        targetAmount: 1000,
      }),
    ).toBe(true)

    const reloaded = await trip.reload()
    expect(reloaded.savingGoals).toMatchObject([
      { name: 'Colchón', category: 'Fondo de emergencia', targetAmount: 1000 },
    ])
    const { buildSavingGoals } = await import('../../../../src/domain/goals/view-model')
    expect(buildSavingGoals(reloaded)[0]).toMatchObject({ saved: 250, progress: 25 })
  })

  it('does not mix savings goals into the fixed wealth goals', async () => {
    const { useGoalsStore } = await import('../../../../src/stores/goals')
    await createSavingCategory(trip, 'Fondo de emergencia')
    useGoalsStore().addSavingGoal({
      name: 'Colchón',
      category: 'Fondo de emergencia',
      targetAmount: 1000,
    })
    await settled()
    const reloaded = await trip.reload()
    expect(Object.keys(reloaded.goals)).not.toContain('saving')
    expect(reloaded.savingGoals).toHaveLength(1)
  })

  it('refuses a goal whose category is not a saving category on the server', async () => {
    const goalsRepository = await import('../../../../src/db/repositories/goals')
    const accountsRepository = await import('../../../../src/db/repositories/accounts')
    const db = trip.testDb.db as never
    const expense = await runWithDb(db, accountsRepository.createCategory(trip.userId, {
      name: 'Comida',
      kind: 'expense',
    }))

    await expect(
      runWithDb(db, goalsRepository.create(trip.userId, {
        key: 'saving:x',
        categoryId: expense.id,
        name: 'No',
        targetAmount: 10,
        currency: 'EUR',
      })),
    ).rejects.toThrow(/categoría de ahorro/)
  })

  it('keeps a category from being removed while a savings goal uses it', async () => {
    const { useGoalsStore } = await import('../../../../src/stores/goals')
    const { useSettingsStore } = await import('../../../../src/stores/settings')
    await createSavingCategory(trip, 'Fondo de emergencia')
    useGoalsStore().addSavingGoal({
      name: 'Colchón',
      category: 'Fondo de emergencia',
      targetAmount: 1000,
    })
    await settled()
    await trip.reload()

    useSettingsStore().removeCategory('savingCategories', 'Fondo de emergencia')

    const reloaded = await trip.reload()
    expect(reloaded.savingCategories).toContain('Fondo de emergencia')
  })

  it('keeps a savings goal edit and its deletion through sync', async () => {
    const { useGoalsStore } = await import('../../../../src/stores/goals')
    await createSavingCategory(trip, 'Fondo de emergencia')
    expect(
      useGoalsStore().addSavingGoal({
        name: 'Colchón',
        category: 'Fondo de emergencia',
        targetAmount: 1000,
      }),
    ).toBe(true)
    await settled()
    const created = await trip.reload()
    const id = created.savingGoals[0].id

    useGoalsStore().updateSavingGoal(id, {
      name: 'Colchón de dos meses',
      category: 'Fondo de emergencia',
      targetAmount: 2400,
    })
    await settled()
    const edited = await trip.reload()
    expect(edited.savingGoals).toMatchObject([
      { name: 'Colchón de dos meses', category: 'Fondo de emergencia', targetAmount: 2400 },
    ])

    useGoalsStore().removeSavingGoal(id)
    await settled()
    const removed = await trip.reload()
    expect(removed.savingGoals).toHaveLength(0)
  })

  it('refuses a saving rule or pending without a destination on the server', async () => {
    const rulesRepository = await import('../../../../src/db/repositories/recurring-rules')
    const pendingRepository = await import('../../../../src/db/repositories/pending-movements')
    const accountsRepository = await import('../../../../src/db/repositories/accounts')
    const db = trip.testDb.db as never
    const rows = await runWithDb(db, accountsRepository.listByUser(trip.userId))
    const origin = rows.find((row) => row.name === 'Corriente')!
    const destination = rows.find((row) => row.name === 'Hucha')!

    await expect(
      runWithDb(db, rulesRepository.create(trip.userId, {
        name: 'Ahorro sin destino',
        type: 'saving',
        accountId: origin.id,
        amount: 100,
        currency: 'EUR',
        frequency: 'monthly',
      })),
    ).rejects.toThrow(/cuenta destino/)

    const rule = await runWithDb(db, rulesRepository.create(trip.userId, {
      name: 'Ahorro mensual',
      type: 'saving',
      accountId: origin.id,
      destinationAccountId: destination.id,
      amount: 100,
      currency: 'EUR',
      frequency: 'monthly',
    }))

    await expect(
      runWithDb(db, pendingRepository.create(trip.userId, {
        recurringRuleId: rule.id,
        type: 'saving',
        accountId: origin.id,
        amount: 100,
        currency: 'EUR',
        dueDate: '2026-10-01',
      })),
    ).rejects.toThrow(/cuenta destino/)

    await expect(
      runWithDb(db, rulesRepository.update(trip.userId, rule.id, { destinationAccountId: null })),
    ).rejects.toThrow(/cuenta destino/)
  })
})
