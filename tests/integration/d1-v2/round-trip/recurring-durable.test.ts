// @vitest-environment happy-dom
import { getActivePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as accounts from '../../../../src/db/repositories/accounts'
import * as pendingRepository from '../../../../src/db/repositories/pending-movements'
import * as rules from '../../../../src/db/repositories/recurring-rules'
import { runWithDb } from '../../../../src/db/database'
import { createTestPinia } from '../../../helpers/pinia'
import { useFinancialStateStore } from '../../../../src/stores/financial-state'
import { useRecurringStore } from '../../../../src/stores/recurring'
import { useSyncStore } from '../../../../src/stores/sync'
import { startRoundTrip, type RoundTrip } from './harness'

const ACCOUNT_LEGACY = 'confirm-checking'
const SAVINGS_LEGACY = 'confirm-savings'
const BROKER_LEGACY = 'confirm-broker'

interface Seeded {
  accountId: string
  savingsId: string
  ruleId: string
  pendingId: string
  savingPendingId: string
}

let trip: RoundTrip
let seeded: Seeded
let secondTab: ReturnType<typeof useSyncStore> | null = null

function pendingConfirmationIntent(views: Awaited<ReturnType<RoundTrip['intents']>>) {
  return views.find((view) => view.intent.state !== undefined)
}

async function waitForIntent(
  predicate: (view: Awaited<ReturnType<RoundTrip['intents']>>[number]) => boolean,
) {
  return vi.waitFor(
    async () => {
      const views = await trip.intents()
      const view = pendingConfirmationIntent(views)
      expect(view).toBeDefined()
      expect(predicate(view!)).toBe(true)
      return view!
    },
    { timeout: 5000, interval: 20 },
  )
}

async function waitForQueuedCommands(count: number) {
  return vi.waitFor(
    async () => {
      const queued = await trip.pending()
      expect(queued).toHaveLength(count)
      return queued as Array<{
        seq: number
        command: { commandId: string; action: string; entityType: string; data?: { id: string } }
        intent?: { intentId: string; step: string }
      }>
    },
    { timeout: 5000, interval: 20 },
  )
}

function confirmFirstPending(edit?: Record<string, unknown>) {
  const recurring = useRecurringStore()
  const pending = recurring.openPendingMovements.find((item) => item.type !== 'saving')
  if (!pending) throw new Error('No hay pendiente que confirmar')
  return recurring.confirmPending(pending.id, edit as never)
}

async function seedRows(
  db: Parameters<NonNullable<Parameters<typeof startRoundTrip>[0]>>[0],
  userId: string,
) {
  const account = await runWithDb(
    db,
    accounts.create(userId, {
      legacyId: ACCOUNT_LEGACY,
      name: 'Cuenta',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 1000,
    }),
  )
  const savings = await runWithDb(
    db,
    accounts.create(userId, {
      legacyId: SAVINGS_LEGACY,
      name: 'Ahorro',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 0,
    }),
  )
  const broker = await runWithDb(
    db,
    accounts.create(userId, {
      legacyId: BROKER_LEGACY,
      name: 'Broker',
      kind: 'investment',
      currency: 'EUR',
      openingBalance: 500,
    }),
  )
  const category = await runWithDb(
    db,
    accounts.createCategory(userId, { name: 'Vivienda', kind: 'expense' }),
  )
  const savingCategory = await runWithDb(
    db,
    accounts.createCategory(userId, { name: 'Fondo de emergencia', kind: 'saving' }),
  )
  await runWithDb(db, accounts.createCategory(userId, { name: 'Cripto', kind: 'investment' }))
  const rule = await runWithDb(
    db,
    rules.create(userId, {
      id: 'rule-rent',
      legacyId: 'rule-rent',
      name: 'Alquiler',
      type: 'expense',
      accountId: account.id,
      categoryId: category.id,
      amount: 900,
      currency: 'EUR',
      frequency: 'monthly',
      startDate: '2026-01-01',
      lastExecutionDate: '2026-01-01',
      nextRunDate: '2026-02-01',
    }),
  )
  const pending = await runWithDb(
    db,
    pendingRepository.create(userId, {
      id: 'pending-rent',
      legacyId: 'pending-rent',
      recurringRuleId: rule.id,
      accountId: account.id,
      categoryId: category.id,
      amount: 900,
      currency: 'EUR',
      dueDate: '2026-02-01',
      type: 'expense',
      description: 'Alquiler',
      status: 'pending',
    }),
  )
  const savingRule = await runWithDb(
    db,
    rules.create(userId, {
      id: 'rule-saving',
      legacyId: 'rule-saving',
      name: 'Ahorro mensual',
      type: 'saving',
      accountId: account.id,
      destinationAccountId: savings.id,
      categoryId: savingCategory.id,
      amount: 200,
      currency: 'EUR',
      frequency: 'monthly',
      startDate: '2026-01-01',
      lastExecutionDate: '2026-01-01',
      nextRunDate: '2026-02-01',
    }),
  )
  const savingPending = await runWithDb(
    db,
    pendingRepository.create(userId, {
      id: 'pending-saving',
      legacyId: 'pending-saving',
      recurringRuleId: savingRule.id,
      accountId: account.id,
      destinationAccountId: savings.id,
      categoryId: savingCategory.id,
      amount: 200,
      currency: 'EUR',
      dueDate: '2026-02-01',
      type: 'saving',
      description: 'Ahorro mensual',
      status: 'pending',
    }),
  )
  return {
    accountId: account.id,
    savingsId: savings.id,
    brokerId: broker.id,
    ruleId: rule.id,
    pendingId: pending.id,
    savingPendingId: savingPending.id,
  }
}

describe('confirmación recurrente durable (#492)', () => {
  beforeEach(async () => {
    secondTab = null
    trip = await startRoundTrip(async (db, userId) => {
      await seedRows(db, userId)
    })
    await trip.reload()
    const pending = useRecurringStore().openPendingMovements.find((item) => item.type === 'expense')
    const rule = useRecurringStore().rules.find((item) => item.type === 'expense')
    const savingPending = useRecurringStore().openPendingMovements.find(
      (item) => item.type === 'saving',
    )
    seeded = {
      accountId: ACCOUNT_LEGACY,
      savingsId: SAVINGS_LEGACY,
      ruleId: rule!.id,
      pendingId: pending!.id,
      savingPendingId: savingPending!.id,
    }
  })

  afterEach(async () => {
    await secondTab?.dispose()
    secondTab = null
    trip.cleanup()
  })

  it('acepta sin conexión, conserva la edición al recargar y confirma una sola vez', async () => {
    trip.setOffline(true)
    const outcome = await confirmFirstPending({ amount: 925, description: 'Alquiler ajustado' })
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')
    const transactionId = outcome.transactionId

    // The movement command is published first; the pending update waits for
    // its acknowledgement, so what is durable after the acceptance is one
    // movement command plus the reservation of the pending step.
    const queued = await waitForQueuedCommands(1)
    expect(queued[0].command).toMatchObject({
      action: 'create',
      entityType: 'transaction',
      data: { id: transactionId },
    })
    const movementCommandId = queued[0].command.commandId
    const beforeReload = await trip.intents()
    expect(beforeReload[0].steps).toMatchObject([
      { step: 'movement', state: 'queued', commandId: movementCommandId },
      { step: 'pending', state: 'pending' },
    ])

    // A reload while offline keeps the accepted edit, the movement identity
    // and the queue; it must not decide the confirmation again.
    const offlineState = await trip.reloadOffline()
    expect(offlineState.transactions).toHaveLength(1)
    expect(offlineState.transactions[0]).toMatchObject({
      id: transactionId,
      amount: 925,
      description: 'Alquiler ajustado',
      date: '2026-02-01',
    })
    expect(offlineState.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId,
      amount: 925,
      description: 'Alquiler ajustado',
    })
    const afterReload = await waitForQueuedCommands(1)
    expect(afterReload[0].command.commandId).toBe(movementCommandId)

    // A stale button or a second render repeats the confirmation.
    const repeated = await useRecurringStore().confirmPending(seeded.pendingId, { amount: 1 })
    expect(repeated).toEqual({ accepted: true, transactionId })
    expect(useFinancialStateStore().transactions).toHaveLength(1)

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions).toHaveLength(1)
    expect(synced.transactions[0]).toMatchObject({ id: transactionId, amount: 925 })
    expect(synced.pendingMovements[0]).toMatchObject({ status: 'confirmed', transactionId })
    expect(await trip.pending()).toHaveLength(0)
    // No unresolved recurring work is left; the settled reservation may have
    // been forgotten already (retention), which must not change the result.
    await vi.waitFor(
      async () => {
        const views = await trip.intents()
        expect(views.filter((view) => view.intent.state !== 'confirmed')).toEqual([])
      },
      { timeout: 5000, interval: 20 },
    )
  })

  it('retoma entre el movimiento y el pendiente reutilizando el comando y la identidad', async () => {
    trip.setOffline(true)
    const outcome = await confirmFirstPending({ amount: 925 })
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')

    // The movement command is queued; the pending update is not published yet
    // because the movement still has to be acknowledged by the server.
    const interrupted = await waitForQueuedCommands(1)
    const movementCommandId = interrupted[0].command.commandId
    const before = await trip.intents()
    expect(before[0].steps).toMatchObject([
      { step: 'movement', state: 'queued', commandId: movementCommandId },
      { step: 'pending', state: 'pending' },
    ])

    // Reboot: the reservation survives. On the next connection the same
    // movement command is resent, never a second create with a new identity.
    const offlineState = await trip.reloadOffline()
    expect(offlineState.transactions).toHaveLength(1)
    expect(offlineState.transactions[0].id).toBe(outcome.transactionId)
    const afterReload = await waitForQueuedCommands(1)
    expect(afterReload[0].command.commandId).toBe(movementCommandId)

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions).toHaveLength(1)
    expect(synced.transactions[0].id).toBe(outcome.transactionId)
    expect(synced.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
    })
    // The movement create was sent once; only the pending update came later.
    const movementCreates = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { entityType?: string; action?: string }).entityType === 'transaction' &&
          (command as { action?: string }).action === 'create',
      )
    expect(movementCreates).toHaveLength(1)
  })

  it('conserva el comando pendiente ya encolado antes de enviarlo', async () => {
    trip.setOffline(true)
    const outcome = await confirmFirstPending({ amount: 925 })
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')

    // The pending update is published only after the movement is confirmed.
    const held = trip.holdSync((commands) =>
      (commands as Array<{ entityType?: string }>).some(
        (command) => command.entityType === 'pendingMovement',
      ),
    )
    trip.setOffline(false)
    void trip.syncStore.syncNow()
    await held.entered
    const queued = (await trip.pending()) as Array<{
      command: { commandId: string; entityType: string; action: string }
    }>
    expect(queued).toHaveLength(1)
    expect(queued[0].command).toMatchObject({ entityType: 'pendingMovement', action: 'update' })
    const pendingCommandId = queued[0].command.commandId

    // The tab unloads while its pending update is in flight: the queue entry
    // must survive for an idempotent resend.
    trip.setOffline(true)
    await trip.syncStore.dispose()
    held.release()
    const offlineState = await trip.reloadOffline()
    expect(offlineState.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
    })
    const afterReload = (await trip.pending()) as Array<{ command: { commandId: string } }>
    expect(afterReload).toHaveLength(1)
    expect(afterReload[0].command.commandId).toBe(pendingCommandId)

    const synced = await trip.reload()
    expect(synced.transactions).toHaveLength(1)
    expect(synced.transactions[0].id).toBe(outcome.transactionId)
    expect(synced.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
    })
  })

  it('una respuesta perdida reenvía el mismo commandId y no duplica el movimiento', async () => {
    trip.setOffline(true)
    const outcome = await confirmFirstPending({ amount: 925 })
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')
    const queued = await waitForQueuedCommands(1)
    const movementCommandId = queued[0].command.commandId

    // The server applies the movement, then the response is lost: the client
    // must resend the same command instead of publishing a new attempt.
    trip.loseNextResponse()
    trip.setOffline(false)
    await trip.syncStore.syncNow()

    const state = await trip.reload()
    expect(state.transactions).toHaveLength(1)
    expect(state.transactions[0].id).toBe(outcome.transactionId)
    expect(state.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
    })
    const movementCreates = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { entityType?: string; action?: string }).entityType === 'transaction' &&
          (command as { action?: string }).action === 'create',
      )
    expect(
      new Set(movementCreates.map((command) => (command as { commandId: string }).commandId)),
    ).toEqual(new Set([movementCommandId]))
    expect(await trip.pending()).toHaveLength(0)
  })

  it('un rechazo definitivo queda visible y el reintento usa otro comando con el mismo movimiento', async () => {
    trip.setOffline(true)
    const outcome = await confirmFirstPending({ amount: 925 })
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')
    const [movementCommand] = await waitForQueuedCommands(1)
    trip.rejectSyncCommand(movementCommand.command.commandId, 'La cuenta ya no existe.')

    trip.setOffline(false)
    await trip.syncStore.syncNow()
    const failed = await waitForIntent((intent) => intent.intent.state === 'failed')
    expect(failed.intent.failure).toContain('ya no existe')
    // The pending update never went out: the movement it references could not
    // exist, so the reservation keeps both works for an explicit retry.
    expect(await trip.pending()).toHaveLength(0)
    const offlineState = await trip.reload()
    // The rejected movement is not presented as a real transaction: the
    // pending stays open with the failure visible, and the reservation keeps
    // the accepted values for the explicit retry.
    expect(offlineState.pendingMovements[0].status).toBe('pending')
    expect(offlineState.transactions).toHaveLength(0)
    expect(await useRecurringStore().pendingConfirmationStatus(seeded.pendingId)).toMatchObject({
      transactionId: outcome.transactionId,
      movementConfirmed: false,
      pendingLinked: false,
    })

    // Explicit retry: another command attempt, same reserved movement id.
    const retried = await useRecurringStore().retryConfirmation(seeded.pendingId)
    expect(retried).toEqual({ accepted: true, transactionId: outcome.transactionId })
    const requeued = await waitForQueuedCommands(1)
    expect(requeued[0].command).toMatchObject({
      entityType: 'transaction',
      action: 'create',
      data: { id: outcome.transactionId },
    })
    expect(requeued[0].command.commandId).not.toBe(movementCommand.command.commandId)

    const synced = await trip.reload()
    expect(synced.transactions).toHaveLength(1)
    expect(synced.transactions[0].id).toBe(outcome.transactionId)
    expect(synced.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
    })
  })

  it('descarta antes de publicar sin dejar rastro y permite reintentar la confirmación', async () => {
    trip.setOffline(true)
    const outcome = await confirmFirstPending({ amount: 925 })
    expect(outcome.accepted).toBe(true)
    await waitForQueuedCommands(1)

    const discard = await useRecurringStore().discardConfirmation(seeded.pendingId)
    expect(discard).toMatchObject({ discarded: true, keptMovement: false })
    expect(await trip.pending()).toHaveLength(0)
    const state = await trip.reloadOffline()
    expect(state.transactions).toHaveLength(0)
    expect(state.pendingMovements[0].status).toBe('pending')

    // Repeating after a discard reuses the accepted decision and identity:
    // it is another attempt at the same confirmation, not a new financial one.
    const again = await useRecurringStore().confirmPending(seeded.pendingId, { amount: 930 })
    expect(again).toEqual({
      accepted: true,
      transactionId: outcome.accepted ? outcome.transactionId : '',
    })
    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions).toHaveLength(1)
    expect(synced.transactions[0]).toMatchObject({
      id: outcome.accepted ? outcome.transactionId : '',
      amount: 925,
    })
    expect(synced.pendingMovements[0].status).toBe('confirmed')
  })

  it('descarta después de un movimiento confirmado sin revertirlo ni crear otro', async () => {
    trip.setOffline(true)
    const outcome = await confirmFirstPending({ amount: 925 })
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')
    await waitForQueuedCommands(1)

    // Hold the pending update so only that command can be rejected: the
    // movement create is applied for real and must survive the discard.
    const held = trip.holdSync((commands) =>
      (commands as Array<{ entityType?: string }>).some(
        (command) => command.entityType === 'pendingMovement',
      ),
    )
    trip.setOffline(false)
    void trip.syncStore.syncNow()
    await held.entered
    const queued = (await trip.pending()) as Array<{
      command: { commandId: string; entityType: string }
    }>
    const pendingCommand = queued.find((entry) => entry.command.entityType === 'pendingMovement')!
    trip.rejectSyncCommand(pendingCommand.command.commandId, 'El pendiente ya no existe.')
    held.release()

    const partial = await waitForIntent((intent) => intent.intent.state === 'partial')
    expect(partial.intent.failure).toContain('ya no existe')
    const confirmedState = await trip.reload()
    expect(confirmedState.transactions).toHaveLength(1)
    expect(confirmedState.transactions[0].id).toBe(outcome.transactionId)

    const discard = await useRecurringStore().discardConfirmation(seeded.pendingId)
    expect(discard).toMatchObject({ discarded: true, keptMovement: true })
    expect(discard.message).toContain('movimiento')

    const afterDiscard = await trip.reloadOffline()
    expect(afterDiscard.transactions).toHaveLength(1)
    expect(afterDiscard.transactions[0].id).toBe(outcome.transactionId)
    // The confirmed movement keeps its pending link after the reload, even
    // though the server still shows the pending open (its update was the
    // rejected step): reopening it would offer a second confirmation.
    expect(afterDiscard.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
    })
    const view = await waitForIntent((intent) => intent.intent.state === 'partial')
    expect(view.intent.failure).toContain('movimiento')

    // A repeat is an explicit retry of the same reservation: it can reconcile
    // the pending link but never creates a second movement.
    const repeated = await useRecurringStore().confirmPending(seeded.pendingId)
    expect(repeated).toEqual({ accepted: true, transactionId: outcome.transactionId })
    trip.setOffline(false)
    const reconciled = await trip.reload()
    expect(reconciled.transactions).toHaveLength(1)
    expect(reconciled.transactions[0].id).toBe(outcome.transactionId)
    expect(reconciled.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
    })
  })

  it('dos pestañas confirman el mismo pendiente con un único movimiento', async () => {
    trip.setOffline(true)
    const tabAPinia = getActivePinia()
    const tabARecurring = useRecurringStore()

    // A second tab: another Pinia and sync runtime over the same per-user DBs.
    // Both tabs already see the same open pending before either confirms.
    setActivePinia(createTestPinia())
    const tabBPinia = getActivePinia()!
    secondTab = useSyncStore()
    await secondTab.init(trip.userId)
    secondTab.connection = 'offline'
    const tabBRecurring = useRecurringStore()
    expect(tabBRecurring.openPendingMovements.some((item) => item.id === seeded.pendingId)).toBe(
      true,
    )

    // Tab A confirms first; tab B then repeats the same pending from its own
    // store, which still shows it open (its projection predates the first
    // confirmation). The durable reservation is read, not decided again.
    setActivePinia(tabAPinia!)
    const first = await tabARecurring.confirmPending(seeded.pendingId, { amount: 925 })
    expect(first.accepted).toBe(true)
    if (!first.accepted) throw new Error('No se aceptó')
    setActivePinia(tabBPinia)
    const second = await tabBRecurring.confirmPending(seeded.pendingId, { amount: 1 })
    expect(second).toEqual({ accepted: true, transactionId: first.transactionId })

    const queued = await waitForQueuedCommands(1)
    expect(queued[0].command).toMatchObject({
      entityType: 'transaction',
      action: 'create',
      data: { id: first.transactionId },
    })

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions).toHaveLength(1)
    expect(synced.transactions[0].id).toBe(first.transactionId)
    expect(synced.pendingMovements.find((item) => item.id === seeded.pendingId)).toMatchObject({
      status: 'confirmed',
      transactionId: first.transactionId,
    })
  })

  it('conserva la cuenta destino de un ahorro', async () => {
    trip.setOffline(true)
    const recurring = useRecurringStore()
    const saving = await recurring.confirmPending(seeded.savingPendingId)
    expect(saving.accepted).toBe(true)
    if (!saving.accepted) throw new Error('No se aceptó el ahorro')

    const offlineState = await trip.reloadOffline()
    expect(
      offlineState.transactions.find((item) => item.id === saving.transactionId),
    ).toMatchObject({
      type: 'saving',
      accountId: ACCOUNT_LEGACY,
      destinationAccountId: SAVINGS_LEGACY,
      amount: 200,
    })

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions.find((item) => item.id === saving.transactionId)).toMatchObject({
      type: 'saving',
      accountId: ACCOUNT_LEGACY,
      destinationAccountId: SAVINGS_LEGACY,
      amount: 200,
    })
    expect(
      synced.pendingMovements.find((item) => item.id === seeded.savingPendingId),
    ).toMatchObject({ status: 'confirmed', transactionId: saving.transactionId })
  })

  it('conserva la operación de inversión', async () => {
    trip.setOffline(true)
    const investment = await useRecurringStore().confirmPending(seeded.pendingId, {
      type: 'investment',
      accountId: BROKER_LEGACY,
      category: 'Cripto',
      description: 'Compra BTC',
      amount: 1,
      symbol: 'btc',
      side: 'buy',
      units: 0.5,
      unitPrice: 20000,
      fee: 10,
      time: '10:30',
    })
    expect(investment.accepted).toBe(true)
    if (!investment.accepted) throw new Error('No se aceptó la inversión')

    const state = await trip.reloadOffline()
    const movement = state.transactions.find((item) => item.id === investment.transactionId)
    expect(movement).toMatchObject({
      type: 'investment',
      symbol: 'BTC',
      side: 'buy',
      units: 0.5,
      unitPrice: 20000,
      fee: 10,
      time: '10:30',
      amount: 10010,
      description: 'Compra BTC',
    })

    trip.setOffline(false)
    const synced = await trip.reload()
    expect(synced.transactions.find((item) => item.id === investment.transactionId)).toMatchObject({
      symbol: 'BTC',
      side: 'buy',
      units: 0.5,
      unitPrice: 20000,
      fee: 10,
      time: '10:30',
      amount: 10010,
    })
  })
})
