import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import {
  listAll,
  listDurableIntents,
  openStorage,
  putEntity,
  wipeIdbCache,
  wipeOutbox,
  type OutboxEntry,
} from '../../helpers/client-storage'
import { createTestPinia } from '../../helpers/pinia'
import { resumeRecurringRuleWrites } from '../../../src/lib/client/recurring-rule-write'
import { useFinancialStateStore } from '../../../src/stores/financial-state'
import { useRecurringStore } from '../../../src/stores/recurring'
import { useSyncStore } from '../../../src/stores/sync'

const USER_ID = 'user-recurring-rule-write-durable'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only store handle, closed in afterEach
let activeStore: any = null
let clock: { __FINANCE_TODAY__: string; addEventListener: () => void; removeEventListener: () => void }

function setupState(): ReturnType<typeof useRecurringStore> {
  setActivePinia(createTestPinia())
  const financialStore = useFinancialStateStore()
  financialStore.replaceState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'checking', name: 'Cuenta', openingBalance: 1000 }],
    investmentAssets: [],
    liabilities: [],
    incomeCategories: [],
    expenseCategories: ['Vivienda', 'Ocio'],
    investmentCategories: [],
    transactions: [],
    snapshots: {},
    budget: { income: {}, expense: {}, investment: {} },
    goals: {},
    contributions: [],
    recurringRules: [],
    pendingMovements: [],
    instruments: [],
    quotes: {},
  })
  return useRecurringStore()
}

async function startSync(): Promise<ReturnType<typeof useSyncStore>> {
  const syncStore = useSyncStore()
  await syncStore.init(USER_ID)
  syncStore.connection = 'offline'
  activeStore = syncStore
  return syncStore
}

/** Seeds only the references needed to build a recurring rule's commands. */
async function seedRefs(options: { account?: boolean } = {}): Promise<void> {
  const cacheDb = await openStorage(USER_ID)
  if (options.account !== false) {
    await putEntity(cacheDb, 'account', { id: 'srv-account', legacyId: 'checking', version: 0 })
  }
  await putEntity(cacheDb, 'category', {
    id: 'srv-cat-vivienda',
    kind: 'expense',
    name: 'Vivienda',
    version: 0,
  })
  cacheDb.close()
}

async function readCommands(): Promise<OutboxEntry[]> {
  const db = await openStorage(USER_ID)
  try {
    return (await listAll(db)).sort((left, right) => left.seq - right.seq)
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

/**
 * Fails the nth (1-based) future queue transaction satisfying `matches`, the
 * way a real storage error does. Returns a restore function.
 */
function failQueueTransactionNumber(
  nth: number,
  matches: (stores: string[], mode: IDBTransactionMode) => boolean,
): () => void {
  const prototype = IDBDatabase.prototype
  const real = prototype.transaction
  let seen = 0
  const spy = vi.spyOn(prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    stores: string | string[],
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ) {
    const names = Array.isArray(stores) ? stores : [stores]
    if (
      this.name.startsWith('finance-tracker-outbox') &&
      (mode ?? 'readonly') === 'readwrite' &&
      matches(names, mode ?? 'readonly')
    ) {
      seen += 1
      if (seen === nth) {
        spy.mockRestore()
        throw new DOMException('fallo de almacenamiento simulado', 'AbortError')
      }
    }
    return real.call(this, stores, mode, options)
  } as typeof prototype.transaction)
  return () => spy.mockRestore()
}

const isPublicationTransaction = (stores: string[], mode: IDBTransactionMode): boolean =>
  mode === 'readwrite' &&
  stores.includes('commands') &&
  stores.includes('intents') &&
  stores.includes('intentProgress')

function ruleInput(overrides: Record<string, unknown> = {}) {
  return {
    type: 'expense' as const,
    accountId: 'checking',
    category: 'Vivienda',
    description: 'Alquiler',
    amount: 900,
    frequency: 'monthly' as const,
    interval: 1,
    startDate: '2026-03-01',
    ...overrides,
  }
}

function commandLabel(entry: OutboxEntry): string {
  const command = entry.command as { entityType?: string; action: string }
  return `${command.entityType}:${command.action}`
}

function pendingCreates(entries: OutboxEntry[]) {
  return entries.filter(
    (entry) =>
      entry.command.action === 'create' && entry.command.entityType === 'pendingMovement',
  )
}

describe('regla recurrente — fases durables y reanudación (#493)', () => {
  beforeEach(async () => {
    // `resolveToday` reads the fixed app clock; the listeners are no-ops in a
    // unit runtime (the connection watcher is not under test here).
    clock = {
      __FINANCE_TODAY__: '2026-03-15',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }
    vi.stubGlobal('window', clock)
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
    vi.unstubAllGlobals()
  })

  it('acepta la regla antes de publicarla y la reanuda cuando aparece la referencia', async () => {
    setupState()
    await startSync()
    await seedRefs({ account: false })

    const recurring = useRecurringStore()
    expect(await recurring.addRule(ruleInput())).toBe(true)
    // Accepted: the intent carries the decided rule even though no command
    // could be built (the account reference is not in the cache yet).
    const accepted = await readIntents()
    expect(accepted).toHaveLength(1)
    expect(accepted[0].steps.find((step) => step.step === 'rule')?.state).toBe('pending')
    expect(await readCommands()).toHaveLength(0)

    // A later boot learns the account; the resume publishes the rule first,
    // then the occurrence, then the calendar.
    const cacheDb = await openStorage(USER_ID)
    await putEntity(cacheDb, 'account', { id: 'srv-account', legacyId: 'checking', version: 0 })
    cacheDb.close()
    await resumeRecurringRuleWrites()

    const entries = await readCommands()
    expect(entries.map(commandLabel)).toEqual([
      'recurringRule:create',
      'pendingMovement:create',
      'recurringRule:update',
    ])
    expect(
      pendingCreates(entries).every(
        (entry) =>
          (entry.command as unknown as { data: { recurringRuleId: string } }).data
            .recurringRuleId ===
          (entries[0].command as unknown as { data: { id: string } }).data.id,
      ),
    ).toBe(true)
    const view = (await readIntents())[0]
    expect(view.steps.map((step) => step.state)).toEqual(['queued', 'queued', 'queued'])
  })

  it('retoma entre la regla y los pendientes sin perder ni duplicar ocurrencias', async () => {
    clock.__FINANCE_TODAY__ = '2026-04-15'
    setupState()
    await startSync()
    await seedRefs()

    const restore = failQueueTransactionNumber(2, isPublicationTransaction)
    let accepted: boolean
    try {
      accepted = await useRecurringStore().addRule(ruleInput())
    } finally {
      restore()
    }
    expect(accepted!).toBe(true)
    // The rule is durable and the first occurrence was published; the second
    // publication failed, so only the rule command exists.
    const interrupted = await readCommands()
    expect(interrupted.map((entry) => (entry.command as { entityType?: string }).entityType)).toEqual(['recurringRule'])
    const ruleId = (interrupted[0].command as unknown as { data: { id: string } }).data.id
    expect((await readIntents())[0].intent.payload.ruleId).toBe(ruleId)

    // A restart resumes the stored occurrences with their accepted ids, once.
    await resumeRecurringRuleWrites()
    const resumed = await readCommands()
    expect(resumed.map(commandLabel)).toEqual([
      'recurringRule:create',
      'pendingMovement:create',
      'pendingMovement:create',
      'recurringRule:update',
    ])
    const ids = pendingCreates(resumed).map(
      (entry) => (entry.command as unknown as { data: { id: string } }).data.id,
    )
    expect(new Set(ids).size).toBe(2)
    const stepStates = (await readIntents())[0].steps.map((step) => step.state)
    expect(stepStates.every((state) => state === 'queued')).toBe(true)
  })

  it('retoma antes del calendario y no lo avanza hasta que los pendientes son durables', async () => {
    setupState()
    await startSync()
    await seedRefs()

    // The acceptance and the single occurrence are the first two
    // transactions; the calendar publication is the third and is interrupted.
    const restore = failQueueTransactionNumber(3, isPublicationTransaction)
    try {
      expect(await useRecurringStore().addRule(ruleInput())).toBe(true)
    } finally {
      restore()
    }
    const interrupted = await readCommands()
    expect(interrupted.map(commandLabel)).toEqual(
      ['recurringRule:create', 'pendingMovement:create'],
    )
    const calendarStep = (await readIntents())[0].steps.find((step) => step.step === 'calendar')
    expect(calendarStep?.state).toBe('pending')

    await resumeRecurringRuleWrites()
    const resumed = await readCommands()
    expect(resumed.map(commandLabel)).toEqual([
      'recurringRule:create',
      'pendingMovement:create',
      'recurringRule:update',
    ])
    const calendar = resumed.at(-1)!.command
    if (calendar.action !== 'update') throw new Error('Se esperaba el update del calendario')
    expect(calendar.patch).toMatchObject({
      lastExecutionDate: '2026-03-01',
      nextRunDate: '2026-04-01',
    })
    expect(await readCommands()).toHaveLength(3)
  })
})
