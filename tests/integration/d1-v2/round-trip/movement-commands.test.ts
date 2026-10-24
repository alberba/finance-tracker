import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as accounts from '../../../../src/db/repositories/accounts'
import { importOperation } from '../../../../src/db/repositories/bitvavo'
import * as market from '../../../../src/db/repositories/market'
import { listChangesSince } from '../../../../src/db/repositories/sync'
import type { Db } from '../../../../src/db/client'
import type { RemoteOperation } from '../../../../src/lib/bitvavo-types'
import { transactions } from '../../../../src/db/schema'
import { useFinancialStateStore } from '../../../../src/stores/financial-state'
import { useInvestmentStore } from '../../../../src/stores/investment'
import { useMovementsStore } from '../../../../src/stores/movements'
import { useRecurringStore } from '../../../../src/stores/recurring'
import { useSettingsStore } from '../../../../src/stores/settings'
import { useUiStore } from '../../../../src/stores/ui'
import { startRoundTrip, type RoundTrip } from './harness'

const accountId = 'movement-account'
const investmentInput = {
  date: '2026-09-12',
  time: '10:30',
  side: 'buy',
  symbol: 'VWCE',
  category: 'Acciones',
  unitPrice: '120.50',
  units: '10',
  fee: '1.20',
  movementCurrency: 'USD',
  accountId,
  declared: true,
}

describe('round trip: shared movement commands (#263)', () => {
  let trip: RoundTrip
  let instrumentId: string

  beforeEach(async () => {
    trip = await startRoundTrip(async (db, userId) => {
      await accounts.create(db, userId, {
        id: accountId,
        name: 'MyInvestor',
        kind: 'cash',
        currency: 'EUR',
        openingBalance: 0,
      })
      await accounts.createCategory(db, userId, { name: 'Acciones', kind: 'investment' })
      await accounts.createCategory(db, userId, { name: 'Fondos', kind: 'investment' })
      await accounts.createCategory(db, userId, { name: 'Ocio', kind: 'expense' })
      await accounts.createCategory(db, userId, { name: 'Nómina', kind: 'income' })
      const instrument = await market.createInstrument(db, {
        legacyId: 'legacy-vwce',
        symbol: 'VWCE',
        normalizedSymbol: 'VWCE',
        provider: 'yahoo',
        currency: 'USD',
      })
      instrumentId = 'legacy-vwce'
      await market.createUserInstrument(db, userId, {
        instrumentId: instrument.id,
        alias: accountId,
      })
      const canonicalInstrument = await market.createInstrument(db, {
        symbol: 'IWDA',
        normalizedSymbol: 'IWDA',
        provider: 'yahoo',
        currency: 'USD',
      })
      await market.createUserInstrument(db, userId, {
        instrumentId: canonicalInstrument.id,
        alias: accountId,
      })
    })
  })

  afterEach(() => trip.cleanup())

  it('keeps the accounting month chosen apart from the date after sync and reload (#337)', async () => {
    expect(
      useMovementsStore().addTransaction({
        date: '2026-01-31',
        month: 1,
        type: 'expense',
        accountId,
        category: 'Ocio',
        description: 'Cena',
        amount: 40,
      }),
    ).toBe(true)
    const created = await trip.reload()
    const id = created.transactions[0].id
    expect(created.transactions[0]).toMatchObject({ date: '2026-01-31', month: 1 })

    expect(
      useMovementsStore().saveEdit(id, {
        date: '2026-01-31',
        month: 0,
        accountId,
        type: 'expense',
        category: 'Ocio',
        description: 'Cena',
        amount: '40',
      }),
    ).toBe(true)
    const afterEdit = await trip.reload()
    expect(afterEdit.transactions[0]).toMatchObject({ month: 0 })
    expect((await trip.testDb.db.select().from(transactions))[0].accountingMonth).toBeNull()
  })

  it('maps the app month (0-11) to the stored month (1-12) and back for December (#337)', async () => {
    expect(
      useMovementsStore().addTransaction({
        date: '2026-11-30',
        month: 11,
        type: 'expense',
        accountId,
        category: 'Ocio',
        description: 'Regalo',
        amount: 20,
      }),
    ).toBe(true)
    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject({ month: 11 })
    expect((await trip.testDb.db.select().from(transactions))[0].accountingMonth).toBe(12)
  })

  it('keeps the operation, own currency, time and declaration when edited from Movimientos', async () => {
    expect(useInvestmentStore().addMovement(investmentInput)).toBe(true)
    const first = await trip.reload()
    const id = first.transactions[0].id
    const changes = await listChangesSince(trip.testDb.db as unknown as Db, trip.userId, 0)
    const createPayload = changes
      .filter((change) => change.entityType === 'transaction' && change.entityId === id)
      .flatMap((change) => (change.payload ? [JSON.parse(change.payload)] : []))
      .find((payload) => payload.tradeDetail)
    expect(createPayload).toMatchObject({
      tradeDetail: {
        symbol: 'VWCE',
        side: 'buy',
        quantity: '10',
        price: 120.5,
        fee: 1.2,
        currency: 'USD',
      },
    })

    await trip.asOtherDevice([
      {
        commandId: 'remote-movement-description',
        action: 'update',
        entityType: 'transaction',
        entityId: id,
        baseVersion: 1,
        patch: { description: 'Compra desde otro dispositivo' },
      },
    ])
    await trip.syncStore.syncNow()
    expect(useFinancialStateStore().transactions[0]).toMatchObject({
      description: 'Compra desde otro dispositivo',
      symbol: 'VWCE',
      side: 'buy',
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
    })

    expect(
      useMovementsStore().saveEdit(id, {
        date: '2026-09-13',
        accountId,
        type: 'investment',
        category: 'Acciones',
        description: 'Compra revisada',
        amount: '1206.20',
      }),
    ).toBe(true)

    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject({
      id,
      description: 'Compra revisada',
      time: '10:30',
      declared: true,
      movementCurrency: 'USD',
      symbol: 'VWCE',
      side: 'buy',
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
      instrumentId,
    })
  })

  it('keeps time and declaration when converted to expense, and removes only the operation', async () => {
    useInvestmentStore().addMovement(investmentInput)
    const first = await trip.reload()
    const id = first.transactions[0].id
    expect(
      useMovementsStore().saveEdit(id, {
        date: '2026-09-12',
        accountId,
        type: 'expense',
        category: 'Ocio',
        description: 'Gasto reclasificado',
        amount: '1206.20',
      }),
    ).toBe(true)

    expect(useFinancialStateStore().transactions[0]).toMatchObject({
      time: '10:30',
      declared: true,
    })
    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject({
      type: 'expense',
      time: '10:30',
      declared: true,
      movementCurrency: 'USD',
    })
    expect(reloaded.transactions[0]).not.toHaveProperty('units')
    expect(reloaded.transactions[0]).not.toHaveProperty('symbol')
  })

  it.each(['absent', 'partial', 'invalid', 'inferred side'])(
    'keeps the stored operation when the local operation is %s',
    async (availability) => {
      const side = availability === 'inferred side' ? 'sell' : 'buy'
      useInvestmentStore().addMovement({ ...investmentInput, side })
      const first = await trip.reload()
      const id = first.transactions[0].id
      // A partially reconstructed client snapshot must not turn missing data into a deletion.
      useFinancialStateStore().commitState((draft) => {
        const movement = draft.transactions[0]
        if (availability === 'absent') {
          delete movement.side
          delete movement.units
          delete movement.unitPrice
        } else if (availability === 'partial') {
          delete movement.unitPrice
        } else if (availability === 'invalid') {
          movement.units = NaN
        } else {
          delete movement.side
        }
      })
      useMovementsStore().saveEdit(id, {
        date: '2026-09-12',
        accountId,
        type: 'investment',
        category: 'Acciones',
        description: 'Compra sin información local completa',
        amount: '1206.20',
      })

      const reloaded = await trip.reload()
      expect(reloaded.transactions[0]).toMatchObject({
        symbol: 'VWCE',
        side,
        units: 10,
        unitPrice: 120.5,
        fee: 1.2,
      })
    },
  )

  it('keeps an investment without an operation and its own currency after reload', async () => {
    useMovementsStore().addTransaction({
      date: '2026-09-12',
      month: 8,
      type: 'investment',
      accountId,
      category: 'Acciones',
      description: 'Inversión sin operación',
      amount: 100,
    })
    const first = await trip.reload()
    useFinancialStateStore().commitState((draft) => {
      draft.transactions[0].movementCurrency = 'USD'
    })
    useMovementsStore().saveEdit(first.transactions[0].id, {
      date: '2026-09-12',
      accountId,
      type: 'investment',
      category: 'Acciones',
      description: 'Inversión revisada sin operación',
      amount: '100',
    })

    const reloaded = await trip.reload()
    expect(reloaded.transactions[0].movementCurrency).toBe('USD')
    expect(reloaded.transactions[0]).not.toHaveProperty('side')
    expect(reloaded.transactions[0]).not.toHaveProperty('units')
    expect(reloaded.transactions[0]).not.toHaveProperty('unitPrice')
  })

  it('does not invent an operation when an expense becomes an investment', async () => {
    useMovementsStore().addTransaction({
      date: '2026-09-12',
      month: 8,
      type: 'expense',
      accountId,
      category: 'Ocio',
      description: 'Gasto',
      amount: 100,
    })
    const first = await trip.reload()
    useMovementsStore().saveEdit(first.transactions[0].id, {
      date: '2026-09-12',
      accountId,
      type: 'investment',
      category: 'Acciones',
      description: 'Inversión sin compra',
      amount: '100',
    })
    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject({ type: 'investment', amount: 100 })
    expect(reloaded.transactions[0]).not.toHaveProperty('side')
    expect(reloaded.transactions[0]).not.toHaveProperty('units')
    expect(reloaded.transactions[0]).not.toHaveProperty('unitPrice')
  })

  it('keeps both buy and sell operations during bulk account and category edits', async () => {
    useInvestmentStore().addMovement(investmentInput)
    await trip.reload()
    useInvestmentStore().addMovement({ ...investmentInput, symbol: 'IWDA', side: 'sell' })
    const first = await trip.reload()
    useSettingsStore().addEntity('accounts', 'Otro broker', '0')
    const targetAccount = useFinancialStateStore().accounts.find(
      (account) => account.name === 'Otro broker',
    )!
    await trip.reload()
    useUiStore().ui.txSelectedIds = first.transactions.map((movement) => movement.id)
    useMovementsStore().applyBulkChanges({
      type: '',
      accountId: targetAccount.id,
      category: 'Fondos',
    })

    const reloaded = await trip.reload()
    expect(reloaded.transactions).toHaveLength(2)
    for (const original of first.transactions) {
      expect(reloaded.transactions.find((movement) => movement.id === original.id)).toMatchObject({
        accountId: targetAccount.id,
        category: 'Fondos',
        symbol: original.symbol,
        instrumentId: original.instrumentId,
        side: original.side,
        units: 10,
        unitPrice: 120.5,
        fee: 1.2,
        time: '10:30',
        declared: true,
        movementCurrency: 'USD',
      })
    }
  })

  it('confirms a pending purchase with its operation and time', async () => {
    await trip.asOtherDevice([
      {
        commandId: 'seed-rule',
        action: 'create',
        entityType: 'recurringRule',
        data: {
          id: 'purchase-rule',
          name: 'Compra recurrente',
          type: 'investment',
          accountId,
          amount: 1206.2,
          currency: 'EUR',
          frequency: 'monthly',
          startDate: '2026-09-12',
          nextRunDate: '2026-10-12',
        },
      },
      {
        commandId: 'seed-pending',
        action: 'create',
        entityType: 'pendingMovement',
        data: {
          id: 'pending-purchase',
          recurringRuleId: 'purchase-rule',
          accountId,
          amount: 1206.2,
          currency: 'EUR',
          dueDate: '2026-09-12',
          type: 'investment',
          description: 'Compra recurrente',
          symbol: 'VWCE',
          side: 'buy',
          units: 10,
          unitPrice: 120.5,
          fee: 1.2,
          time: '10:30',
        },
      },
    ])
    await trip.reload()
    expect(useRecurringStore().confirmPending('pending-purchase')).toBe(true)
    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject({
      symbol: 'VWCE',
      side: 'buy',
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
      time: '10:30',
      declared: false,
    })
    expect(reloaded.pendingMovements[0].status).toBe('confirmed')
  })

  it('persists an offline edit through a restart and later synchronization', async () => {
    useInvestmentStore().addMovement(investmentInput)
    const first = await trip.reload()
    trip.setOffline(true)
    useMovementsStore().saveEdit(first.transactions[0].id, {
      date: '2026-09-12',
      accountId,
      type: 'investment',
      category: 'Acciones',
      description: 'Compra editada sin conexión',
      amount: '1206.20',
    })
    const offline = await trip.reloadOffline()
    expect(offline.transactions[0]).toMatchObject({
      description: 'Compra editada sin conexión',
      movementCurrency: 'USD',
      time: '10:30',
      declared: true,
      symbol: 'VWCE',
      side: 'buy',
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
    })
    trip.setOffline(false)
    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject(offline.transactions[0])
  })

  it('can reference an account still awaiting server confirmation', async () => {
    trip.setOffline(true)
    useSettingsStore().addEntity('accounts', 'Cuenta sin conexión', '0')
    const pendingAccountId = useFinancialStateStore().accounts.find(
      (account) => account.name === 'Cuenta sin conexión',
    )!.id
    useInvestmentStore().addMovement({ ...investmentInput, accountId: pendingAccountId })
    const offline = await trip.reloadOffline()
    expect(offline.transactions[0]).toMatchObject({ accountId: pendingAccountId, units: 10 })
    trip.setOffline(false)
    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject({
      accountId: pendingAccountId,
      symbol: 'VWCE',
      units: 10,
    })
    expect(await trip.pending()).toEqual([])
  })

  it('skips a command when its required account cannot be resolved', async () => {
    useInvestmentStore().addMovement({ ...investmentInput, accountId: 'unresolved-account' })
    const reloaded = await trip.reload()
    expect(reloaded.transactions).toEqual([])
    expect(await trip.pending()).toEqual([])
  })

  it('shows the edited operation after an offline restart', async () => {
    useInvestmentStore().addMovement(investmentInput)
    const first = await trip.reload()
    trip.setOffline(true)
    expect(
      useInvestmentStore().saveEditedMovement(first.transactions[0].id, {
        ...investmentInput,
        side: 'sell',
        units: '2',
        unitPrice: '50',
        fee: '2',
        time: '11:45',
        declared: false,
      }),
    ).toBe(true)
    const offline = await trip.reloadOffline()
    expect(offline.transactions[0]).toMatchObject({
      symbol: 'VWCE',
      side: 'sell',
      units: 2,
      unitPrice: 50,
      fee: 2,
      amount: -98,
      movementCurrency: 'USD',
      time: '11:45',
      declared: false,
      instrumentId,
    })
    trip.setOffline(false)
    expect((await trip.reload()).transactions[0]).toMatchObject(offline.transactions[0])
  })

  it('preserves an offline queued create when its local operation becomes incomplete', async () => {
    trip.setOffline(true)
    useInvestmentStore().addMovement(investmentInput)
    await vi.waitFor(async () => expect(await trip.pending()).toHaveLength(1))
    const movement = useFinancialStateStore().transactions[0]
    useFinancialStateStore().commitState((draft) => {
      delete draft.transactions[0].side
      delete draft.transactions[0].units
      delete draft.transactions[0].unitPrice
    })
    useMovementsStore().saveEdit(movement.id, {
      date: movement.date,
      accountId,
      type: 'investment',
      category: 'Acciones',
      description: 'Compra actualizada sin conexión',
      amount: '1206.20',
    })

    const offline = await trip.reloadOffline()
    expect(offline.transactions[0]).toMatchObject({
      description: 'Compra actualizada sin conexión',
      symbol: 'VWCE',
      side: 'buy',
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
      movementCurrency: 'USD',
    })
    trip.setOffline(false)
    expect((await trip.reload()).transactions[0]).toMatchObject(offline.transactions[0])
  })

  it.each(['income', 'expense'] as const)('edits an ordinary %s', async (type) => {
    useMovementsStore().addTransaction({
      date: '2026-09-12',
      month: 8,
      type,
      accountId,
      category: type === 'income' ? 'Nómina' : 'Ocio',
      description: 'Movimiento ordinario',
      amount: 100,
    })
    const first = await trip.reload()
    const id = first.transactions[0].id
    useMovementsStore().saveEdit(id, {
      date: '2026-09-13',
      accountId,
      type,
      category: type === 'income' ? 'Nómina' : 'Ocio',
      description: 'Movimiento corregido',
      amount: '200',
    })
    const edited = await trip.reload()
    expect(edited.transactions[0]).toMatchObject({
      id,
      type,
      amount: 200,
      description: 'Movimiento corregido',
    })
  })
  it.each(['income', 'expense'] as const)('creates an ordinary %s', async (type) => {
    useMovementsStore().addTransaction({
      date: '2026-09-12',
      month: 8,
      type,
      accountId,
      category: type === 'income' ? 'Nómina' : 'Ocio',
      description: 'Movimiento ordinario',
      amount: 100,
    })
    const reloaded = await trip.reload()
    expect(reloaded.transactions).toHaveLength(1)
    expect(reloaded.transactions[0]).toMatchObject({
      type,
      accountId,
      amount: 100,
      description: 'Movimiento ordinario',
    })
  })

  it.each(['income', 'expense', 'investment'] as const)(
    'deletes a %s and its operation',
    async (type) => {
      if (type === 'investment') {
        useInvestmentStore().addMovement(investmentInput)
      } else {
        useMovementsStore().addTransaction({
          date: '2026-09-12',
          month: 8,
          type,
          accountId,
          category: type === 'income' ? 'Nómina' : 'Ocio',
          description: 'Movimiento ordinario',
          amount: 100,
        })
      }
      const first = await trip.reload()
      useMovementsStore().deleteTransaction(first.transactions[0].id)
      expect((await trip.reload()).transactions).toEqual([])
    },
  )
})

describe('round trip: imported movement protections (#263)', () => {
  let trip: RoundTrip
  const remoteOperation: RemoteOperation = {
    provider: 'bitvavo',
    externalId: 'remote-purchase',
    executedAt: '2026-09-12T08:30:15Z',
    timeZone: 'Europe/Madrid',
    date: '2026-09-12',
    time: '10:30:15',
    side: 'buy',
    symbol: 'BTC',
    quantity: '0.00008878285',
    unitPrice: '76953',
    fee: '0.01789334395',
    cashAmount: '6.85',
    currency: 'EUR',
  }

  beforeEach(async () => {
    trip = await startRoundTrip(async (db, userId) => {
      await accounts.create(db, userId, {
        id: accountId,
        name: 'Bitvavo',
        kind: 'cash',
        currency: 'EUR',
        openingBalance: 0,
      })
      await importOperation(db, userId, accountId, remoteOperation, null)
    })
  })
  afterEach(() => trip.cleanup())

  it('synchronizes declaration changes without sending immutable financial fields', async () => {
    const id = useFinancialStateStore().transactions[0].id
    useInvestmentStore().toggleDeclared(id)
    const reloaded = await trip.reload()
    expect(reloaded.transactions[0]).toMatchObject({
      id,
      declared: true,
      amount: 6.85,
      remoteOperation,
    })
  })

  it.each([
    {
      action: 'editing from Movimientos',
      expectedResult: false,
      run: (id: string) =>
        useMovementsStore().saveEdit(id, {
          date: '2026-09-12',
          accountId,
          type: 'expense',
          category: 'Ocio',
          description: 'Forbidden edit',
          amount: '100',
        }),
    },
    {
      action: 'editing from Inversión',
      expectedResult: false,
      run: (id: string) => useInvestmentStore().saveEditedMovement(id, investmentInput),
    },
    {
      action: 'deleting from Movimientos',
      expectedResult: undefined,
      run: (id: string) => useMovementsStore().deleteTransaction(id),
    },
    {
      action: 'deleting from Inversión',
      expectedResult: undefined,
      run: (id: string) => useInvestmentStore().deleteMovement(id),
    },
    {
      action: 'bulk editing',
      expectedResult: undefined,
      run: (id: string) => {
        useUiStore().ui.txSelectedIds = [id]
        useMovementsStore().applyBulkChanges({ type: 'expense', accountId: '', category: 'Ocio' })
      },
    },
    {
      action: 'bulk deleting',
      expectedResult: undefined,
      run: (id: string) => {
        useUiStore().ui.txSelectedIds = [id]
        useMovementsStore().deleteSelected()
      },
    },
  ])('$action preserves the imported movement', async ({ run, expectedResult }) => {
    const original = useFinancialStateStore().transactions[0]
    expect(run(original.id)).toBe(expectedResult)
    expect((await trip.reload()).transactions).toEqual([original])
    expect(await trip.pending()).toEqual([])
  })
})
