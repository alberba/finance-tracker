import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  InvalidCommandError,
  acknowledge,
  clear,
  count,
  enqueue,
  listAll,
  openStorage,
  peekBatch,
  recordFailure,
  wipeOutbox,
} from '../helpers/client-storage'
import { generateCommandId } from '../../src/lib/client/outbox'

const USER_ID = 'user-outbox-test'

describe('outbox', () => {
  let db: Awaited<ReturnType<typeof openStorage>>

  beforeEach(async () => {
    await wipeOutbox(USER_ID)
    db = await openStorage(USER_ID)
  })

  afterEach(async () => {
    db.close()
    await wipeOutbox(USER_ID)
  })

  it('generates a unique commandId when none is supplied', () => {
    const a = generateCommandId()
    const b = generateCommandId()
    expect(a).not.toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('enqueues a valid command and assigns an incrementing seq', async () => {
    const first = await enqueue(db, {
      action: 'create',
      entityType: 'account',
      data: { name: 'Cuenta', kind: 'checking', currency: 'EUR', openingBalance: 0 },
    })
    const second = await enqueue(db, { action: 'noop' })
    expect(second.seq).toBeGreaterThan(first.seq)
    expect(first.command.commandId).toBeTruthy()
  })

  it('rejects a command that does not match the server schema', async () => {
    await expect(
      // @ts-expect-error deliberately missing required `entityId`/`baseVersion` for `update`
      enqueue(db, {
        action: 'update',
        entityType: 'account',
        patch: { name: 'Nueva' },
      }),
    ).rejects.toBeInstanceOf(InvalidCommandError)
    expect(await count(db)).toBe(0)
  })

  it("rejects a create whose per-entity data carries a field the schema doesn't declare (issue #138)", async () => {
    await expect(
      enqueue(db, {
        action: 'create',
        entityType: 'account',
        data: {
          name: 'Cuenta',
          kind: 'cash',
          currency: 'EUR',
          openingBalance: 0,
          bogusField: 'no destino',
        },
      }),
    ).rejects.toBeInstanceOf(InvalidCommandError)
    expect(await count(db)).toBe(0)
  })

  it("rejects an update whose per-entity patch carries a field the schema doesn't declare (issue #138)", async () => {
    await expect(
      enqueue(db, {
        action: 'update',
        entityType: 'account',
        entityId: 'acc-1',
        baseVersion: 0,
        patch: { name: 'Nueva', bogusField: 'no destino' },
      }),
    ).rejects.toBeInstanceOf(InvalidCommandError)
    expect(await count(db)).toBe(0)
  })

  it('lists entries FIFO and peekBatch caps at the requested limit', async () => {
    for (let i = 0; i < 7; i += 1) {
      await enqueue(db, { action: 'noop' })
    }
    const all = await listAll(db)
    expect(all).toHaveLength(7)
    expect([...all].sort((a, b) => a.seq - b.seq)).toEqual(all)

    const batch = await peekBatch(db, 5)
    expect(batch).toHaveLength(5)
    expect(batch[0]?.seq).toBe(all[0]?.seq)
  })

  it('acknowledge removes entries from the queue', async () => {
    const entry = await enqueue(db, { action: 'noop' })
    await acknowledge(db, [entry.seq])
    expect(await count(db)).toBe(0)
  })

  it('recordFailure increments attempts without dequeuing', async () => {
    const entry = await enqueue(db, { action: 'noop' })
    await recordFailure(db, entry.seq, 'network error')
    const [reloaded] = await listAll(db)
    expect(reloaded?.attempts).toBe(1)
    expect(reloaded?.lastError).toBe('network error')
    expect(await count(db)).toBe(1)
  })

  it('clear empties the whole outbox', async () => {
    await enqueue(db, { action: 'noop' })
    await enqueue(db, { action: 'noop' })
    await clear(db)
    expect(await count(db)).toBe(0)
  })

  it('wipeOutbox deletes the whole per-user database', async () => {
    await enqueue(db, { action: 'noop' })
    db.close()

    await wipeOutbox(USER_ID)

    db = await openStorage(USER_ID)
    expect(await count(db)).toBe(0)
  })
})
