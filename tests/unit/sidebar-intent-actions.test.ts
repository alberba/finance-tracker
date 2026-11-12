// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { createApp } from 'vue'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import {
  commitDurableIntentCommands,
  listAll,
  openStorage,
  putEntity,
  wipeIdbCache,
  wipeOutbox,
  type OutboxEntry,
} from '../helpers/client-storage'
import { pinia } from '../../src/stores/pinia'
import {
  PARTIAL_CONFIRMATION_MESSAGE,
  resumePendingConfirmations,
} from '../../src/lib/client/recurring-write'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useRecurringStore } from '../../src/stores/recurring'
import { useSyncStore } from '../../src/stores/sync'

const USER_ID = 'user-sidebar-intent-actions'

/**
 * The sidebar's retry/discard buttons are the only generic intent actions in
 * the app. For a recurring intent they must reach the recurring module, not
 * the generic intent discard: the generic path leaves a partially confirmed
 * pending looking confirmed locally with no reconciliation command and no
 * retry affordance (probe reported on #492).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only store handle, closed in afterEach
let activeStore: any = null

function sidebarDom(): void {
  document.body.innerHTML = `
    <span id="sidebar-sync-status" hidden>Sincronizado</span>
    <div id="sidebar-intent-status" hidden>
      <p data-intent-message>Guardado en este dispositivo</p>
      <div data-intent-actions>
        <button type="button" data-intent-retry>Reintentar</button>
        <button type="button" data-intent-discard>Descartar</button>
      </div>
    </div>
    <button type="button" data-logout-action>Salir</button>
  `
}

async function setupPendingConfirmation(): Promise<{ pendingId: string; transactionId: string }> {
  const syncStore = useSyncStore(pinia)
  await syncStore.init(USER_ID)
  syncStore.connection = 'offline'
  activeStore = syncStore

  const cacheDb = await openStorage(USER_ID)
  await putEntity(cacheDb, 'account', { id: 'srv-account', legacyId: 'checking', version: 0 })
  await putEntity(cacheDb, 'recurringRule', { id: 'srv-rule', legacyId: 'rule-exp', version: 0 })
  await putEntity(cacheDb, 'pendingMovement', {
    id: 'srv-pending',
    legacyId: 'pm-exp',
    version: 1,
  })
  await putEntity(cacheDb, 'category', {
    id: 'srv-cat-vivienda',
    kind: 'expense',
    name: 'Vivienda',
    version: 0,
  })
  cacheDb.close()

  useFinancialStateStore().replaceState({
    year: 2024,
    currency: 'EUR',
    accounts: [{ id: 'checking', name: 'Cuenta', openingBalance: 1000 }],
    investmentAssets: [],
    liabilities: [],
    incomeCategories: [],
    expenseCategories: ['Vivienda'],
    investmentCategories: [],
    transactions: [],
    snapshots: {},
    budget: { income: {}, expense: {}, investment: {} },
    goals: {},
    contributions: [],
    recurringRules: [],
    pendingMovements: [
      {
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
      },
    ],
    instruments: [],
    quotes: {},
  })

  const outcome = await useRecurringStore().confirmPending('pm-exp')
  expect(outcome.accepted).toBe(true)
  if (!outcome.accepted) throw new Error('No se aceptó la confirmación')

  // The movement is acknowledged, the pending update is published and then
  // definitively rejected: the partial state the probe described.
  const db = await openStorage(USER_ID)
  try {
    const movement = ((await listAll(db)) as OutboxEntry[]).find(
      (entry) =>
        entry.command.action === 'create' && entry.command.entityType === 'transaction',
    )!
    await commitDurableIntentCommands(db, {
      plainSeqs: [],
      outcomes: [{ entry: movement, status: 'confirmed' }],
    })
    await putEntity(db, 'transaction', { id: outcome.transactionId, version: 1 })
  } finally {
    db.close()
  }
  await resumePendingConfirmations()

  const pendingDb = await openStorage(USER_ID)
  try {
    const update = ((await listAll(pendingDb)) as OutboxEntry[]).find(
      (entry) =>
        entry.command.action === 'update' && entry.command.entityType === 'pendingMovement',
    )!
    await commitDurableIntentCommands(pendingDb, {
      plainSeqs: [],
      outcomes: [{ entry: update, status: 'failed', message: 'El pendiente ya no existe.' }],
    })
  } finally {
    pendingDb.close()
  }
  await syncStore.listIntents()
  return { pendingId: 'pm-exp', transactionId: outcome.transactionId }
}

describe('sidebar — retry/discard de intenciones recurrentes', () => {
  beforeEach(async () => {
    sidebarDom()
    createApp({}).use(pinia)
    setActivePinia(pinia)
    await wipeIdbCache(USER_ID)
    await wipeOutbox(USER_ID)
    // The shell only needs the session request to fail silently here; each
    // test drives the sync store itself.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await import('../../src/scripts/shell')
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    if (activeStore) {
      await activeStore.logout({ discardPending: true })
      activeStore = null
    }
    await wipeIdbCache(USER_ID)
    await wipeOutbox(USER_ID)
    document.body.innerHTML = ''
  })

  it('descartar un resultado parcial reabre el pendiente y mantiene el reintento', async () => {
    const { pendingId } = await setupPendingConfirmation()
    const syncStore = useSyncStore(pinia)
    expect(syncStore.intents[0]?.intent.state).toBe('partial')
    expect(syncStore.intents[0]?.intent.failure).toBe('El pendiente ya no existe.')

    const discard = document.querySelector<HTMLButtonElement>('[data-intent-discard]')!
    discard.click()
    await vi.waitFor(
      () => {
        // The sidebar routed the discard through the recurring module: the
        // partial result now explains what remains, and the intent stays
        // actionable (the generic discard would have left `failure: null`).
        expect(syncStore.intents[0]?.intent.failure).toBe(PARTIAL_CONFIRMATION_MESSAGE)
        expect(syncStore.intents[0]?.intent.state).toBe('partial')
      },
      { timeout: 5000, interval: 20 },
    )

    // The partial result is kept (the movement is never reverted) but the
    // pending is reopenable and the reconciliation retry stays visible: the
    // generic intent discard would have closed both.
    const status = await useRecurringStore().pendingConfirmationStatus(pendingId)
    expect(status).toMatchObject({
      state: 'partial',
      movementConfirmed: true,
      pendingLinked: false,
      discarded: false,
    })
    expect(useRecurringStore().openPendingMovements.some((item) => item.id === pendingId)).toBe(
      true,
    )
    expect(useFinancialStateStore().transactions).toHaveLength(1)
    await vi.waitFor(
      () => {
        expect(
          document.querySelector('#sidebar-intent-status [data-intent-message]')?.textContent,
        ).toContain('movimiento')
      },
      { timeout: 5000, interval: 20 },
    )
  })
})
