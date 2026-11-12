import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as accountsRepository from '../../../../src/db/repositories/accounts'
import * as transactionsRepository from '../../../../src/db/repositories/transactions'
import { linkInstrumentMovements } from '../../../../src/lib/client/instrument-link'
import { useFinancialStateStore } from '../../../../src/stores/financial-state'
import { useInvestmentStore } from '../../../../src/stores/investment'
import { useMarketStore } from '../../../../src/stores/market'
import { useMovementsStore } from '../../../../src/stores/movements'
import { runWithDb } from '../../../../src/db/database'
import { openStorage, wipeOutbox } from '../../../helpers/client-storage'
import { startRoundTrip, type RoundTrip } from './harness'

const ASSET_ID = 'link-asset'
const CASH_ID = 'link-broker'

async function addLinkInstrument(): Promise<string> {
  const market = useMarketStore()
  expect(
    market.addInstrument({
      investmentAssetId: ASSET_ID,
      type: 'etf',
      symbol: 'LINK',
      market: '',
      currency: 'EUR',
      provider: 'yahoo',
    }),
  ).toBe(true)
  const instrument = market.instruments.find((item) => item.symbol === 'LINK')
  if (!instrument) throw new Error('No se configuró el instrumento')
  return instrument.id
}

/** Adds and confirms the quote configuration before the link is requested. */
async function configuredInstrument(trip: RoundTrip): Promise<string> {
  const instrumentId = await addLinkInstrument()
  await trip.reload()
  return instrumentId
}

async function seed(trip: RoundTrip): Promise<string> {
  const seeded = await trip.reload()
  return seeded.transactions[0].id
}

async function waitForIntent(
  trip: RoundTrip,
  predicate: (view: Awaited<ReturnType<RoundTrip['intents']>>[number]) => boolean,
) {
  return vi.waitFor(
    async () => {
      const [view] = await trip.intents()
      expect(view).toBeDefined()
      expect(predicate(view)).toBe(true)
      return view
    },
    { timeout: 5000 },
  )
}

async function waitQueuedIntentCommand(
  trip: RoundTrip,
): Promise<{ seq: number; commandId: string }> {
  return vi.waitFor(
    async () => {
      const queued = (await trip.pending()) as Array<{
        seq: number
        command: { commandId: string }
        intent?: { intentId: string; step: string }
      }>
      const entry = queued.find((candidate) => candidate.intent)
      expect(entry).toBeDefined()
      return { seq: entry!.seq, commandId: entry!.command.commandId }
    },
    { timeout: 5000 },
  )
}

function linkUpdateCommandIds(trip: RoundTrip): string[] {
  return trip
    .commandBatches()
    .flat()
    .filter(
      (command) =>
        (command as { entityType?: string; action?: string }).entityType === 'transaction' &&
        (command as { action?: string }).action === 'update',
    )
    .map((command) => (command as { commandId: string }).commandId)
}

describe('vinculación durable y recuperable (#490)', () => {
  let trip: RoundTrip
  let targetId: string

  beforeEach(async () => {
    trip = await startRoundTrip(async (db, userId) => {
      await runWithDb(
        db,
        accountsRepository.create(userId, {
          legacyId: ASSET_ID,
          name: 'Link Asset',
          kind: 'investment',
          currency: 'EUR',
          openingBalance: 0,
        }),
      )
      const cash = await runWithDb(
        db,
        accountsRepository.create(userId, {
          legacyId: CASH_ID,
          name: 'Broker',
          kind: 'cash',
          currency: 'EUR',
          openingBalance: 0,
        }),
      )
      const category = await runWithDb(
        db,
        accountsRepository.createCategory(userId, { name: 'Link Asset', kind: 'investment' }),
      )
      await runWithDb(
        db,
        transactionsRepository.create(userId, {
          accountId: cash.id,
          categoryId: category.id,
          type: 'investment',
          date: '2026-01-15',
          amount: -201,
          currency: 'EUR',
          description: 'Compra antigua',
          operation: { symbol: 'LINK', side: 'buy', units: 2, unitPrice: 100, fee: 1 },
        }),
      )
    })
    targetId = await seed(trip)
  })

  afterEach(() => trip.cleanup())

  it('acepta sin conexión solo con la intención durable y la completa al reconectar', async () => {
    const instrumentId = await configuredInstrument(trip)
    trip.setOffline(true)

    const acceptance = await useMarketStore().linkExistingMovements(instrumentId)
    expect(acceptance).toEqual({ targets: 1, accepted: true })

    const acceptedView = await waitForIntent(trip, (view) => view.steps[0]?.state === 'queued')
    expect(acceptedView.intent).toMatchObject({
      state: 'sending',
      targetIds: [targetId],
      payload: { instrumentId },
    })
    const queued = await waitQueuedIntentCommand(trip)

    // A reload while offline keeps both the intent and its command.
    const offlineState = await trip.reloadOffline()
    expect(offlineState.transactions.find((item) => item.id === targetId)?.instrumentId).toBe(
      instrumentId,
    )
    const afterReload = await trip.intents()
    expect(afterReload[0].steps[0]).toMatchObject({ state: 'queued', commandId: queued.commandId })

    trip.setOffline(false)
    const state = await trip.reload()
    expect(state.transactions.find((item) => item.id === targetId)?.instrumentId).toBe(instrumentId)
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
    expect(await trip.pending()).toHaveLength(0)
  })

  it('no pierde la intención aceptada si se interrumpe antes de publicar', async () => {
    const instrumentId = await configuredInstrument(trip)
    // The page unloads after accepting the intent but while the configuration
    // step it handed to the caller is still unresolved: no movement command
    // exists yet, only the durable intent and its fixed target.
    let releaseConfiguration!: (value: boolean) => void
    const configurationGate = new Promise<boolean>((resolve) => {
      releaseConfiguration = resolve
    })
    const acceptance = await linkInstrumentMovements({
      instrumentId,
      saveConfiguration: () => configurationGate,
      onError: () => undefined,
    })
    expect(acceptance.accepted).toBe(true)

    const interrupted = await waitForIntent(
      trip,
      (view) => view.intent.state === 'local-saved' && view.steps[0]?.state === 'pending',
    )
    expect(interrupted.steps[0].attempt).toBe(0)
    const intentCommands = (await trip.pending()).filter(
      (entry) => (entry as { intent?: unknown }).intent,
    )
    expect(intentCommands).toHaveLength(0)

    // Reboot offline: the intent survives and publishes its command locally.
    trip.setOffline(true)
    const offlineState = await trip.reloadOffline()
    releaseConfiguration(true)
    expect(offlineState.transactions.find((item) => item.id === targetId)?.instrumentId).toBe(
      instrumentId,
    )
    await waitForIntent(trip, (view) => view.steps[0]?.state === 'queued')

    trip.setOffline(false)
    await trip.reload()
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
  })

  it('reenvía el mismo comando cuando se pierde la respuesta y no duplica el efecto', async () => {
    const instrumentId = await configuredInstrument(trip)
    trip.loseNextResponse()

    await useMarketStore().linkExistingMovements(instrumentId)
    const queued = await waitQueuedIntentCommand(trip)
    await vi.waitFor(() => expect(trip.commandBatches().length).toBeGreaterThan(0), {
      timeout: 5000,
    })

    const state = await trip.reload()
    expect(state.transactions.filter((item) => item.id === targetId)).toHaveLength(1)
    expect(state.transactions[0].instrumentId).toBe(instrumentId)
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
    expect(await trip.pending()).toHaveLength(0)

    const ids = linkUpdateCommandIds(trip)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(new Set(ids)).toEqual(new Set([queued.commandId]))
  })

  it('recupera la confirmación cuando la respuesta se recibe pero no se puede incorporar', async () => {
    const instrumentId = await configuredInstrument(trip)
    trip.corruptNextSyncResponse()

    await useMarketStore().linkExistingMovements(instrumentId)
    const queued = await waitQueuedIntentCommand(trip)
    await vi.waitFor(() => expect(trip.commandBatches().length).toBeGreaterThan(0), {
      timeout: 5000,
    })
    const uncertain = await waitForIntent(
      trip,
      (view) => view.steps[0]?.state === 'queued' || view.steps[0]?.state === 'sending',
    )
    expect(uncertain.steps[0].commandId).toBe(queued.commandId)

    const state = await trip.reload()
    expect(state.transactions).toHaveLength(1)
    expect(state.transactions[0].instrumentId).toBe(instrumentId)
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
    expect(new Set(linkUpdateCommandIds(trip))).toEqual(new Set([queued.commandId]))
  })

  it('conserva el fallo definitivo y reintenta con otro comando y el mismo movimiento', async () => {
    const instrumentId = await configuredInstrument(trip)
    const held = trip.holdSync((commands) =>
      (commands as Array<{ entityType?: string; action?: string }>).some(
        (command) => command.entityType === 'transaction' && command.action === 'update',
      ),
    )
    const acceptance = await useMarketStore().linkExistingMovements(instrumentId)
    expect(acceptance.accepted).toBe(true)
    await held.entered
    const queued = await waitQueuedIntentCommand(trip)
    trip.rejectSyncCommand(queued.commandId, 'El movimiento ya no existe.')
    held.release()

    const failed = await waitForIntent(trip, (view) => view.intent.state === 'failed')
    expect(failed.intent.failure).toContain('ya no existe')
    expect(await trip.pending()).toHaveLength(0)

    await trip.syncStore.retryIntent(failed.intent.id)
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
    const updates = trip
      .commandBatches()
      .flat()
      .filter(
        (command) =>
          (command as { entityType?: string; action?: string }).entityType === 'transaction' &&
          (command as { action?: string }).action === 'update',
      ) as Array<{ commandId: string; entityId: string }>
    const ids = updates.map((command) => command.commandId)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids).has(queued.commandId)).toBe(true)
    expect(new Set(ids).size).toBe(2)
    // A retry is another command attempt on the same movement identity.
    expect(updates.every((command) => command.entityId === targetId)).toBe(true)
  })

  it('muestra el resultado parcial real y descarta solo lo pendiente', async () => {
    const instrumentId = await configuredInstrument(trip)
    useMovementsStore().addTransaction({
      date: '2026-01-16',
      month: 1,
      type: 'investment',
      accountId: CASH_ID,
      category: 'Link Asset',
      description: 'Compra tardía',
      amount: 50,
    })
    await trip.reload()

    const held = trip.holdSync((commands) =>
      (commands as Array<{ entityType?: string; action?: string }>).some(
        (command) => command.entityType === 'transaction' && command.action === 'update',
      ),
    )
    const acceptance = await useMarketStore().linkExistingMovements(instrumentId)
    expect(acceptance).toEqual({ targets: 2, accepted: true })
    await held.entered
    const queue = (
      (await trip.pending()) as Array<{
        seq: number
        command: { commandId: string }
        intent?: unknown
      }>
    ).filter((entry) => entry.intent)
    expect(queue).toHaveLength(2)
    trip.rejectSyncCommand(queue[0].command.commandId, 'El movimiento ya no existe.')
    held.release()

    const partial = await waitForIntent(trip, (view) => view.intent.state === 'partial')
    const confirmed = partial.steps.filter((step) => step.state === 'confirmed')
    const failed = partial.steps.filter((step) => step.state === 'failed')
    expect(confirmed).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(partial.intent.failure).toContain('ya no existe')
    expect(await trip.pending()).toHaveLength(0)

    const discard = await trip.syncStore.discardIntent(partial.intent.id)
    expect(discard).toMatchObject({ finalized: true, cancelled: 1, kept: 1 })
    const [after] = await trip.intents()
    expect(after.intent.state).toBe('partial')
    expect(after.steps.filter((step) => step.state === 'confirmed')).toHaveLength(1)
    expect(after.steps.filter((step) => step.state === 'cancelled')).toHaveLength(1)
    expect(await trip.pending()).toHaveLength(0)
  })

  it('respeta un desvínculo posterior tras recargar una intención pendiente', async () => {
    const instrumentId = await addLinkInstrument()
    trip.setOffline(true)
    const acceptance = await useMarketStore().linkExistingMovements(instrumentId)
    expect(acceptance.accepted).toBe(true)
    const failed = await waitForIntent(trip, (view) => view.intent.state === 'failed')

    await trip.reloadOffline()
    useInvestmentStore().saveEditedMovement(targetId, {
      date: '2026-01-15',
      time: '09:30',
      side: 'buy',
      symbol: 'OTHER',
      category: 'Link Asset',
      unitPrice: '100',
      units: '2',
      fee: '0',
      movementCurrency: 'EUR',
      accountId: CASH_ID,
      declared: false,
    })

    trip.setOffline(false)
    await trip.syncStore.retryIntent(failed.intent.id)
    await waitForIntent(trip, (view) => view.intent.state === 'discarded')

    const state = await trip.reload()
    expect(state.transactions.find((item) => item.id === targetId)).toMatchObject({
      symbol: 'OTHER',
    })
    expect(state.transactions.find((item) => item.id === targetId)?.instrumentId).toBeUndefined()
  })

  it('no presenta como aceptada una vinculación cuyo registro durable falla', async () => {
    const instrumentId = await configuredInstrument(trip)
    const accept = vi.spyOn(trip.syncStore, 'acceptIntent').mockResolvedValue(null)

    const acceptance = await useMarketStore().linkExistingMovements(instrumentId)

    expect(acceptance).toEqual({ targets: 1, accepted: false })
    expect(
      useFinancialStateStore().transactions.find((item) => item.id === targetId)?.instrumentId,
    ).toBeUndefined()
    expect(await trip.intents()).toHaveLength(0)
    accept.mockRestore()
  })
})

describe('ciclo de vida del trabajo durable (#490)', () => {
  let trip: RoundTrip
  let targetId: string

  beforeEach(async () => {
    trip = await startRoundTrip(async (db, userId) => {
      await runWithDb(
        db,
        accountsRepository.create(userId, {
          legacyId: ASSET_ID,
          name: 'Link Asset',
          kind: 'investment',
          currency: 'EUR',
          openingBalance: 0,
        }),
      )
      const cash = await runWithDb(
        db,
        accountsRepository.create(userId, {
          legacyId: CASH_ID,
          name: 'Broker',
          kind: 'cash',
          currency: 'EUR',
          openingBalance: 0,
        }),
      )
      const category = await runWithDb(
        db,
        accountsRepository.createCategory(userId, { name: 'Link Asset', kind: 'investment' }),
      )
      await runWithDb(
        db,
        transactionsRepository.create(userId, {
          accountId: cash.id,
          categoryId: category.id,
          type: 'investment',
          date: '2026-01-15',
          amount: -201,
          currency: 'EUR',
          description: 'Compra antigua',
          operation: { symbol: 'LINK', side: 'buy', units: 2, unitPrice: 100, fee: 1 },
        }),
      )
    })
    targetId = await seed(trip)
  })

  afterEach(() => trip.cleanup())

  it('cuenta la intención una sola vez con sus comandos y bloquea el cierre de sesión', async () => {
    const instrumentId = await configuredInstrument(trip)
    trip.setOffline(true)
    await useMarketStore().linkExistingMovements(instrumentId)
    await waitForIntent(trip, (view) => view.steps[0]?.state === 'queued')

    await vi.waitFor(
      async () => expect(trip.syncStore.pendingCount).toBe((await trip.pending()).length),
      { timeout: 5000 },
    )
    expect(trip.syncStore.pendingCount).toBeGreaterThan(0)
    await expect(trip.syncStore.prepareLogout()).rejects.toThrow(/sincronizar/i)
    const [view] = await trip.intents()
    expect(view.intent.targetIds).toEqual([targetId])
  })

  it('conserva el trabajo al expirar la sesión y lo reanuda al volver a entrar', async () => {
    const instrumentId = await configuredInstrument(trip)
    trip.setOffline(true)
    await useMarketStore().linkExistingMovements(instrumentId)
    await waitForIntent(trip, (view) => view.steps[0]?.state === 'queued')
    trip.setOffline(false)

    trip.expireSessionOnce()
    await trip.syncStore.syncNow()
    await vi.waitFor(() => expect(trip.syncStore.lastError).toMatch(/sesión/i), { timeout: 5000 })
    expect(await trip.intents()).toHaveLength(1)

    await trip.syncStore.init(trip.userId)
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
    expect(await trip.pending()).toHaveLength(0)
  })

  it('detiene la ejecución anterior y aísla los usuarios al cambiar de cuenta', async () => {
    const instrumentId = await configuredInstrument(trip)
    trip.setOffline(true)
    await useMarketStore().linkExistingMovements(instrumentId)
    await waitForIntent(trip, (view) => view.steps[0]?.state === 'queued')

    const otherUser = `other-${trip.userId}`
    await trip.syncStore.init(otherUser)
    expect(await trip.syncStore.listIntents()).toHaveLength(0)

    const original = await openStorage(trip.userId)
    try {
      const { listDurableIntents } = await import('../../../helpers/client-storage')
      expect(await listDurableIntents(original)).toHaveLength(1)
    } finally {
      original.close()
      await wipeOutbox(otherUser)
    }
  })

  it('borra los nuevos registros al descartar explícitamente en el cierre de sesión', async () => {
    // No reload here: the point is the logout wipe, and a retained page
    // connection would block deleting the databases (which the browser
    // closes on a real unload).
    const instrumentId = await addLinkInstrument()
    trip.setOffline(true)
    await useMarketStore().linkExistingMovements(instrumentId)
    await waitForIntent(trip, (view) => view.intent.targetIds.length === 1)
    expect((await trip.pending()).length).toBeGreaterThan(0)
    await trip.syncStore.logout({ discardPending: true })

    const storage = await openStorage(trip.userId)

    try {
      const { listAll, listDurableIntents } = await import('../../../helpers/client-storage')
      expect(await listDurableIntents(storage)).toHaveLength(0)
      expect(await listAll(storage)).toHaveLength(0)
    } finally {
      storage.close()
      await wipeOutbox(trip.userId)
    }
  })
})
