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
} from '../../helpers/client-storage'
import { OUTBOX_DB_VERSION, generateCommandId } from '../../../src/lib/client/outbox'

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

  it('conserva los comandos existentes al subir la base de la cola a la versión actual', async () => {
    const upgradeUser = 'user-outbox-upgrade'
    const name = `finance-tracker-outbox-v2:${upgradeUser}`
    await wipeOutbox(upgradeUser)
    // A queue written by the previous build: version 1, only `commands`.
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('commands', { keyPath: 'seq', autoIncrement: true })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction('commands', 'readwrite')
      tx.objectStore('commands').add({
        command: { commandId: 'existing-command', action: 'noop' },
        enqueuedAt: '2026-11-01T10:00:00.000Z',
        attempts: 0,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    legacy.close()

    const upgraded = await openStorage(upgradeUser)
    try {
      const entries = await listAll(upgraded)
      expect(entries).toHaveLength(1)
      expect(entries[0].command).toMatchObject({
        commandId: 'existing-command',
        action: 'noop',
      })
    } finally {
      upgraded.close()
      await wipeOutbox(upgradeUser)
    }
  })

  it('conserva los comandos y las generaciones al subir de la versión 2 a la actual', async () => {
    const upgradeUser = 'user-outbox-upgrade-v2'
    const name = `finance-tracker-outbox-v2:${upgradeUser}`
    await wipeOutbox(upgradeUser)
    // The #489 build: version 2 with commands and movementPublications.
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('commands', { keyPath: 'seq', autoIncrement: true })
        request.result.createObjectStore('movementPublications', { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction(['commands', 'movementPublications'], 'readwrite')
      tx.objectStore('commands').add({
        command: { commandId: 'v2-command', action: 'noop' },
        enqueuedAt: '2026-11-01T10:00:00.000Z',
        attempts: 0,
      })
      tx.objectStore('movementPublications').put({
        id: 'movement-v2',
        generation: 3,
        status: 'active',
        type: 'expense',
        instrumentId: null,
        unlinked: false,
        writerId: 'tab',
        origin: 'movement',
        fingerprint: 'f',
        updatedAt: '2026-11-01T10:00:00.000Z',
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    legacy.close()

    const upgraded = await openStorage(upgradeUser)
    try {
      const entries = await listAll(upgraded)
      expect(entries.map((entry) => entry.command.commandId)).toEqual(['v2-command'])
      const tx = upgraded.outbox.transaction('movementPublications', 'readonly')
      const record = await new Promise<{ generation: number }>((resolve, reject) => {
        const request = tx.objectStore('movementPublications').get('movement-v2')
        request.onsuccess = () => resolve(request.result as { generation: number })
        request.onerror = () => reject(request.error)
      })
      expect(record.generation).toBe(3)
      expect(upgraded.outbox.version).toBe(OUTBOX_DB_VERSION)
    } finally {
      upgraded.close()
      await wipeOutbox(upgradeUser)
    }
  })

  it('cede la conexión cuando otra pestaña abre una versión superior', async () => {
    const upgradeUser = 'user-outbox-versionchange'
    const name = `finance-tracker-outbox-v2:${upgradeUser}`
    await wipeOutbox(upgradeUser)
    const storage = await openStorage(upgradeUser)
    try {
      const newer = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, OUTBOX_DB_VERSION + 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        expect(() => storage.outbox.transaction('commands', 'readonly')).toThrow()
      } finally {
        newer.close()
      }
    } finally {
      storage.close()
      await wipeOutbox(upgradeUser)
    }
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

  it('pliega el contenido nuevo en un create que aún no se ha enviado', async () => {
    const first = await enqueue(db, {
      action: 'create',
      entityType: 'account',
      data: { id: 'acc-fold', name: 'Cuenta', kind: 'checking', currency: 'EUR', openingBalance: 0 },
    })
    const folded = await enqueue(db, {
      action: 'create',
      entityType: 'account',
      data: { id: 'acc-fold', name: 'Cuenta renombrada', kind: 'checking', currency: 'EUR', openingBalance: 0 },
    })

    expect(folded.seq).toBe(first.seq)
    expect(folded.command.commandId).toBe(first.command.commandId)
    const [entry] = await listAll(db)
    expect(entry.command).toMatchObject({
      action: 'create',
      data: { id: 'acc-fold', name: 'Cuenta renombrada' },
    })
    expect(await count(db)).toBe(1)
  })

  it('no reescribe el contenido de un create ya enviado: publica otro comando con identidad nueva', async () => {
    const first = await enqueue(db, {
      action: 'create',
      entityType: 'account',
      data: { id: 'acc-sent', name: 'Cuenta', kind: 'checking', currency: 'EUR', openingBalance: 0 },
    })
    // The command may already be on the wire with its uncertain outcome.
    await recordFailure(db, first.seq, 'timeout')

    const changed = await enqueue(db, {
      action: 'create',
      entityType: 'account',
      data: { id: 'acc-sent', name: 'Cuenta corregida', kind: 'checking', currency: 'EUR', openingBalance: 0 },
    })

    expect(changed.seq).not.toBe(first.seq)
    expect(changed.command.commandId).not.toBe(first.command.commandId)
    expect(changed.command).toMatchObject({
      action: 'update',
      entityType: 'account',
      entityId: 'acc-sent',
      baseVersion: 0,
      patch: { name: 'Cuenta corregida' },
    })
    expect((changed.command as { patch: Record<string, unknown> }).patch).not.toHaveProperty('id')
    expect(await count(db)).toBe(2)
    // The already-sent create keeps its exact content for an idempotent resend.
    const queued = await listAll(db)
    expect(queued[0].command).toMatchObject({ data: { name: 'Cuenta' } })
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
