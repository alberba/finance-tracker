import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { createTestPinia } from '../helpers/pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import {
  commitDurableIntentCommands,
  listAll,
  listDurableIntents,
  openStorage,
  putEntity,
  wipeIdbCache,
  wipeOutbox,
} from '../helpers/client-storage'
import { resumePendingConfirmations } from '../../src/lib/client/recurring-write'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useRecurringStore } from '../../src/stores/recurring'
import { useSyncStore } from '../../src/stores/sync'
import type { PendingMovement } from '../../src/scripts/types'

const USER_ID = 'user-recurring-confirm-durable'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only store handle, closed in afterEach
let activeStore: any = null

function expensePending(overrides: Partial<PendingMovement> = {}): PendingMovement {
  return {
    id: 'pm-exp',
    occurrenceKey: 'rule-exp:2024-02-01',
    ruleId: 'rule-exp',
    occurrenceDate: '2024-02-01',
    type: 'expense',
    accountId: 'checking',
    category: 'Vivienda',
    description: 'Alquiler',
    amount: 900,
    status: 'pending',
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
    transactionId: null,
    ...overrides,
  }
}

function setupState(pendingMovements: PendingMovement[]) {
  setActivePinia(createTestPinia())
  const financialStore = useFinancialStateStore()
  financialStore.replaceState({
    year: 2024,
    currency: 'EUR',
    accounts: [
      { id: 'checking', name: 'Cuenta', openingBalance: 1000 },
      { id: 'savings', name: 'Ahorro', openingBalance: 0 },
    ],
    investmentAssets: [{ id: 'broker', name: 'Binance', openingBalance: 500 }],
    liabilities: [],
    incomeCategories: [],
    expenseCategories: ['Vivienda', 'Ocio'],
    investmentCategories: ['Cripto'],
    transactions: [],
    snapshots: {},
    budget: { income: {}, expense: {}, investment: {} },
    goals: {},
    contributions: [],
    recurringRules: [],
    pendingMovements,
    instruments: [],
    quotes: {},
  })
  return { financialStore, recurringStore: useRecurringStore() }
}

async function seedServerRefs(): Promise<void> {
  const cacheDb = await openStorage(USER_ID)
  await putEntity(cacheDb, 'account', { id: 'srv-account', legacyId: 'checking', version: 0 })
  await putEntity(cacheDb, 'account', { id: 'srv-savings', legacyId: 'savings', version: 0 })
  await putEntity(cacheDb, 'account', {
    id: 'srv-broker',
    legacyId: 'broker',
    kind: 'investment',
    version: 0,
  })
  await putEntity(cacheDb, 'category', {
    id: 'srv-cat-vivienda',
    kind: 'expense',
    name: 'Vivienda',
    version: 0,
  })
  await putEntity(cacheDb, 'category', {
    id: 'srv-cat-ocio',
    kind: 'expense',
    name: 'Ocio',
    version: 0,
  })
  await putEntity(cacheDb, 'category', {
    id: 'srv-cat-cripto',
    kind: 'investment',
    name: 'Cripto',
    version: 0,
  })
  await putEntity(cacheDb, 'recurringRule', { id: 'srv-rule', legacyId: 'rule-exp', version: 0 })
  await putEntity(cacheDb, 'pendingMovement', {
    id: 'srv-pending',
    legacyId: 'pm-exp',
    version: 1,
  })
  cacheDb.close()
}

async function startSync(): Promise<ReturnType<typeof useSyncStore>> {
  const syncStore = useSyncStore()
  await syncStore.init(USER_ID)
  syncStore.connection = 'offline'
  activeStore = syncStore
  return syncStore
}

/**
 * Forces the next queue-DB transaction matching `matches` to fail, the way a
 * real storage error does. Returns a restore function.
 */
function failNextQueueTransaction(
  matches: (stores: string[], mode: IDBTransactionMode) => boolean,
): () => void {
  const prototype = IDBDatabase.prototype
  const real = prototype.transaction
  const spy = vi.spyOn(prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    stores: string | string[],
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ) {
    const names = Array.isArray(stores) ? stores : [stores]
    if (this.name.startsWith('finance-tracker-outbox') && matches(names, mode ?? 'readonly')) {
      spy.mockRestore()
      throw new DOMException('fallo de almacenamiento simulado', 'AbortError')
    }
    return real.call(this, stores, mode, options)
  } as typeof prototype.transaction)
  return () => spy.mockRestore()
}

async function readCommands() {
  const db = await openStorage(USER_ID)
  try {
    return await listAll(db)
  } finally {
    db.close()
  }
}

async function readIntents() {
  const db = await openStorage(USER_ID)
  try {
    return await listDurableIntents(db)
  } finally {
    db.close()
  }
}

describe('confirmPending — aceptación durable y recuperable (#492)', () => {
  beforeEach(async () => {
    await wipeIdbCache(USER_ID)
    await wipeOutbox(USER_ID)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    if (activeStore) {
      await activeStore.logout({ discardPending: true })
      activeStore = null
    }
    await wipeIdbCache(USER_ID)
    await wipeOutbox(USER_ID)
  })

  it('no comunica como guardada una confirmación cuya aceptación local falla', async () => {
    setupState([expensePending()])
    await startSync()
    await seedServerRefs()

    // The reservation is written before the optimistic confirmation: if that
    // write fails, nothing is projected and the pending stays open.
    const restore = failNextQueueTransaction(
      (stores, mode) =>
        mode === 'readwrite' && stores.includes('intents') && stores.includes('commands'),
    )
    let outcome
    try {
      outcome = await useRecurringStore().confirmPending('pm-exp')
    } finally {
      restore()
    }

    expect(outcome).toMatchObject({ accepted: false, reason: 'storage' })
    expect(useFinancialStateStore().transactions).toHaveLength(0)
    expect(useRecurringStore().openPendingMovements).toHaveLength(1)
    expect(await readIntents()).toHaveLength(0)
  })

  it('persiste la reserva, la edición resuelta, un único movimiento y sus marcas antes de publicar', async () => {
    const { financialStore, recurringStore } = setupState([expensePending()])
    await startSync()
    await seedServerRefs()

    const outcome = await recurringStore.confirmPending('pm-exp', {
      date: '2024-02-03',
      accountId: 'checking',
      category: 'Ocio',
      description: 'Alquiler ajustado',
      amount: 925,
    })

    expect(outcome).toMatchObject({ accepted: true })
    if (!outcome.accepted) throw new Error('No se aceptó la confirmación')
    const transaction = financialStore.transactions[0]
    expect(transaction).toMatchObject({
      id: outcome.transactionId,
      type: 'expense',
      date: '2024-02-03',
      accountId: 'checking',
      category: 'Ocio',
      description: 'Alquiler ajustado',
      amount: 925,
    })
    expect(recurringStore.pendingMovements[0]).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
      description: 'Alquiler ajustado',
      amount: 925,
    })

    // Movement first: the pending update waits for the server's
    // acknowledgement, so only the movement command is queued at acceptance.
    const [view, entries] = await vi.waitFor(
      async () => {
        const views = await readIntents()
        const queued = await readCommands()
        expect(views).toHaveLength(1)
        expect(queued).toHaveLength(1)
        expect(views[0].steps[0]).toMatchObject({ step: 'movement', state: 'queued' })
        expect(views[0].steps[1]).toMatchObject({ step: 'pending', state: 'pending' })
        return [views[0], queued] as const
      },
      { timeout: 5000, interval: 20 },
    )

    expect(view.intent).toMatchObject({
      kind: 'pendingConfirmation',
      ownerUserId: USER_ID,
      targetIds: ['pm-exp'],
      state: 'sending',
    })
    expect(view.intent.payload).toMatchObject({
      transactionId: outcome.transactionId,
      pendingId: 'pm-exp',
      description: 'Alquiler ajustado',
      amount: 925,
      occurrenceDate: '2024-02-03',
    })
    const create = entries[0].command
    if (create.action !== 'create') throw new Error('Se esperaba un create')
    expect(create.data).toMatchObject({
      id: outcome.transactionId,
      type: 'expense',
      amount: 925,
      description: 'Alquiler ajustado',
    })

    // The server acknowledges the movement; only then is the pending update
    // built, against that same movement id.
    const queueDb = await openStorage(USER_ID)
    try {
      await commitDurableIntentCommands(queueDb, {
        plainSeqs: [],
        outcomes: [{ entry: entries[0], status: 'confirmed' }],
      })
      // The real sync store absorbs the confirmed row into the cache before
      // retiring the command; the pending reference resolves from there.
      await putEntity(queueDb, 'transaction', { id: outcome.transactionId, version: 1 })
    } finally {
      queueDb.close()
    }
    await resumePendingConfirmations()

    // The acked movement command was retired from the queue; only the pending
    // update that references the confirmed movement remains.
    const pendingEntries = await vi.waitFor(
      async () => {
        const queued = await readCommands()
        expect(queued).toHaveLength(1)
        return queued
      },
      { timeout: 5000, interval: 20 },
    )
    expect(
      pendingEntries.map((entry) => {
        const command = entry.command as { action: string; entityType?: string }
        return `${command.entityType}:${command.action}`
      }),
    ).toEqual(['pendingMovement:update'])
    const update = pendingEntries[0].command
    if (update.action !== 'update') throw new Error('Se esperaba un update')
    expect(update.patch).toMatchObject({
      status: 'confirmed',
      transactionId: outcome.transactionId,
      amount: 925,
      dueDate: '2024-02-03',
    })

    const status = await recurringStore.pendingConfirmationStatus('pm-exp')
    expect(status).toMatchObject({
      pendingId: 'pm-exp',
      transactionId: outcome.transactionId,
      state: 'sending',
      movementQueued: false,
      movementConfirmed: true,
      pendingLinked: false,
    })
  })

  it('repetir la confirmación reutiliza la reserva y no genera otro movimiento', async () => {
    setupState([expensePending()])
    await startSync()
    await seedServerRefs()

    const first = await useRecurringStore().confirmPending('pm-exp', { amount: 910 })
    expect(first.accepted).toBe(true)
    if (!first.accepted) throw new Error('No se aceptó la confirmación')

    // A stale button, a second tab or a re-render repeats the same pending with
    // a different edit: the accepted decision still wins and the id is reused.
    const second = await useRecurringStore().confirmPending('pm-exp', { amount: 1 })
    expect(second).toEqual({ accepted: true, transactionId: first.transactionId })

    await vi.waitFor(
      async () => {
        expect((await readCommands()).length).toBe(1)
      },
      { timeout: 5000, interval: 20 },
    )
    const creates = (await readCommands()).filter(
      (entry) => entry.command.action === 'create' && entry.command.entityType === 'transaction',
    )
    expect(creates).toHaveLength(1)
    expect((creates[0].command as unknown as { data: { id: string } }).data.id).toBe(
      first.transactionId,
    )
    expect(useFinancialStateStore().transactions).toHaveLength(1)
    expect(useFinancialStateStore().transactions[0].amount).toBe(910)
    expect((await readIntents())[0].intent.state).not.toBe('confirmed')
  })

  it('olvida una confirmación ya conciliada para no crecer sin límite', async () => {
    setupState([expensePending()])
    await startSync()
    await seedServerRefs()

    const outcome = await useRecurringStore().confirmPending('pm-exp', { amount: 925 })
    expect(outcome.accepted).toBe(true)
    if (!outcome.accepted) throw new Error('No se aceptó')

    const [movementEntry] = await vi.waitFor(
      async () => {
        const entries = await readCommands()
        expect(entries).toHaveLength(1)
        return entries
      },
      { timeout: 5000, interval: 20 },
    )
    const acknowledgement = await openStorage(USER_ID)
    try {
      await commitDurableIntentCommands(acknowledgement, {
        plainSeqs: [],
        outcomes: [{ entry: movementEntry, status: 'confirmed' }],
      })
      await putEntity(acknowledgement, 'transaction', { id: outcome.transactionId, version: 1 })
    } finally {
      acknowledgement.close()
    }
    await resumePendingConfirmations()

    const pendingEntry = await vi.waitFor(
      async () => {
        const entries = await readCommands()
        const pending = entries.find(
          (entry) =>
            entry.command.action === 'update' && entry.command.entityType === 'pendingMovement',
        )
        expect(pending).toBeDefined()
        return pending!
      },
      { timeout: 5000, interval: 20 },
    )
    const finalAcknowledgement = await openStorage(USER_ID)
    try {
      await commitDurableIntentCommands(finalAcknowledgement, {
        plainSeqs: [],
        outcomes: [{ entry: pendingEntry, status: 'confirmed' }],
      })
    } finally {
      finalAcknowledgement.close()
    }

    // Both steps are confirmed and the pending is linked in local state: the
    // reservation can be forgotten without enabling a second movement.
    await resumePendingConfirmations()
    expect(await readIntents()).toHaveLength(0)
    expect(await readCommands()).toHaveLength(0)
  })

  it('cuenta la reserva una sola vez, la incluye en el estado y bloquea el cierre de sesión', async () => {
    setupState([expensePending()])
    const syncStore = await startSync()
    await seedServerRefs()

    const outcome = await useRecurringStore().confirmPending('pm-exp', { amount: 910 })
    expect(outcome.accepted).toBe(true)
    await vi.waitFor(
      async () => {
        expect(await readCommands()).toHaveLength(1)
      },
      { timeout: 5000, interval: 20 },
    )

    // One queued movement command: the reservation itself is not counted twice.
    await vi.waitFor(() => expect(syncStore.pendingCount).toBe(1), { timeout: 5000 })
    expect(syncStore.intents).toHaveLength(1)
    expect(syncStore.intents[0].intent.kind).toBe('pendingConfirmation')
    expect(syncStore.unresolvedIntentCount).toBe(1)
    expect(syncStore.failedIntentCount).toBe(0)
    await expect(syncStore.prepareLogout()).rejects.toThrow(/No se pudieron sincronizar/)

    await syncStore.failIntent(syncStore.intents[0].intent.id, 'La cuenta no existe.')
    await vi.waitFor(() => expect(syncStore.failedIntentCount).toBe(1), { timeout: 5000 })
  })

  it('la expiración de sesión conserva la reserva para retomarla al volver a entrar', async () => {
    setupState([expensePending()])
    const syncStore = await startSync()
    await seedServerRefs()

    const outcome = await useRecurringStore().confirmPending('pm-exp', { amount: 910 })
    expect(outcome.accepted).toBe(true)
    await vi.waitFor(
      async () => {
        expect(await readCommands()).toHaveLength(1)
      },
      { timeout: 5000, interval: 20 },
    )

    // The next request rejects the session; the durable record must survive.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Sesión expirada.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    await syncStore.syncNow()

    expect(await readIntents()).toHaveLength(1)
    expect(await readCommands()).toHaveLength(1)

    // Signing back in resumes the same user without a reload.
    await syncStore.init(USER_ID)
    expect(syncStore.intents).toHaveLength(1)
    expect(syncStore.intents[0].intent.kind).toBe('pendingConfirmation')
  })

  it('un cambio de usuario no reanuda ni cuenta el trabajo de la sesión anterior', async () => {
    const otherUser = `${USER_ID}-other`
    await wipeIdbCache(otherUser)
    await wipeOutbox(otherUser)
    setupState([expensePending()])
    const syncStore = await startSync()
    await seedServerRefs()

    const outcome = await useRecurringStore().confirmPending('pm-exp', { amount: 910 })
    expect(outcome.accepted).toBe(true)
    await vi.waitFor(
      async () => {
        expect(await readCommands()).toHaveLength(1)
      },
      { timeout: 5000, interval: 20 },
    )

    await syncStore.init(otherUser)
    expect(syncStore.intents).toHaveLength(0)
    expect(syncStore.pendingCount).toBe(0)

    // The previous user's work is still isolated in its own database.
    const previous = await openStorage(USER_ID)
    try {
      expect(await listDurableIntents(previous)).toHaveLength(1)
    } finally {
      previous.close()
    }
    await syncStore.logout({ discardPending: true })
    activeStore = null
    await wipeIdbCache(otherUser)
    await wipeOutbox(otherUser)
  })
})
