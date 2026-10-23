import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { createTestPinia } from '../helpers/pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import { listAll, openOutbox } from '../../src/lib/client/outbox'
import { useSyncStore } from '../../src/stores/sync'

const EMPTY_BOOTSTRAP = {
  revision: 0,
  settings: null,
  accounts: [],
  categories: [],
  transactions: [],
  subscriptions: [],
  recurringRules: [],
  pendingMovements: [],
  budgetEntries: [],
  goals: [],
  contributions: [],
  userInstruments: [],
  wealthSnapshots: [],
}

type SyncHandler = (commands: Array<{ commandId: string }>) => Response

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let userCounter = 0

describe('useSyncStore — queue never stays poisoned (audit §2)', () => {
  let onSync: SyncHandler
  let changes: unknown[]
  let userId: string

  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
    setActivePinia(createTestPinia())
    userCounter += 1
    userId = `queue-user-${userCounter}`
    changes = []
    onSync = (commands) =>
      json({
        results: commands.map((c) => ({ commandId: c.commandId, status: 'noop' })),
        revision: 0,
        halted: false,
      })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/bootstrap') return json(EMPTY_BOOTSTRAP)
        if (url.startsWith('/api/changes')) return json({ revision: changes.length, changes })
        if (url === '/api/sync') return onSync(JSON.parse(String(init?.body)).commands)
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  async function queued() {
    const db = await openOutbox(userId)
    try {
      return await listAll(db)
    } finally {
      db.close()
    }
  }

  it('drops a command the server rejects and keeps flushing the rest', async () => {
    onSync = (commands) =>
      json({
        results: commands.map((c, i) =>
          i === 0
            ? {
                commandId: c.commandId,
                status: 'rejected',
                message: 'La cuenta indicada no existe',
              }
            : { commandId: c.commandId, status: 'noop' },
        ),
        revision: 0,
        halted: false,
      })
    const store = useSyncStore()
    await store.init(userId)

    await store.enqueueCommand({ action: 'noop' })
    await vi.waitFor(async () => expect(await queued()).toHaveLength(0))
    expect(store.lastError).toContain('La cuenta indicada no existe')
  })

  it('keeps the head entry through repeated server failures so a Worker outage never loses an edit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    onSync = () => json({ error: 'Error interno del servidor.' }, 500)
    const store = useSyncStore()
    await store.init(userId)

    await store.enqueueCommand({ action: 'noop', commandId: 'poison' })
    for (
      let attempt = 0;
      attempt < 10 && (await queued()).some((e) => e.command.commandId === 'poison');
      attempt += 1
    ) {
      await vi.runOnlyPendingTimersAsync()
      await vi.waitFor(async () => expect(store.syncStatus).not.toBe('syncing'))
    }

    expect((await queued()).some((e) => e.command.commandId === 'poison')).toBe(true)
    expect(store.lastError).toBeTruthy()
  })

  it('keeps an in_progress command queued, without counting a failure, and resends it after a backoff (issue #202)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let calls = 0
    onSync = (commands) => {
      calls += 1
      return json({
        results: [
          { commandId: commands[0].commandId, status: calls === 1 ? 'in_progress' : 'applied' },
        ],
        revision: 0,
        halted: calls === 1,
      })
    }
    const store = useSyncStore()
    await store.init(userId)

    await store.enqueueCommand({ action: 'noop', commandId: 'racing' })
    await vi.waitFor(() => expect(calls).toBe(1))
    await vi.waitFor(async () => expect((await queued())[0]).toMatchObject({ attempts: 0 }))
    expect(store.lastError).toBeNull()
    expect(store.syncStatus).toBe('idle')

    await vi.runOnlyPendingTimersAsync()
    await vi.waitFor(async () => expect(await queued()).toHaveLength(0))
    expect(calls).toBe(2)
  })

  it('ignores pulled changes for stores the local cache does not have (userSettings)', async () => {
    changes = [
      {
        entityType: 'userSettings',
        entityId: userId,
        changeType: 'update',
        payload: JSON.stringify({ currency: 'USD' }),
      },
    ]
    const store = useSyncStore()
    await expect(store.init(userId)).resolves.toBeUndefined()
    expect(store.revision).toBe(1)
  })

  it("auto-retries a conflicted update against the server's currentVersion, with no manual resolution (ADR 0003)", async () => {
    const sent: Array<{ baseVersion?: number }> = []
    let conflictReturned = false
    onSync = (commands) => {
      sent.push(...(commands as Array<{ baseVersion?: number }>))
      if (!conflictReturned) {
        conflictReturned = true
        return json(
          {
            results: commands.map((c) => ({
              commandId: c.commandId,
              status: 'conflict',
              currentVersion: 7,
            })),
            revision: 0,
            halted: true,
          },
          409,
        )
      }
      return json({
        results: commands.map((c) => ({ commandId: c.commandId, status: 'applied' })),
        revision: 1,
        halted: false,
      })
    }
    const store = useSyncStore()
    await store.init(userId)
    await store.enqueueCommand({
      action: 'update',
      entityType: 'account',
      entityId: 'acc-1',
      baseVersion: 3,
      patch: { name: 'x' },
    })

    // No dialog, no manual choice: the retry fires on its own and the
    // outbox drains without anyone calling a resolution function.
    await vi.waitFor(async () => expect(await queued()).toHaveLength(0))
    expect(sent.at(-1)?.baseVersion).toBe(7)
  })

  it('keeps flushing an unrelated queued command after another one conflicts (ADR 0003)', async () => {
    let batchCount = 0
    onSync = (commands) => {
      batchCount += 1
      if (batchCount === 1) {
        // Mirrors `applySyncBatch`'s real fail-fast semantics: it halts on
        // the first conflict and never even attempts what came after it in
        // the same batch — those wait for the next round.
        return json(
          {
            results: [{ commandId: commands[0].commandId, status: 'conflict', currentVersion: 9 }],
            revision: 0,
            halted: true,
          },
          409,
        )
      }
      return json({
        results: commands.map((c) => ({ commandId: c.commandId, status: 'applied' })),
        revision: 1,
        halted: false,
      })
    }
    const store = useSyncStore()
    await store.init(userId)

    await store.enqueueCommand({
      action: 'update',
      entityType: 'account',
      entityId: 'acc-1',
      baseVersion: 3,
      patch: { name: 'x' },
    })
    await store.enqueueCommand({ action: 'noop' })

    // The conflict on the first command must not freeze the second one
    // behind it forever.
    await vi.waitFor(async () => expect(await queued()).toHaveLength(0))
  })

  it("rebases a conflicted settingsUpdate over the server's version instead of parking it (audit §6.4)", async () => {
    const sent: Array<{ action: string; baseVersion?: number }> = []
    let conflictReturned = false
    onSync = (commands) => {
      sent.push(...(commands as unknown as Array<{ action: string; baseVersion?: number }>))
      if (!conflictReturned) {
        conflictReturned = true
        return json(
          {
            results: commands.map((c) => ({
              commandId: c.commandId,
              status: 'conflict',
              currentVersion: 4,
            })),
            revision: 0,
            halted: true,
          },
          409,
        )
      }
      return json({
        results: commands.map((c) => ({ commandId: c.commandId, status: 'applied' })),
        revision: 1,
        halted: false,
      })
    }
    const store = useSyncStore()
    await store.init(userId)

    await store.enqueueCommand({
      action: 'settingsUpdate',
      baseVersion: 2,
      patch: { currency: 'USD' },
    })

    // The settings singleton has no `entityId`, so without the explicit
    // rebase the stale `baseVersion` would conflict forever and the entry
    // would never leave the outbox.
    await vi.waitFor(async () => expect(await queued()).toHaveLength(0))
    expect(sent.at(-1)).toMatchObject({ action: 'settingsUpdate', baseVersion: 4 })
  })
})

describe('logout and session expiry preserve queued work', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
    setActivePinia(createTestPinia())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  it('refuses logout when pending commands cannot be synchronized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/bootstrap'
          ? json(EMPTY_BOOTSTRAP)
          : url.startsWith('/api/changes')
            ? json({ revision: 0, changes: [] })
            : json({}, 500),
      ),
    )
    const store = useSyncStore()
    const identity = 'logout-pending-user'
    await store.init(identity)
    await store.enqueueCommand({ action: 'noop', commandId: 'unsent-before-logout' })
    await expect(store.logout()).rejects.toThrow('No se pudieron sincronizar')
    expect(store.userId).toBe(identity)
    const db = await openOutbox(identity)
    expect((await listAll(db)).map((entry) => entry.command.commandId)).toContain(
      'unsent-before-logout',
    )
    db.close()
    store.detach()
  })
  it('stops sending after revocation and retains the identity-bound command', async () => {
    const send = vi.fn(async (url: string) =>
      url === '/api/bootstrap'
        ? json(EMPTY_BOOTSTRAP)
        : url.startsWith('/api/changes')
          ? json({ revision: 0, changes: [] })
          : json({}, 401),
    )
    vi.stubGlobal('fetch', send)
    const store = useSyncStore()
    const identity = 'revoked-pending-user'
    await store.init(identity)
    await store.enqueueCommand({ action: 'noop', commandId: 'preserved-on-revocation' })
    await vi.waitFor(() => expect(store.syncStatus).toBe('error'))
    send.mockClear()
    await store.syncNow()
    expect(send).not.toHaveBeenCalled()
    const db = await openOutbox(identity)
    expect((await listAll(db)).map((entry) => entry.command.commandId)).toContain(
      'preserved-on-revocation',
    )
    db.close()
    store.detach()
  })
})
