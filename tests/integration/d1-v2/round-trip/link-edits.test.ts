import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useFinancialStateStore } from '../../../../src/stores/financial-state'
import { useInvestmentStore } from '../../../../src/stores/investment'
import { useMarketStore } from '../../../../src/stores/market'
import { useMovementsStore } from '../../../../src/stores/movements'
import { useSyncStore } from '../../../../src/stores/sync'
import {
  openStorage,
  readMovementPublications,
  type TestStorage,
} from '../../../helpers/client-storage'
import {
  addLinkInstrument,
  LINK_CASH_ID as CASH_ID,
  seedLinkMovement,
  startRoundTrip,
  type RoundTrip,
} from './harness'

describe('vinculación que respeta las ediciones posteriores (#489)', () => {
  let trip: RoundTrip
  let targetId: string

  beforeEach(async () => {
    trip = await startRoundTrip(seedLinkMovement)
    const seeded = await trip.reload()
    targetId = seeded.transactions[0].id
  })

  afterEach(() => trip.cleanup())

  it('publica los valores actuales de los objetivos fijados al solicitar Vincular', async () => {
    const instrumentId = await addLinkInstrument()
    const held = trip.holdSync()
    expect((await useMarketStore().linkExistingMovements(instrumentId)).targets).toBe(1)

    useInvestmentStore().saveEditedMovement(targetId, {
      date: '2026-01-15',
      time: '11:45',
      side: 'buy',
      symbol: 'LINK',
      category: 'Link Asset',
      unitPrice: '40',
      units: '5',
      fee: '2',
      movementCurrency: 'EUR',
      accountId: CASH_ID,
      declared: true,
    })
    // Created after Vincular was requested: it matches the instrument, but the
    // fixed target set must leave it out.
    useMovementsStore().addTransaction({
      date: '2026-01-16',
      month: 1,
      type: 'investment',
      accountId: CASH_ID,
      category: 'Link Asset',
      description: 'Compra tardía',
      amount: 50,
    })

    const edited = useFinancialStateStore().transactions.find((item) => item.id === targetId)!
    held.release()
    const state = await trip.reload()

    expect(state.transactions.find((item) => item.id === targetId)).toMatchObject({
      description: edited.description,
      amount: edited.amount,
      instrumentId,
      units: 5,
      unitPrice: 40,
      fee: 2,
      time: '11:45',
      declared: true,
      movementCurrency: 'EUR',
    })
    const late = state.transactions.find((item) => item.description === 'Compra tardía')
    expect(late).toBeDefined()
    expect(late?.instrumentId).toBeUndefined()
  })

  it('no restaura un objetivo borrado durante la resolución', async () => {
    const instrumentId = await addLinkInstrument()
    const held = trip.holdSync()
    expect((await useMarketStore().linkExistingMovements(instrumentId)).targets).toBe(1)

    useMovementsStore().deleteTransaction(targetId)

    held.release()
    const state = await trip.reload()

    expect(state.transactions).toEqual([])
    expect(useSyncStore().lastError).toBeNull()
  })

  it('no revincula un objetivo convertido a un tipo incompatible', async () => {
    const instrumentId = await addLinkInstrument()
    const held = trip.holdSync()
    expect((await useMarketStore().linkExistingMovements(instrumentId)).targets).toBe(1)

    useMovementsStore().saveEdit(targetId, {
      date: '2026-01-15',
      month: 1,
      accountId: CASH_ID,
      type: 'expense',
      category: 'Link Asset',
      description: 'Gasto reclasificado',
      amount: '90',
    })

    held.release()
    const state = await trip.reload()

    expect(state.transactions.find((item) => item.id === targetId)).toMatchObject({
      type: 'expense',
      description: 'Gasto reclasificado',
    })
    expect(state.transactions.find((item) => item.id === targetId)?.instrumentId).toBeUndefined()
  })

  it('respeta un desvínculo explícito posterior al solicitar Vincular', async () => {
    const instrumentId = await addLinkInstrument()
    const held = trip.holdSync()
    expect((await useMarketStore().linkExistingMovements(instrumentId)).targets).toBe(1)

    useInvestmentStore().saveEditedMovement(targetId, {
      date: '2026-01-15',
      time: '09:30',
      side: 'buy',
      symbol: 'OTHER',
      category: 'Link Asset',
      unitPrice: '100',
      units: '2',
      fee: '1',
      movementCurrency: 'EUR',
      accountId: CASH_ID,
      declared: false,
    })

    held.release()
    const state = await trip.reload()

    expect(state.transactions.find((item) => item.id === targetId)).toMatchObject({
      symbol: 'OTHER',
    })
    expect(state.transactions.find((item) => item.id === targetId)?.instrumentId).toBeUndefined()
  })

  it('relee el movimiento ante un conflicto antes de generar otro intento', async () => {
    const instrumentId = await addLinkInstrument()
    // Hold the batch that carries the link's movement update, after the
    // configuration has already reached the server.
    const held = trip.holdSync((commands) =>
      (commands as Array<{ entityType?: string; action?: string }>).some(
        (command) => command.entityType === 'transaction' && command.action === 'update',
      ),
    )
    expect((await useMarketStore().linkExistingMovements(instrumentId)).targets).toBe(1)
    // The link has already built its command from the current movement; the
    // other device moves the server row before that command lands.
    await held.entered

    await trip.asOtherDevice([
      {
        commandId: 'remote-link-description',
        action: 'update',
        entityType: 'transaction',
        entityId: targetId,
        baseVersion: 1,
        patch: { description: 'Compra desde otro dispositivo' },
      },
    ])
    held.release()

    const state = await trip.reload()
    expect(state.transactions.find((item) => item.id === targetId)).toMatchObject({
      id: targetId,
      description: 'Compra desde otro dispositivo',
      instrumentId,
    })
    expect(useSyncStore().lastError).toBeNull()

    // The retry is a new command identity: the conflicted attempt is never
    // replayed under its old id (nor re-sent with its old payload).
    const updateIds = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { entityType?: string; action?: string }).entityType === 'transaction' &&
          (command as { action?: string }).action === 'update',
      )
      .map((command) => (command as { commandId: string }).commandId)
    expect(updateIds.length).toBeGreaterThanOrEqual(2)
    expect(new Set(updateIds).size).toBe(updateIds.length)
  })

  it('todos los caminos de escritura de movimientos avanzan la generación persistida', async () => {
    useMovementsStore().addTransaction({
      date: '2026-01-20',
      month: 1,
      type: 'expense',
      accountId: CASH_ID,
      category: 'Link Asset',
      description: 'Gasto',
      amount: 10,
    })
    let state = await trip.reload()
    const expenseId = state.transactions.find((item) => item.description === 'Gasto')!.id
    let storage: TestStorage = await openStorage(trip.userId)
    try {
      expect((await readMovementPublications(storage, [expenseId])).get(expenseId)).toMatchObject({
        generation: 1,
        status: 'active',
      })
    } finally {
      storage.close()
    }

    useMovementsStore().saveEdit(expenseId, {
      date: '2026-01-21',
      month: 1,
      accountId: CASH_ID,
      type: 'expense',
      category: 'Link Asset',
      description: 'Gasto editado',
      amount: '11',
    })
    useInvestmentStore().addMovement({
      date: '2026-01-22',
      time: '10:00',
      side: 'buy',
      symbol: 'LINK',
      category: 'Link Asset',
      unitPrice: '100',
      units: '1',
      fee: '0',
      movementCurrency: 'EUR',
      accountId: CASH_ID,
      declared: false,
    })
    state = await trip.reload()
    const investmentId = state.transactions.find((item) => item.date === '2026-01-22')!.id
    useInvestmentStore().toggleDeclared(investmentId)
    useMovementsStore().deleteTransaction(expenseId)
    await trip.reload()

    storage = await openStorage(trip.userId)
    try {
      const records = await readMovementPublications(storage, [expenseId, investmentId])
      expect(records.get(expenseId)).toMatchObject({ status: 'deleted', generation: 3 })
      expect(records.get(investmentId)).toMatchObject({ status: 'active', generation: 2 })
    } finally {
      storage.close()
    }
  })
})
