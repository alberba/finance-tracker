import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as marketRepository from '../../../../src/db/repositories/market'
import * as transactionsRepository from '../../../../src/db/repositories/transactions'
import { runWithDb } from '../../../../src/db/database'
import { useMarketStore } from '../../../../src/stores/market'
import {
  addLinkInstrument,
  seedLinkMovement,
  startRoundTrip,
  waitForIntent,
  type RoundTrip,
} from './harness'

const CONFIGURATION_STEP = 'configuration'

interface QueuedEntry {
  seq: number
  command: {
    commandId: string
    action: string
    entityType?: string
    entityId?: string
  }
  intent?: { intentId: string; step: string }
}

async function queuedConfiguration(trip: RoundTrip): Promise<QueuedEntry> {
  return vi.waitFor(
    async () => {
      const queued = (await trip.pending()) as QueuedEntry[]
      const entry = queued.find((candidate) => candidate.command.entityType === 'userInstrument')
      expect(entry).toBeDefined()
      return entry!
    },
    { timeout: 5000 },
  )
}

describe('vinculación con una cotización recién configurada (#491)', () => {
  let trip: RoundTrip
  let targetId: string

  beforeEach(async () => {
    trip = await startRoundTrip(seedLinkMovement)
    const seeded = await trip.reload()
    targetId = seeded.transactions[0].id
  })

  afterEach(() => trip.cleanup())

  it('configura y vincula antes de la primera confirmación, recarga sin conexión y completa al reconectar', async () => {
    trip.setOffline(true)
    const instrumentId = await addLinkInstrument()

    const acceptance = await useMarketStore().linkExistingMovements(instrumentId)
    expect(acceptance).toEqual({ targets: 1, accepted: true })

    const accepted = await waitForIntent(trip, (view) =>
      view.steps.some((step) => step.step === CONFIGURATION_STEP && step.state === 'queued'),
    )
    expect(accepted.intent.targetIds).toEqual([targetId])
    expect(accepted.intent.state).toBe('sending')
    expect(accepted.intent.failure).toBeNull()
    const configuration = await queuedConfiguration(trip)
    expect(configuration.intent).toEqual({
      intentId: accepted.intent.id,
      step: CONFIGURATION_STEP,
    })
    expect(configuration.command.action).toBe('create')
    const configurationCommandId = configuration.command.commandId
    // The ordinary editor write and the accepted intent converge on one
    // configuration command, whichever path queued it first.
    expect(
      ((await trip.pending()) as QueuedEntry[]).filter(
        (entry) => entry.command.entityType === 'userInstrument',
      ),
    ).toHaveLength(1)

    // A reload without connection keeps the accepted configuration as the
    // intent's own step and the movement targets still unpublished.
    const offline = await trip.reloadOffline()
    expect(offline.instruments.find((item) => item.id === instrumentId)).toBeDefined()
    const reloaded = await trip.intents()
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0].steps.find((step) => step.step === CONFIGURATION_STEP)).toMatchObject({
      state: 'queued',
      commandId: configurationCommandId,
    })
    expect(reloaded[0].steps.find((step) => step.step === targetId)?.state).toBe('pending')

    trip.setOffline(false)
    const state = await trip.reload()
    expect(state.transactions.find((item) => item.id === targetId)).toMatchObject({ instrumentId })
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
    expect(await trip.pending()).toHaveLength(0)

    // One private configuration, one catalog reference and one linked movement.
    const configured = await runWithDb(
      trip.testDb.db,
      marketRepository.listUserInstrumentsByUser(trip.userId),
    )
    expect(configured).toHaveLength(1)
    const trade = await runWithDb(
      trip.testDb.db,
      transactionsRepository.getTradeDetailByTransaction(trip.userId, targetId),
    )
    expect(trade?.instrumentId).toBe(configured[0].instrumentId)
  })

  it('despierta el vínculo desde la configuración confirmada, sin una consulta previa de caché', async () => {
    trip.setOffline(true)
    const instrumentId = await addLinkInstrument()
    await useMarketStore().linkExistingMovements(instrumentId)
    await queuedConfiguration(trip)
    expect(
      (await trip.intents())[0].steps.find((step) => step.step === CONFIGURATION_STEP)?.state,
    ).toBe('queued')

    // The first batch after reconnecting carries the configuration. From then
    // on `/api/changes` — the only cache refresh that could reveal the new
    // reference — is unreachable, and the initial bootstrap ran before the
    // server had it.
    trip.failChangesAfterNextSync()
    trip.setOffline(false)
    await trip.reboot()

    // The entity returned by the confirmed configuration is enough: the link
    // publishes its movement command without a successful pull.
    const awake = await waitForIntent(
      trip,
      (view) => view.steps.find((step) => step.step === targetId)?.state === 'queued',
    )
    expect(awake.intent.failure).toBeNull()
    const queued = (await trip.pending()) as QueuedEntry[]
    expect(queued.find((entry) => entry.command.entityType === 'transaction')?.intent).toEqual({
      intentId: awake.intent.id,
      step: targetId,
    })
    expect(queued.find((entry) => entry.command.entityType === 'userInstrument')).toBeUndefined()
    const configured = await runWithDb(
      trip.testDb.db,
      marketRepository.listUserInstrumentsByUser(trip.userId),
    )
    expect(configured).toHaveLength(1)

    // Once the transport is healthy again the queued movement reaches the
    // server and the link is confirmed.
    trip.setChangesFailing(false)
    const state = await trip.reload()
    expect(state.transactions.find((item) => item.id === targetId)?.instrumentId).toBe(instrumentId)
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
  })

  it('mantiene visible el fallo definitivo de la configuración y permite descartarlo', async () => {
    trip.setOffline(true)
    const instrumentId = await addLinkInstrument()
    await useMarketStore().linkExistingMovements(instrumentId)
    const configuration = await queuedConfiguration(trip)
    trip.rejectSyncCommand(configuration.command.commandId, 'La cotización no es válida.')
    trip.setOffline(false)

    await trip.reload()
    const failed = await waitForIntent(trip, (view) => view.intent.state === 'failed')
    expect(failed.intent.failure).toContain('no es válida')
    expect(failed.steps.find((step) => step.step === CONFIGURATION_STEP)).toMatchObject({
      state: 'failed',
    })
    expect(await trip.pending()).toHaveLength(0)
    expect(
      await runWithDb(trip.testDb.db, marketRepository.listUserInstrumentsByUser(trip.userId)),
    ).toHaveLength(0)

    const discarded = await trip.syncStore.discardIntent(failed.intent.id)
    expect(discarded).toMatchObject({ finalized: true, cancelled: 2, kept: 0 })
    const [view] = await trip.intents()
    expect(view.steps.every((step) => step.state === 'cancelled')).toBe(true)
    expect(await trip.pending()).toHaveLength(0)
  })

  it('reintenta la configuración rechazada con otro comando y el mismo contenido', async () => {
    trip.setOffline(true)
    const instrumentId = await addLinkInstrument()
    await useMarketStore().linkExistingMovements(instrumentId)
    const configuration = await queuedConfiguration(trip)
    trip.rejectSyncCommand(configuration.command.commandId, 'La cotización no es válida.')
    trip.setOffline(false)
    await trip.reload()
    const failed = await waitForIntent(trip, (view) => view.intent.state === 'failed')

    await trip.syncStore.retryIntent(failed.intent.id)
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')

    const attempts = (
      trip.commandBatches().flat() as Array<{
        commandId: string
        entityType?: string
        data?: { quoteConfig?: unknown }
      }>
    ).filter((command) => command.entityType === 'userInstrument')
    expect(attempts).toHaveLength(2)
    expect(attempts[0].commandId).not.toBe(attempts[1].commandId)
    expect(attempts[1].data?.quoteConfig).toEqual(attempts[0].data?.quoteConfig)
    expect(
      await runWithDb(trip.testDb.db, marketRepository.listUserInstrumentsByUser(trip.userId)),
    ).toHaveLength(1)
    const state = await trip.reload()
    expect(state.transactions.find((item) => item.id === targetId)?.instrumentId).toBe(instrumentId)
  })

  it('reenvía el mismo comando de configuración cuando se pierde su respuesta', async () => {
    trip.setOffline(true)
    const instrumentId = await addLinkInstrument()
    await useMarketStore().linkExistingMovements(instrumentId)
    const configuration = await queuedConfiguration(trip)
    // The server applies the configuration, then the response is lost.
    trip.loseNextResponse()
    trip.setOffline(false)

    await trip.reload()
    await waitForIntent(trip, (view) => view.intent.state === 'confirmed')
    const attempts = (
      trip.commandBatches().flat() as Array<{
        commandId: string
        entityType?: string
      }>
    ).filter((command) => command.entityType === 'userInstrument')
    expect(attempts.length).toBeGreaterThanOrEqual(2)
    expect(new Set(attempts.map((command) => command.commandId))).toEqual(
      new Set([configuration.command.commandId]),
    )
    expect(
      await runWithDb(trip.testDb.db, marketRepository.listUserInstrumentsByUser(trip.userId)),
    ).toHaveLength(1)
    expect(
      (await trip.reload()).transactions.find((item) => item.id === targetId)?.instrumentId,
    ).toBe(instrumentId)
  })
})
