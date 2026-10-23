import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import { openIdbCache, putEntity, wipeIdbCache } from '../../src/lib/client/idb-cache'
import { listAll, openOutbox, wipeOutbox } from '../../src/lib/client/outbox'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useRecurringStore } from '../../src/stores/recurring'
import { useSyncStore } from '../../src/stores/sync'

const USER_ID = 'user-recurring-confirm-test'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only store handle, closed in afterEach
let activeStore: any = null

/**
 * Confirming an investment pending whose category has not reached the server
 * yet: the transaction's sync and the pending's sync both resolve that same
 * category. They must agree on its id, or the pending's status change
 * references a category that never gets created (issue #283).
 */
describe('confirmPending — category id shared by the movement and the pending (issue #283)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
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

  it('points the pending update at the category the outbox actually creates', async () => {
    const syncStore = useSyncStore()
    await syncStore.init(USER_ID)
    syncStore.connection = 'offline'
    activeStore = syncStore

    // Force the order that used to break. The pending's "is a category create
    // already queued?" lookup answers "no" and is then held up; meanwhile the
    // movement's sync queues its own category create, which the held lookup
    // then treats as already applied (a synced row, found by name+kind). The
    // pending must still end up pointing at a category that is created.
    const realPeek = syncStore.peekPendingCreateId
    syncStore.peekPendingCreateId = async (...args: Parameters<typeof realPeek>) => {
      const result = await realPeek(...args)
      if (args[0] === 'category') await new Promise((resolve) => setTimeout(resolve, 5))
      return result
    }
    const realFind = syncStore.findEntityRef
    syncStore.findEntityRef = async (...args: Parameters<typeof realFind>) => {
      const ref = await realFind(...args)
      if (ref || args[0] !== 'category') return ref
      const queuedId = await realPeek('category', args[1])
      return queuedId ? { entityId: queuedId, version: 0 } : null
    }

    const cacheDb = await openIdbCache(USER_ID)
    await putEntity(cacheDb, 'account', { id: 'srv-account', legacyId: 'broker', version: 0 })
    await putEntity(cacheDb, 'recurringRule', { id: 'srv-rule', legacyId: 'rule-eth', version: 0 })
    await putEntity(cacheDb, 'pendingMovement', {
      id: 'srv-pending',
      legacyId: 'pm-eth',
      version: 0,
    })
    cacheDb.close()

    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024,
      currency: 'EUR',
      accounts: [],
      investmentAssets: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      liabilities: [],
      incomeCategories: [],
      expenseCategories: [],
      investmentCategories: ['Cripto'],
      transactions: [],
      snapshots: {},
      budget: { income: {}, expense: {}, investment: {} },
      goals: {},
      contributions: [],
      recurringRules: [],
      pendingMovements: [
        {
          id: 'pm-eth',
          occurrenceKey: 'rule-eth:2024-01-01',
          ruleId: 'rule-eth',
          occurrenceDate: '2024-01-01',
          type: 'investment',
          accountId: 'broker',
          category: 'Cripto',
          description: 'Compra ETH',
          amount: 10,
          symbol: 'ETH',
          side: 'buy',
          units: 0.01,
          unitPrice: 1000,
          status: 'pending',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          transactionId: null,
        },
      ],
      instruments: [],
      quotes: {},
    })

    expect(useRecurringStore().confirmPending('pm-eth')).toBe(true)

    const readCommands = async () => {
      const outboxDb = await openOutbox(USER_ID)
      const commands = (await listAll(outboxDb)).map((entry) => entry.command)
      outboxDb.close()
      return commands
    }

    let commands: Awaited<ReturnType<typeof readCommands>> = []
    await vi.waitFor(
      async () => {
        commands = await readCommands()
        expect(
          commands.find((c) => c.action === 'update' && c.entityType === 'pendingMovement'),
        ).toBeDefined()
      },
      { timeout: 5000, interval: 25 },
    )

    const createdCategoryIds = commands
      .filter((c) => c.action === 'create' && c.entityType === 'category')
      .map((c) => (c as { data: { id?: string } }).data.id)
    const pendingUpdate = commands.find(
      (c) => c.action === 'update' && c.entityType === 'pendingMovement',
    )
    expect(pendingUpdate).toBeDefined()
    expect(pendingUpdate).toMatchObject({ patch: { status: 'confirmed' } })
    const patch = (pendingUpdate as { patch: Record<string, unknown> }).patch
    expect(createdCategoryIds).toContain(patch.categoryId)
    expect(commands).toContainEqual(
      expect.objectContaining({
        action: 'create',
        entityType: 'transaction',
        data: expect.objectContaining({ categoryId: patch.categoryId }),
      }),
    )
  })
})
