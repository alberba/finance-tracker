import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  acceptDurableIntent,
  acknowledge,
  count,
  claimDurableIntentCommands,
  commitDurableIntentCommands,
  completeDurableIntentStep,
  countDurableWork,
  discardDurableIntent,
  enqueue,
  listAll,
  listDurableIntents,
  openStorage,
  publishDurableIntentCommands,
  reopenDurableIntentStep,
  wipeOutbox,
  type IntentCommandOutcome,
  type TestStorage,
} from '../../helpers/client-storage'

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

/** The private quote configuration a link depends on before its catalog id exists. */
function configurationCommand(instrumentId = 'instrument-1') {
  return {
    action: 'create' as const,
    entityType: 'userInstrument' as const,
    data: {
      id: instrumentId,
      instrumentId,
      alias: 'asset-1',
      quoteConfig: {
        type: 'etf',
        symbol: 'LINK',
        market: '',
        currency: 'EUR',
        provider: 'yahoo',
        active: true,
      },
    },
  }
}

/** A recurrence write whose only step is one occurrence (#493). */
function ruleWriteIntent(pendingId: string) {
  return {
    kind: 'recurringRuleWrite' as const,
    ownerUserId: USER_ID,
    targetIds: ['rule-1'],
    steps: [`pending:${pendingId}`],
    payload: { ruleId: 'rule-1' },
  }
}

function pendingCreate(id: string) {
  return {
    action: 'create' as const,
    entityType: 'pendingMovement' as const,
    data: {
      id,
      recurringRuleId: 'srv-rule',
      accountId: 'srv-account',
      amount: 900,
      currency: 'EUR',
      dueDate: '2026-11-05',
      type: 'expense',
      description: 'Alquiler',
      status: 'pending',
    },
  }
}

function linkWithConfiguration(overrides: Record<string, unknown> = {}) {
  return linkIntent({
    targetIds: ['movement-1'],
    steps: ['configuration', 'movement-1'],
    ...overrides,
  })
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

  it('acepta la intención con su comando de configuración en una sola transacción', async () => {
    const accepted = await acceptDurableIntent(db, {
      ...linkWithConfiguration(),
      commands: [{ step: 'configuration', command: configurationCommand() }],
    })

    const configuration = accepted.steps.find((step) => step.step === 'configuration')
    expect(accepted.intent.state).toBe('sending')
    expect(configuration).toMatchObject({ state: 'queued', attempt: 1 })
    expect(accepted.steps.find((step) => step.step === 'movement-1')?.state).toBe('pending')

    const entries = await listAll(db)
    expect(entries).toHaveLength(1)
    expect(entries[0].intent).toEqual({
      intentId: accepted.intent.id,
      step: 'configuration',
    })
    expect(entries[0].command).toMatchObject({
      action: 'create',
      entityType: 'userInstrument',
      commandId: configuration?.commandId,
    })

    // The accepted configuration survives reopening the storage with the intent.
    db.close()
    db = await openStorage(USER_ID)
    const [reloaded] = await listDurableIntents(db)
    expect(reloaded.intent.state).toBe('sending')
    expect(reloaded.steps.find((step) => step.step === 'configuration')).toMatchObject({
      state: 'queued',
      commandId: configuration?.commandId,
    })
  })

  it('adopta un comando de configuración ya encolado sin reescribirlo', async () => {
    const queued = await enqueue(db, configurationCommand())

    const accepted = await acceptDurableIntent(db, {
      ...linkWithConfiguration(),
      adopt: [{ step: 'configuration', seq: queued.seq }],
    })

    const configuration = accepted.steps.find((step) => step.step === 'configuration')
    expect(configuration).toMatchObject({
      state: 'queued',
      seq: queued.seq,
      commandId: queued.command.commandId,
    })
    const entries = await listAll(db)
    expect(entries).toHaveLength(1)
    expect(entries[0].command).toEqual(queued.command)
    expect(entries[0].intent).toEqual({
      intentId: accepted.intent.id,
      step: 'configuration',
    })
  })

  it('deja la configuración pendiente si el comando a adoptar ya no existe', async () => {
    const accepted = await acceptDurableIntent(db, {
      ...linkWithConfiguration(),
      waitingFor: 'private-configuration',
      adopt: [{ step: 'configuration', seq: 99 }],
    })

    const configuration = accepted.steps.find((step) => step.step === 'configuration')
    expect(configuration).toMatchObject({ state: 'pending', seq: null })
    expect(accepted.intent.state).toBe('waiting')
    expect(accepted.intent.waitingFor).toBe('private-configuration')
    expect(await listAll(db)).toHaveLength(0)
    expect(await countDurableWork(db)).toBe(1)
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

  it('publica los comandos y el progreso en una sola transacción', async () => {
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
  })

  it('confirma una dependencia ya satisfecha sin reenviar su comando', async () => {
    const accepted = await acceptDurableIntent(db, {
      ...linkWithConfiguration(),
      commands: [{ step: 'configuration', command: configurationCommand() }],
    })

    await completeDurableIntentStep(db, accepted.intent.id, 'configuration')

    const [view] = await listDurableIntents(db)
    expect(view.steps.find((step) => step.step === 'configuration')).toMatchObject({
      state: 'confirmed',
    })
    expect(view.intent.state).toBe('local-saved')
    expect(await count(db)).toBe(0)
  })

  it('reabre una configuración cuyo comando desapareció antes de confirmarse', async () => {
    const accepted = await acceptDurableIntent(db, {
      ...linkWithConfiguration(),
      commands: [{ step: 'configuration', command: configurationCommand() }],
    })
    const [queued] = await listAll(db)
    // Another tab sent and retired the command without this page recording
    // the outcome: the step points at a seq that no longer exists.
    await acknowledge(db, [queued.seq])

    await reopenDurableIntentStep(db, accepted.intent.id, 'configuration')
    let [view] = await listDurableIntents(db)
    expect(view.steps.find((step) => step.step === 'configuration')).toMatchObject({
      state: 'pending',
      seq: null,
    })

    const again = await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'configuration', command: configurationCommand() },
    ])
    expect(again.published).toHaveLength(1)
    expect(again.published[0].commandId).not.toBe(queued.command.commandId)
    ;[view] = await listDurableIntents(db)
    expect(view.steps.find((step) => step.step === 'configuration')?.state).toBe('queued')
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

  it('serializa dos conexiones y solo una publica el mismo paso', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent({ targetIds: ['movement-1'] }))
    const otherTab = await openStorage(USER_ID)
    try {
      const [fromThisTab, fromOtherTab] = await Promise.all([
        publishDurableIntentCommands(db, accepted.intent.id, [
          { step: 'movement-1', command: updateCommand('movement-1') },
        ]),
        publishDurableIntentCommands(otherTab, accepted.intent.id, [
          { step: 'movement-1', command: updateCommand('movement-1') },
        ]),
      ])
      expect(fromThisTab.published.length + fromOtherTab.published.length).toBe(1)
      expect(await count(db)).toBe(1)
      const [view] = await listDurableIntents(db)
      expect(view.steps[0].state).toBe('queued')
    } finally {
      otherTab.close()
    }
  })

  it('una sola pestaña reclama el envío del comando de la intención', async () => {
    const accepted = await acceptDurableIntent(db, linkIntent({ targetIds: ['movement-1'] }))
    await publishDurableIntentCommands(db, accepted.intent.id, [
      { step: 'movement-1', command: updateCommand('movement-1') },
    ])
    const [entry] = await listCommands(db)
    const otherTab = await openStorage(USER_ID)
    try {
      const [first, second] = await Promise.all([
        claimDurableIntentCommands(db, [entry.seq], 'tab-a'),
        claimDurableIntentCommands(otherTab, [entry.seq], 'tab-b'),
      ])
      expect(first.size + second.size).toBe(1)
    } finally {
      otherTab.close()
    }
  })

  it('reserva una ocurrencia dentro de la misma transacción: dos pestañas no crean dos pendientes', async () => {
    const otherTab = await openStorage(USER_ID)
    try {
      // Two tabs generate the same rule+dueDate occurrence with their own
      // pending ids and accept one intent each, as a concurrent refresh would.
      const first = await acceptDurableIntent(db, ruleWriteIntent('pending-a'))
      const second = await acceptDurableIntent(otherTab, ruleWriteIntent('pending-b'))
      const occurrence = { ruleId: 'srv-rule', dueDate: '2026-11-05' }
      const [firstResult, secondResult] = await Promise.all([
        publishDurableIntentCommands(db, first.intent.id, [
          {
            step: 'pending:pending-a',
            command: pendingCreate('pending-a'),
            occurrence,
          },
        ]),
        publishDurableIntentCommands(otherTab, second.intent.id, [
          {
            step: 'pending:pending-b',
            command: pendingCreate('pending-b'),
            occurrence,
          },
        ]),
      ])

      const creates = (await listAll(db)).filter(
        (entry) =>
          entry.command.action === 'create' && entry.command.entityType === 'pendingMovement',
      )
      expect(creates).toHaveLength(1)
      // One tab queued the occurrence; the other completed its own step without
      // a second command because the guard runs inside the readwrite transaction.
      expect(firstResult.published.length + secondResult.published.length).toBe(1)
      const stepStates = (await listDurableIntents(db))
        .map((view) => view.steps.find((step) => step.step.startsWith('pending:'))?.state)
        .sort()
      expect(stepStates).toEqual(['confirmed', 'queued'])
      expect(await countDurableWork(db)).toBe(1)
    } finally {
      otherTab.close()
    }
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
