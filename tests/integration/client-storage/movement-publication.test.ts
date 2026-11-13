import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  acceptDurableIntent,
  count,
  listAll,
  listDurableIntents,
  openStorage,
  publishMovementCommands,
  readMovementPublications,
  wipeOutbox,
  type MovementPublicationInput,
  type TestStorage,
} from '../../helpers/client-storage'

const USER_ID = 'user-movement-publication'

function input(overrides: Partial<MovementPublicationInput> = {}): MovementPublicationInput {
  return {
    movementId: 'movement-1',
    plan: {
      action: 'update',
      ref: { entityId: 'movement-1', baseVersion: 1 },
      patch: { amount: 200, description: 'Compra revisada' },
    },
    origin: 'movement',
    type: 'investment',
    instrumentId: null,
    fingerprint: 'fingerprint-1',
    ...overrides,
  }
}

describe('disciplina de publicación de movimientos (#489)', () => {
  let db: TestStorage

  beforeEach(async () => {
    await wipeOutbox(USER_ID)
    db = await openStorage(USER_ID)
  })

  afterEach(async () => {
    db.close()
    await wipeOutbox(USER_ID)
  })

  it('rechaza una publicación cuya generación ya cambió y no escribe el comando', async () => {
    await publishMovementCommands(db, [input()])

    const [stale] = await publishMovementCommands(db, [
      input({
        expectedGeneration: 0,
        plan: {
          action: 'update',
          ref: { entityId: 'movement-1', baseVersion: 1 },
          patch: { amount: 999 },
        },
      }),
    ])

    expect(stale).toMatchObject({ outcome: 'stale', generation: 1 })
    expect(stale.record).toMatchObject({ generation: 1 })
    expect(await count(db)).toBe(1)
    const commands = await listAll(db)
    expect(commands[0].command).toMatchObject({ patch: { amount: 200 } })
  })

  it('serializa dos conexiones y solo una gana la misma generación', async () => {
    await publishMovementCommands(db, [input()])
    const otherTab = await openStorage(USER_ID)

    try {
      const guarded = (description: string, writerId: string) =>
        publishMovementCommands(
          db,
          [
            input({
              expectedGeneration: 1,
              plan: {
                action: 'update',
                ref: { entityId: 'movement-1', baseVersion: 1 },
                patch: { amount: 300, description },
              },
            }),
          ],
          { writerId },
        )
      const otherGuarded = (description: string, writerId: string) =>
        publishMovementCommands(
          otherTab,
          [
            input({
              expectedGeneration: 1,
              plan: {
                action: 'update',
                ref: { entityId: 'movement-1', baseVersion: 1 },
                patch: { amount: 400, description },
              },
            }),
          ],
          { writerId },
        )

      const [fromThisTab, fromOtherTab] = await Promise.all([
        guarded('esta pestaña', 'tab-a'),
        otherGuarded('otra pestaña', 'tab-b'),
      ])

      const outcomes = [fromThisTab[0].outcome, fromOtherTab[0].outcome].sort()
      expect(outcomes).toEqual(['published', 'stale'])
      expect(await count(db)).toBe(2)
      const records = await readMovementPublications(db, ['movement-1'])
      expect(records.get('movement-1')?.generation).toBe(2)
    } finally {
      otherTab.close()
    }
  })

  it('guarda la proveniencia del vínculo junto al comando, sin tocar el comando enviado', async () => {
    const [result] = await publishMovementCommands(db, [
      input({
        origin: 'instrumentLink',
        instrumentId: 'instrument-1',
        link: { instrumentId: 'instrument-1' },
      }),
    ])

    const commands = await listAll(db)
    expect(commands[0].publication).toMatchObject({
      movementId: 'movement-1',
      origin: 'instrumentLink',
      generation: 1,
      instrumentId: 'instrument-1',
    })
    expect(commands[0].command).toMatchObject({
      action: 'update',
      entityType: 'transaction',
      entityId: 'movement-1',
    })
    expect(result.seq).toBe(commands[0].seq)
  })

  it('publica el paso de una intención y su progreso en la misma transacción', async () => {
    const accepted = await acceptDurableIntent(db, {
      kind: 'instrumentLink',
      ownerUserId: USER_ID,
      targetIds: ['movement-1'],
      payload: { instrumentId: 'instrument-1' },
    })
    const [result] = await publishMovementCommands(db, [
      input({
        intent: { intentId: accepted.intent.id, step: 'movement-1' },
        link: { instrumentId: 'instrument-1' },
        origin: 'instrumentLink',
        instrumentId: 'instrument-1',
      }),
    ])

    expect(result).toMatchObject({ outcome: 'published', commandId: expect.any(String) })
    const [view] = await listDurableIntents(db)
    expect(view.intent.state).toBe('sending')
    expect(view.steps[0]).toMatchObject({
      state: 'queued',
      commandId: result.commandId,
      seq: result.seq,
      attempt: 1,
    })
    const commands = await listAll(db)
    expect(commands[0].intent).toEqual({
      intentId: accepted.intent.id,
      step: 'movement-1',
    })
    // The intent metadata never enters the command the server receives.
    expect(commands[0].command).not.toHaveProperty('intent')
  })

  it('no vuelve a publicar un paso que otra pestaña ya encoló', async () => {
    const accepted = await acceptDurableIntent(db, {
      kind: 'instrumentLink',
      ownerUserId: USER_ID,
      targetIds: ['movement-1'],
      payload: { instrumentId: 'instrument-1' },
    })
    await publishMovementCommands(db, [
      input({
        intent: { intentId: accepted.intent.id, step: 'movement-1' },
      }),
    ])
    const otherTab = await openStorage(USER_ID)
    try {
      const [second] = await publishMovementCommands(otherTab, [
        input({
          intent: { intentId: accepted.intent.id, step: 'movement-1' },
        }),
      ])
      expect(second.outcome).toBe('skipped')
      expect(await count(db)).toBe(1)
    } finally {
      otherTab.close()
    }
  })

  it('funde una edición en el create todavía encolado en la misma transacción', async () => {
    await publishMovementCommands(db, [
      input({
        plan: {
          action: 'create',
          data: {
            id: 'movement-1',
            accountId: 'account-1',
            categoryId: 'category-1',
            type: 'investment',
            date: '2026-01-15',
            description: 'Compra antigua',
            amount: -201,
            currency: 'EUR',
          },
        },
      }),
    ])

    const [result] = await publishMovementCommands(db, [
      input({ plan: { action: 'update', patch: { amount: 200, description: 'Compra revisada' } } }),
    ])

    expect(result).toMatchObject({ outcome: 'published', generation: 2 })
    expect(await count(db)).toBe(1)
    const commands = await listAll(db)
    expect(commands[0].command).toMatchObject({
      action: 'create',
      data: { id: 'movement-1', amount: 200, description: 'Compra revisada' },
    })
  })

  it('cancela el create encolado y deja una lápida al borrar un movimiento', async () => {
    await publishMovementCommands(db, [
      input({
        plan: {
          action: 'create',
          data: {
            id: 'movement-1',
            accountId: 'account-1',
            categoryId: 'category-1',
            type: 'investment',
            date: '2026-01-15',
            description: 'Compra antigua',
            amount: -201,
            currency: 'EUR',
          },
        },
      }),
    ])

    await publishMovementCommands(db, [
      input({ plan: { action: 'remove' }, origin: 'movement', fingerprint: '' }),
    ])

    expect(await count(db)).toBe(0)
    const records = await readMovementPublications(db, ['movement-1'])
    expect(records.get('movement-1')).toMatchObject({ generation: 2, status: 'deleted' })
  })
})
