import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { createTestPinia } from '../helpers/pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import { openIdbCache, putEntity, wipeIdbCache } from '../../src/lib/client/idb-cache'
import { listAll, openOutbox, wipeOutbox, type OutboxEntry } from '../../src/lib/client/outbox'
import { isDemoMode } from '../../src/scripts/demo-mode'
import { useBudgetStore } from '../../src/stores/budget'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useSyncStore } from '../../src/stores/sync'

const USER_ID = 'user-budget-store-test'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only store handle, closed in afterEach
let activeStore: any = null

/**
 * A budgetEntry's identity (`categoryId`/`year`/`month`) must never travel
 * in an `update` — `entityUpdateSchemas.budgetEntry` only declares
 * `amount`/`currency` (narrower than every other entity's `.partial()`
 * update schema). Regression test for the fix in `src/stores/budget.ts` and
 * `syncUpsert`'s `updateData` parameter: making the per-entity schemas
 * strict (issue #138) would otherwise reject the *second* edit of an
 * already-synced budget cell, because `buildBudgetEntryData` always
 * recomputes the full identity + value shape.
 */
describe('budget store — sync wiring keeps identity out of the update patch (issue #138)', () => {
  beforeEach(async () => {
    vi.mocked(isDemoMode).mockReturnValue(false)
    setActivePinia(createTestPinia())
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

  it('sends the full identity on the first edit and only amount/currency on the second', async () => {
    const syncStore = useSyncStore()
    await syncStore.init(USER_ID)
    syncStore.connection = 'offline'
    activeStore = syncStore

    // The category has already synced, so `resolveOrCreateCategoryId`
    // resolves it (by its real name+kind, ADR 0001) immediately instead of
    // minting and creating it again.
    const cacheDb = await openIdbCache(USER_ID)
    try {
      await putEntity(cacheDb, 'category', {
        id: 'server-cat-1',
        name: 'Ocio',
        kind: 'expense',
        version: 0,
      })
    } finally {
      cacheDb.close()
    }

    useFinancialStateStore().commitState((draft) => {
      draft.expenseCategories = ['Ocio']
    })

    const budgetStore = useBudgetStore()
    budgetStore.updateBudgetValue('expense', 'Ocio', 1, 100)

    const outboxDb = await openOutbox(USER_ID)
    let created: OutboxEntry['command'] | undefined
    try {
      const afterFirstEdit = await vi.waitFor(async () => {
        const entries = await listAll(outboxDb)
        expect(entries).toHaveLength(1)
        return entries
      })
      expect(afterFirstEdit[0]?.command).toMatchObject({
        action: 'create',
        entityType: 'budgetEntry',
        data: {
          categoryId: 'server-cat-1',
          year: expect.any(Number),
          month: 1,
          amount: 100,
          currency: 'EUR',
        },
      })
      created = afterFirstEdit[0]?.command
    } finally {
      outboxDb.close()
    }

    // Simulate the create having synced: seed the cache with the server row,
    // identified by the same natural key (`categoryId`, year, month) the
    // store addresses a cell by (ADR 0001), so the next edit resolves it as
    // an update instead of folding into the still-pending create.
    if (created?.action !== 'create') throw new Error('expected a pending create')
    const { categoryId, year, month } = created.data as {
      categoryId: string
      year: number
      month: number
    }
    const cacheDb2 = await openIdbCache(USER_ID)
    try {
      await putEntity(cacheDb2, 'budgetEntry', {
        id: 'server-budget-entry-1',
        categoryId,
        year,
        month,
        version: 0,
      })
    } finally {
      cacheDb2.close()
    }

    budgetStore.updateBudgetValue('expense', 'Ocio', 1, 250)

    const outboxDb2 = await openOutbox(USER_ID)
    try {
      const afterSecondEdit = await vi.waitFor(async () => {
        const entries = await listAll(outboxDb2)
        expect(entries.some((entry) => entry.command.action === 'update')).toBe(true)
        return entries
      })
      const update = afterSecondEdit.find((entry) => entry.command.action === 'update')
      expect(update?.command).toMatchObject({
        action: 'update',
        entityType: 'budgetEntry',
        entityId: 'server-budget-entry-1',
        patch: { amount: 250, currency: 'EUR' },
      })
      // The identity fields must not be present at all — not just ignored.
      expect(update?.command).toMatchObject({
        patch: expect.not.objectContaining({ categoryId: expect.anything() }),
      })
      if (update?.command.action === 'update') {
        expect(Object.keys(update.command.patch)).toEqual(['amount', 'currency'])
      }
    } finally {
      outboxDb2.close()
    }
  })
  it('saves a year plan in one commit and syncs only the months that changed', async () => {
    const syncStore = useSyncStore()
    await syncStore.init(USER_ID)
    syncStore.connection = 'offline'
    activeStore = syncStore

    const cacheDb = await openIdbCache(USER_ID)
    try {
      await putEntity(cacheDb, 'category', {
        id: 'server-cat-2',
        name: 'Ocio',
        kind: 'expense',
        version: 0,
      })
    } finally {
      cacheDb.close()
    }

    const financialState = useFinancialStateStore()
    financialState.commitState((draft) => {
      draft.expenseCategories = ['Ocio']
      draft.budget.expense = { Ocio: Array.from({ length: 12 }, () => 100) }
    })
    const commit = vi.spyOn(financialState, 'commitState')

    const plan = Array.from({ length: 12 }, () => 100)
    plan[3] = 150
    plan[11] = 250.555
    useBudgetStore().saveBudgetPlan('expense', 'Ocio', plan)

    expect(commit).toHaveBeenCalledTimes(1)
    expect(financialState.state.budget.expense.Ocio[3]).toBe(150)
    expect(financialState.state.budget.expense.Ocio[11]).toBe(250.56)

    // Each changed month syncs in turn, so wait until both are queued.
    const outboxDb = await openOutbox(USER_ID)
    try {
      const entries = await vi.waitFor(async () => {
        const queued = await listAll(outboxDb)
        expect(queued).toHaveLength(2)
        return queued
      })
      expect(
        entries
          .map((entry) => (entry.command as { data?: { month: number } }).data?.month)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual([4, 12])
    } finally {
      outboxDb.close()
    }
  })
})
