/**
 * Round-trip harness — the missing test tier the persistence audit asks for
 * (`docs/archive/d1-v2-persistence-audit.md` §9).
 *
 * Every bug in that audit lives in a *seam* between layers, which is exactly
 * what the existing tiers don't cross: repository tests stop at the row,
 * projection tests start from a hand-written bootstrap, and the E2E suite runs
 * through the sync-v2 store. So a field can be dropped by a Zod schema, never
 * given a column, or read back from the wrong place, and every tier stays green.
 *
 * This harness closes the loop:
 *
 *   store mutation → command → outbox → applySyncBatch → real SQLite
 *     → buildBootstrapPayload → projectSyncV2State → normalizeState
 *
 * It runs the *real* client stores against a *real* SQLite database with
 * `migrations-v2/*.sql` applied, by stubbing `fetch` so `/api/sync` and
 * `/api/bootstrap` hit the server code in-process instead of the network.
 * A test therefore asserts the only thing that matters to the user: "I typed
 * this, I reloaded, do I still see it?"
 */

import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { createTestPinia } from '../../../helpers/pinia'
import { vi } from 'vitest'
import { users } from '../../../../src/db/schema'
import { applySyncBatch } from '../../../../src/lib/server/sync/apply-command'
import { buildBootstrapPayload } from '../../../../src/lib/server/bootstrap-payload'
import { listChangesSince } from '../../../../src/db/repositories/sync'
import type { State } from '../../../../src/scripts/types'
import { createTestDb, type TestDatabase } from '../setup'
import type { Db } from '../../../../src/db/client'

/**
 * The test database is better-sqlite3-backed, so it lacks D1's `batch`. No
 * server code under test uses it; this keeps the seam honest without widening
 * the production type.
 */
function asServerDb(db: TestDatabase['db']): Db {
  return db as unknown as Db
}

export interface RoundTrip {
  /** The user every command is applied as. */
  userId: string
  /** Live SQLite handle, for asserting on rows directly. */
  testDb: TestDatabase
  /** Waits for the outbox to drain, then rebuilds the state a reload would show. */
  reload: () => Promise<State>
  /** Rows currently pending in the client outbox (should be empty after a flush). */
  pending: () => Promise<unknown[]>
  /** Rebuilds what the UI shows *without* flushing — a reload while offline. */
  reloadOffline: () => Promise<State>
  /** Simulates losing the network: `/api/sync` and `/api/bootstrap` start failing. */
  setOffline: (offline: boolean) => void
  /** Applies commands as if another device had sent them. */
  asOtherDevice: (commands: unknown[]) => Promise<void>
  /** The client's own sync store, for cursor/cache assertions. */
  syncStore: ReturnType<typeof import('../../../../src/stores/sync').useSyncStore>
  /**
   * Restarts the client the way closing and reopening the tab would: a new
   * Pinia, a fresh sync store, the same IndexedDB. This is the only way to
   * exercise `init()`, which is guarded against running twice.
   */
  reboot: () => Promise<State>
  cleanup: () => void
}

/** Lets pending microtasks and timers run — see `reload()`. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Boots a client (Pinia + IndexedDB + sync store) wired to a fresh database.
 * Call inside `beforeEach`; call `cleanup()` in `afterEach`.
 */
export async function startRoundTrip(
  /**
   * Rows to create *before* the client boots — use it for anything the v1
   * migration would have written, since the local cache only learns about
   * pre-existing rows through the initial bootstrap.
   */
  seed?: (db: TestDatabase['db'], userId: string) => Promise<void>,
): Promise<RoundTrip> {
  const testDb = createTestDb()
  const now = new Date().toISOString()
  const [user] = await testDb.db
    .insert(users)
    .values({
      email: `round-trip-${Math.random().toString(36).slice(2)}@example.com`,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  vi.stubGlobal('navigator', { onLine: true })
  setActivePinia(createTestPinia())

  let offline = false

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (offline) {
        throw new TypeError('Failed to fetch')
      }
      if (url.startsWith('/api/bootstrap')) {
        return json(await buildBootstrapPayload(asServerDb(testDb.db), user.id))
      }
      if (url.startsWith('/api/changes')) {
        const since = Number(new URL(url, 'https://test.local').searchParams.get('since') ?? 0)
        const changes = await listChangesSince(asServerDb(testDb.db), user.id, since)
        return json({ revision: changes.at(-1)?.revision ?? since, changes })
      }
      if (url === '/api/sync') {
        const { commands } = JSON.parse(String(init?.body))
        return json(await applySyncBatch(asServerDb(testDb.db), user.id, commands))
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )

  if (seed) {
    await seed(testDb.db, user.id)
  }

  const { useSyncStore } = await import('../../../../src/stores/sync')
  let syncStore = useSyncStore()
  await syncStore.init(user.id)

  /** Waits until the outbox stops changing and, when online, has drained. */
  async function quiesce(): Promise<void> {
    const { count: countOutbox, openOutbox } = await import('../../../../src/lib/client/outbox')
    const db = await openOutbox(user.id)
    try {
      let last = -1
      let stable = 0
      for (let round = 0; round < 400 && stable < 3; round += 1) {
        await settle()
        if (!offline) await syncStore.syncNow()
        const count = await countOutbox(db)
        stable = count === last && (offline || count === 0) ? stable + 1 : 0
        last = count
      }
      if (stable < 3) throw new Error(`El cliente no se estabilizó (${last} pendientes).`)
    } finally {
      db.close()
    }
  }

  /** Closes and reopens the client: new Pinia, new stores, same IndexedDB. */
  async function reboot(): Promise<State> {
    // An F5 unloads the page: the previous client stops reading, sending and rendering.
    syncStore.detach()
    setActivePinia(createTestPinia())
    const { useSyncStore: freshSyncStore } = await import('../../../../src/stores/sync')
    syncStore = freshSyncStore()
    await syncStore.init(user.id)
    await settle()
    const { useFinancialStateStore } = await import('../../../../src/stores/financial-state')
    return useFinancialStateStore().state
  }

  return {
    userId: user.id,
    testDb,
    pending: async () => {
      const { listAll, openOutbox } = await import('../../../../src/lib/client/outbox')
      const db = await openOutbox(user.id)
      try {
        return await listAll(db)
      } finally {
        db.close()
      }
    },
    get syncStore() {
      return syncStore
    },
    reboot,
    setOffline: (next: boolean) => {
      offline = next
    },
    asOtherDevice: async (commands) => {
      await applySyncBatch(asServerDb(testDb.db), user.id, commands as never)
    },
    reloadOffline: async () => {
      await quiesce()
      return reboot()
    },
    reload: async () => {
      // Store mutations enqueue their commands from floating promises
      // (`void syncListDiff(...)`), so wait until the client is quiet — the
      // queue stable and, online, drained — instead of a fixed number of
      // ticks, which is not enough under full-suite load.
      await quiesce()
      // Then do what an F5 does: a brand-new client that re-reads everything
      // through the app's own bootstrap path. Projecting the payload by hand
      // here would skip exactly the code under test.
      return reboot()
    },
    cleanup: () => {
      testDb.close()
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    },
  }
}
