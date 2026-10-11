import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createSqliteBinding } from '../../src/lib/server/local/sqlite-binding'
import { migrateLocalDatabase } from '../../scripts/local-init.mjs'
import * as schema from '../../src/db/schema'
import * as accountsRepository from '../../src/db/repositories/accounts'
import * as transactionsRepository from '../../src/db/repositories/transactions'
import { interactiveTransaction } from '../../src/db/transaction-capability'
import * as syncRepository from '../../src/db/repositories/sync'
import { resolvePrincipal } from '../../src/lib/server/auth/principal'
import { applyOneCommand } from '../../src/lib/server/sync/apply-command'
import { POST as initialize } from '../../src/pages/api/state/initialize'
import { POST as reset } from '../../src/pages/api/state/reset'
import { POST as importData } from '../../src/pages/api/data/import'
import { GET as exportData } from '../../src/pages/api/data/export'
import type { Db } from '../../src/db/client'

let sqlite: Database.Database
let db: Db
let locals: App.Locals
let binding: ReturnType<typeof createSqliteBinding>
beforeEach(async () => {
  sqlite = new Database(':memory:')
  migrateLocalDatabase(sqlite)
  binding = createSqliteBinding(sqlite)
  db = drizzle(binding as Parameters<typeof drizzle>[0], { schema })
  await db.insert(schema.users).values([
    { id: 'owner', email: 'owner@example.test', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'other', email: 'other@example.test', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ])
  locals = {
    principal: {
      userId: 'owner',
      email: 'owner@example.test',
      provider: 'test',
      subject: 'owner',
      isLegacyOwner: false,
    },
    runtimeEnv: { finance_tracker_db_v2: binding },
  } as App.Locals
})
afterEach(() => sqlite.close())

function context(path: string, body: unknown = {}, requestLocals = locals) {
  const url = new URL(`https://example.test${path}`)
  return {
    locals: requestLocals,
    url,
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as never
}

async function exported() {
  const response = await exportData(context('/api/data/export'))
  const { exportedAt, ...data } = await response.json()
  void exportedAt
  return data
}

it.each(['initialize', 'reset', 'import', 'replace'] as const)(
  'rolls back %s after a late write failure and preserves the other user',
  async (operation) => {
    await accountsRepository.create(db, 'other', {
      name: 'Other account',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 50,
    })
    if (operation !== 'initialize') {
      await initialize(context('/api/state/initialize'))
      const account = await accountsRepository.create(db, 'owner', {
        name: 'Original account',
        kind: 'cash',
        currency: 'EUR',
        openingBalance: 25,
      })
      await transactionsRepository.create(db, 'owner', {
        accountId: account.id,
        type: 'investment',
        date: '2026-01-01',
        amount: -10,
        currency: 'EUR',
        operation: { symbol: 'TEST', side: 'buy', units: 1, unitPrice: 10, fee: 0 },
      })
    }
    const before = await exported()
    const otherBefore = await accountsRepository.listByUser(db, 'other')
    // A real SQLite failure after earlier writes, without mocking a repository.
    const failureTable =
      operation === 'initialize'
        ? 'user_revisions'
        : operation === 'reset'
          ? 'categories'
          : 'accounts'
    sqlite.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${failureTable}
    BEGIN SELECT RAISE(ABORT, 'injected category failure'); END`)
    const response =
      operation === 'initialize'
        ? await initialize(context('/api/state/initialize'))
        : operation === 'reset'
          ? await reset(context('/api/state/reset'))
          : await importData(
              context(`/api/data/import${operation === 'replace' ? '?mode=replace' : ''}`, {
                categories: [{ id: 'category-1', name: 'First', kind: 'expense' }],
                accounts: [{ id: 'account-1', name: 'New', kind: 'cash', currency: 'EUR' }],
              }),
            )
    expect(response.status).toBe(500)
    expect(await exported()).toEqual(before)
    expect(await accountsRepository.listByUser(db, 'other')).toEqual(otherBefore)
  },
)

it('rolls back user provisioning when identity creation fails', async () => {
  sqlite.exec(`CREATE TRIGGER fail_identity BEFORE INSERT ON user_identities
    BEGIN SELECT RAISE(ABORT, 'injected identity failure'); END`)
  await expect(
    resolvePrincipal(db, { provider: 'test', subject: 'new', email: 'new@example.test' }),
  ).rejects.toThrow()
  expect((await db.select().from(schema.users)).map((row) => row.id)).toEqual(['owner', 'other'])
  expect(await db.select().from(schema.userIdentities)).toEqual([])
})

it('rolls back a command including changes, cursor and result while retaining its recoverable reservation', async () => {
  sqlite.exec(`CREATE TRIGGER fail_result BEFORE UPDATE OF result ON sync_commands
    BEGIN SELECT RAISE(ABORT, 'injected result failure'); END`)
  await expect(
    applyOneCommand(db, 'owner', {
      commandId: 'failed-command',
      action: 'create',
      entityType: 'account',
      data: { name: 'Rollback account', kind: 'cash', currency: 'EUR', openingBalance: 0 },
    }),
  ).rejects.toThrow()
  expect(await accountsRepository.listByUser(db, 'owner')).toEqual([])
  expect(await db.select().from(schema.syncChanges)).toEqual([])
  expect(await db.select().from(schema.auditEvents)).toEqual([])
  expect(await syncRepository.getRevision(db, 'owner')).toBeUndefined()
  expect(await syncRepository.getCommand(db, 'owner', 'failed-command')).toMatchObject({
    status: 'processing',
    result: null,
  })
})

it('applies the same command concurrently only once through the production binding', async () => {
  const command = {
    commandId: 'same-command',
    action: 'create' as const,
    entityType: 'account' as const,
    data: { name: 'Once', kind: 'cash', currency: 'EUR', openingBalance: 0 },
  }
  const outcomes = await Promise.all([
    applyOneCommand(db, 'owner', command),
    applyOneCommand(db, 'owner', command),
  ])
  expect(outcomes.filter((outcome) => !outcome.replayed)).toHaveLength(1)
  expect(await accountsRepository.listByUser(db, 'owner')).toHaveLength(1)
  expect(await syncRepository.getRevision(db, 'owner')).toMatchObject({ revision: 1 })
  expect(await applyOneCommand(db, 'owner', command)).toMatchObject({
    status: 'applied',
    replayed: true,
  })
})

it('initializes a concurrent request only once', async () => {
  const responses = await Promise.all([
    initialize(context('/api/state/initialize')),
    initialize(context('/api/state/initialize')),
  ])
  expect(responses.map((response) => response.status).sort()).toEqual([200, 201])
  expect(await accountsRepository.listCategoriesByUser(db, 'owner')).toEqual([])
  expect(await db.select().from(schema.userSettings)).toHaveLength(1)
  expect(await syncRepository.getRevision(db, 'owner')).toMatchObject({ revision: 0 })
})

it('recovers a failed command after its lease expires and replays the committed result', async () => {
  const command = {
    commandId: 'recover-command',
    action: 'create' as const,
    entityType: 'account' as const,
    data: { name: 'Recovered', kind: 'cash', currency: 'EUR', openingBalance: 0 },
  }
  sqlite.exec(`CREATE TRIGGER fail_result BEFORE UPDATE OF result ON sync_commands
    BEGIN SELECT RAISE(ABORT, 'injected result failure'); END`)
  await expect(applyOneCommand(db, 'owner', command)).rejects.toMatchObject({
    cause: { message: 'injected result failure' },
  })
  expect(await applyOneCommand(db, 'owner', command)).toMatchObject({ status: 'in_progress' })
  sqlite.exec('DROP TRIGGER fail_result')
  // Advance only this reservation's lease, independent of wall-clock ordering.
  sqlite
    .prepare('UPDATE sync_commands SET created_at = ? WHERE id = ?')
    .run('2000-01-01T00:00:00.000Z', command.commandId)
  expect(await applyOneCommand(db, 'owner', command)).toMatchObject({
    status: 'applied',
    replayed: false,
  })
  expect(await applyOneCommand(db, 'owner', command)).toMatchObject({
    status: 'applied',
    replayed: true,
  })
  expect(await accountsRepository.listByUser(db, 'owner')).toHaveLength(1)
  expect(await syncRepository.getRevision(db, 'owner')).toMatchObject({ revision: 1 })
  expect(await db.select().from(schema.syncChanges)).toHaveLength(1)
  expect(await db.select().from(schema.auditEvents)).toHaveLength(1)
  expect(await syncRepository.getCommand(db, 'owner', command.commandId)).toMatchObject({
    status: 'applied',
    result: expect.any(String),
  })
})

it('rolls back the investment operation and movement with sync metadata on a finalization failure', async () => {
  const account = await accountsRepository.create(db, 'owner', {
    name: 'Broker',
    kind: 'investment',
    currency: 'EUR',
    openingBalance: 0,
  })
  sqlite.exec(`CREATE TRIGGER fail_result BEFORE UPDATE OF result ON sync_commands
    BEGIN SELECT RAISE(ABORT, 'injected result failure'); END`)
  await expect(
    applyOneCommand(db, 'owner', {
      commandId: 'investment-command',
      action: 'create',
      entityType: 'transaction',
      data: {
        accountId: account.id,
        type: 'investment',
        date: '2026-01-01',
        amount: -10,
        currency: 'EUR',
        operation: { symbol: 'TEST', side: 'buy', units: 1, unitPrice: 10, fee: 0 },
      },
    }),
  ).rejects.toThrow()
  expect(await db.select().from(schema.transactions)).toEqual([])
  expect(await db.select().from(schema.investmentTradeDetails)).toEqual([])
  expect(await db.select().from(schema.syncChanges)).toEqual([])
  expect(await syncRepository.getRevision(db, 'owner')).toBeUndefined()
})

it('preserves another user importing concurrently while the first import rolls back', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const transaction = binding[interactiveTransaction]
  const enqueued = Promise.withResolvers<void>()
  let started = 0
  // Hold the real transaction at the backend boundary after the route fails,
  // letting the other request enqueue before rollback, without timers.
  binding[interactiveTransaction] = (fn) => {
    const pending = transaction(async () => {
      try {
        return await fn()
      } catch (error) {
        entered.resolve()
        await release.promise
        throw error
      }
    })
    started += 1
    if (started === 2) enqueued.resolve()
    return pending
  }
  sqlite.exec(`CREATE TRIGGER fail_owner_account BEFORE INSERT ON accounts
    WHEN NEW.user_id = 'owner'
    BEGIN SELECT RAISE(ABORT, 'injected account failure'); END`)
  const failing = importData(
    context('/api/data/import', {
      categories: [{ id: 'first', name: 'Rolled back category', kind: 'expense' }],
      accounts: [{ id: 'fail', name: 'Fail', kind: 'cash', currency: 'EUR' }],
    }),
  )
  await entered.promise
  const otherLocals = { ...locals, principal: { ...locals.principal!, userId: 'other' } }
  const successful = importData(
    context(
      '/api/data/import',
      {
        accounts: [{ id: 'success', name: 'Surviving account', kind: 'cash', currency: 'EUR' }],
      },
      otherLocals,
    ),
  )
  await enqueued.promise
  release.resolve()
  expect((await failing).status).toBe(500)
  expect((await successful).status).toBe(200)
  expect(await accountsRepository.listCategoriesByUser(db, 'owner')).toEqual([])
  expect(await accountsRepository.listByUser(db, 'other')).toMatchObject([
    { name: 'Surviving account' },
  ])
})

it.each(['', '?mode=replace'])(
  'rolls back imported related rows after a later allocation failure %s',
  async (mode) => {
    const before = await exported()
    sqlite.exec(`CREATE TRIGGER fail_allocation BEFORE INSERT ON contribution_allocations
    BEGIN SELECT RAISE(ABORT, 'injected allocation failure'); END`)
    const response = await importData(
      context(`/api/data/import${mode}`, {
        accounts: [{ id: 'broker', name: 'Broker', kind: 'investment', currency: 'EUR' }],
        transactions: [
          {
            accountId: 'broker',
            type: 'investment',
            date: '2026-01-01',
            amount: -10,
            currency: 'EUR',
            operation: { symbol: 'TEST', side: 'buy', units: 1, unitPrice: 10, fee: 0 },
          },
        ],
        wealthSnapshots: [
          {
            snapshotDate: '2026-01-01',
            year: 2026,
            month: 1,
            balances: [{ accountId: 'broker', balance: 10, currency: 'EUR' }],
          },
        ],
        contributions: [
          {
            date: '2026-01-01',
            amount: 10,
            currency: 'EUR',
            allocations: [{ accountId: 'broker', amount: 10 }],
          },
        ],
      }),
    )
    expect(response.status).toBe(500)
    expect(await exported()).toEqual(before)
  },
)
