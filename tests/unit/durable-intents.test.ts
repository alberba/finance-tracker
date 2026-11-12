import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  acceptDurableIntent,
  count,
  claimDurableIntentCommands,
  commitDurableIntentCommands,
  countDurableWork,
  discardDurableIntent,
  listAll,
  listDurableIntents,
  openStorage,
  publishDurableIntentCommands,
  retryDurableIntent,
  wipeOutbox,
  type IntentCommandOutcome,
  type TestStorage,
} from '../helpers/client-storage'

const USER_ID = 'user-durable-intents'

function linkIntent(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'instrumentLink' as const,
    ownerUserId: USER_ID,
    targetIds: ['movement-1', 'movement-2'],
    payload: { instrumentId: 'instrument-1' },
    ...overrides,
  }
}

function updateCommand(entityId: string, description = 'Vinculado') {
  return {
    action: 'update' as const,
    entityType: 'transaction' as const,
    entityId,
    baseVersion: 1,
    patch: { description },
  }
}

describe('intenciones durables de la cola local (#490)', () => {
  let db: TestStorage

  beforeEach(async () => {
    await wipeOutbox(USER_ID)
    db = await openStorage(USER_ID)
  })

  afterEach(async () => {
    db.close()
    await wipeOutbox(USER_ID)
  })

  it('acepta la intención y sus objetivos en una sola transacción', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent())

    expect(accepted.intent).toMatchObject({
      kind: 'instrumentLink',
      ownerUserId: USER_ID,
      targetIds: ['movement-1', 'movement-2'],
      payload: { instrumentId: 'instrument-1' },
      state: 'local-saved',
      failure: null,
      discardRequested: false,
    })
    expect(accepted.steps).toHaveLength(2)
    expect(accepted.steps.map((step) => step.id)).toEqual([
      `${accepted.intent.id}:movement-1`,
      `${accepted.intent.id}:movement-2`,
    ])
    expect(accepted.steps.every((step) => step.state === 'pending')).toBe(true)
  })

  it('conserva la intención aceptada al reabrir el almacenamiento', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent())
    db.close()

    db = await openStorage(USER_ID)
    const [reloaded] = await listDurableIntents(db)
    expect(reloaded.intent).toMatchObject({
      id: accepted.intent.id,
      targetIds: ['movement-1', 'movement-2'],
      state: 'local-saved',
    })
    expect(reloaded.steps).toHaveLength(2)
  })

  it('publica los comandos y el progreso en una sola transacción y no los duplica', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent())
    const result = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
      { step: 'movement-2', command: updateCommand('movement-2') },
    ])

    expect(result.published.map((item) => item.step)).toEqual(['movement-1', 'movement-2'])
    expect(result.skipped).toEqual([])
    const [view] = await listDurableIntents(db)
    expect(view.intent.state).toBe('sending')
    expect(view.steps.every((step) => step.state === 'queued')).toBe(true)
    expect(view.steps.map((step) => step.commandId)).toEqual(
      result.published.map((item) => item.commandId),
    )
    expect(await count(db)).toBe(2)

    // A second tab that tries to publish the same steps after the first
    // transaction committed must not create duplicate commands.
    const again = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
      { step: 'movement-2', command: updateCommand('movement-2') },
    ])
    expect(again.published).toEqual([])
    expect(again.skipped.sort()).toEqual(['movement-1', 'movement-2'])
    expect(await count(db)).toBe(2)
  })

  it('retira el comando y confirma el paso en la misma transacción', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent())
    const published = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
      { step: 'movement-2', command: updateCommand('movement-2') },
    ])
    const entries = await listCommands(db)
    const byStep = new Map(
      published.published.map((item) => [item.step, entries.find((e) => e.seq === item.seq)!]),
    )

    await commitResults(db, [
      { entry: byStep.get('movement-1')!, status: 'confirmed' },
      { entry: byStep.get('movement-2')!, status: 'confirmed' },
    ])

    expect(await count(db)).toBe(0)
    const [view] = await listDurableIntents(db)
    expect(view.intent.state).toBe('confirmed')
    expect(view.steps.every((step) => step.state === 'confirmed')).toBe(true)
  })

  it('mantiene el comando y el paso incierto para un reenvío idempotente', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent())
    const published = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
    ])
    const [entry] = await listCommands(db)

    await commitResults(db, [{ entry, status: 'uncertain' }])

    expect(await count(db)).toBe(1)
    expect(await listCommands(db)).toHaveLength(1)
    const [view] = await listDurableIntents(db)
    expect(view.steps[0]).toMatchObject({
      state: 'sending',
      commandId: published.published[0].commandId,
    })
    expect(view.intent.state).toBe('sending')
  })

  it('reintenta un fallo definitivo con un comando nuevo y la misma identidad de movimiento', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent({ targetIds: ['movement-1'] }))
    const first = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
    ])
    const [entry] = await listCommands(db)
    await commitResults(db, [{ entry, status: 'failed', message: 'El movimiento ya no existe.' }])
    let [view] = await listDurableIntents(db)
    expect(view.intent.state).toBe('failed')
    expect(view.intent.failure).toContain('ya no existe')
    expect(await count(db)).toBe(0)

    await retryDurableIntent(db, accepted.intent.id)
    ;[view] = await listDurableIntents(db)
    expect(view.intent.state).toBe('local-saved')
    expect(view.intent.failure).toBeNull()
    expect(view.steps[0].state).toBe('pending')

    const second = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
    ])
    expect(second.published[0].commandId).not.toBe(first.published[0].commandId)
    expect(second.published[0].step).toBe('movement-1')
    const [queued] = await listCommands(db)
    expect(queued.command).toMatchObject({ entityType: 'transaction', entityId: 'movement-1' })
  })

  it('descarta lo cancelable, conserva lo confirmado y deja el resultado parcial visible', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent())
    const published = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
      { step: 'movement-2', command: updateCommand('movement-2') },
    ])
    const entries = await listCommands(db)
    const first = entries.find((entry) => entry.seq === published.published[0].seq)!
    const second = entries.find((entry) => entry.seq === published.published[1].seq)!
    await commitResults(db, [
      { entry: first, status: 'confirmed' },
      { entry: second, status: 'pending' },
    ])
    // The conflict re-queued movement-2 as a new pending step; simulate it
    // still queued so discard has cancellable work.
    await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-2', command: updateCommand('movement-2') },
    ])

    const result = await discardDurableIntent(db, accepted.intent.id)

    expect(result).toMatchObject({ finalized: true, cancelled: 1, kept: 1, reconciling: 0 })
    expect(await count(db)).toBe(0)
    const [view] = await listDurableIntents(db)
    expect(view.intent.state).toBe('partial')
    expect(view.steps.find((step) => step.step === 'movement-1')?.state).toBe('confirmed')
    expect(view.steps.find((step) => step.step === 'movement-2')?.state).toBe('cancelled')
  })

  it('no declara cancelado un comando ya reclamado: lo reconcilia al confirmar', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent({ targetIds: ['movement-1'] }))
    await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
    ])
    const [entry] = await listCommands(db)
    expect(await claimCommands(db, [entry.seq], 'tab-a')).toEqual([entry.seq])

    const result = await discardDurableIntent(db, accepted.intent.id)
    expect(result).toMatchObject({ finalized: false, reconciling: 1 })
    let [view] = await listDurableIntents(db)
    expect(view.intent.discardRequested).toBe(true)
    expect(view.steps[0].state).toBe('sending')

    // The reconciliation returns the server's applied outcome: the confirmed
    // effect is kept and the intent is finally discarded.
    await commitResults(db, [{ entry: await entryBySeq(db, entry.seq), status: 'confirmed' }])
    ;[view] = await listDurableIntents(db)
    expect(view.intent.discardRequested).toBe(false)
    expect(view.intent.state).toBe('confirmed')
    expect(view.steps[0].state).toBe('confirmed')
  })

  it('cuenta una intención sin comandos una sola vez y no duplica sus comandos', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent())
    expect(await countDurableWork(db)).toBe(1)
    await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
      { step: 'movement-2', command: updateCommand('movement-2') },
    ])
    expect(await countDurableWork(db)).toBe(2)
  })
})

async function listCommands(db: TestStorage) {
  return listAll(db)
}

async function entryBySeq(db: TestStorage, seq: number) {
  const entries = await listCommands(db)
  return entries.find((entry) => entry.seq === seq)!
}

async function commitResults(db: TestStorage, outcomes: IntentCommandOutcome[]) {
  return commitDurableIntentCommands(db, { plainSeqs: [], outcomes })
}

async function claimCommands(db: TestStorage, seqs: number[], writerId: string) {
  const claimed = await claimDurableIntentCommands(db, seqs, writerId)
  return [...claimed].sort((a, b) => a - b)
}
