import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/d1'
import { drizzle as nativeDrizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createSqliteBinding } from '../../src/lib/server/local/sqlite-binding'
import { migrateLocalDatabase, provisionLocalAdministrator } from '../../scripts/local-init.mjs'
import { createAuthentication } from '../../src/lib/server/auth/better-auth'
import * as schema from '../../src/db/schema'
import { runInTransaction } from '../../src/db/repositories/shared'
import type { Db } from '../../src/db/client'

let sqlite: Database.Database
let db: Db
beforeEach(() => {
  sqlite = new Database(':memory:')
  migrateLocalDatabase(sqlite)
  // Drizzle types require the full Workers binding; this boundary implements
  // the prepared queries and atomic batch methods actually used by the app.
  db = drizzle(createSqliteBinding(sqlite) as Parameters<typeof drizzle>[0], { schema })
})
afterEach(() => sqlite.close())

it('reapplies migrations without losing financial data', async () => {
  await db.insert(schema.users).values({
    id: 'owner',
    email: 'owner@example.test',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  })
  migrateLocalDatabase(sqlite)
  expect(await db.select().from(schema.users)).toMatchObject([{ id: 'owner' }])
})

it('rolls back every statement when an atomic batch fails', async () => {
  await expect(
    db.batch([
      db.insert(schema.users).values({
        id: 'first',
        email: 'same@example.test',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }),
      db.insert(schema.users).values({
        id: 'second',
        email: 'same@example.test',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }),
    ]),
  ).rejects.toThrow()
  expect(await db.select().from(schema.users)).toEqual([])
})

it('logs in with a real session and preserves the administrator on restart', async () => {
  const email = 'local@example.test'
  const password = 'local-test-password-123'
  await provisionLocalAdministrator(sqlite, email, password)
  await provisionLocalAdministrator(sqlite, email, 'different-password-123')
  const auth = createAuthentication(db, {
    BETTER_AUTH_URL: 'http://localhost:4321',
    BETTER_AUTH_SECRET: 'local-test-secret-with-at-least-32-characters',
  })
  const response = await auth.handler(
    new Request('http://localhost:4321/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:4321' },
      body: JSON.stringify({ email, password }),
    }),
  )
  expect(response.status).toBe(200)
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  const session = await auth.handler(
    new Request('http://localhost:4321/api/auth/get-session', { headers: { cookie } }),
  )
  expect((await session.json()).user.email).toBe(email)
  expect(await db.select().from(schema.authRole)).toMatchObject([{ role: 'admin' }])
})

it('rolls back an async domain operation through the production binding', async () => {
  await expect(
    runInTransaction(db, async (tx) => {
      await tx.insert(schema.users).values({
        id: 'rolled-back',
        email: 'rollback@example.test',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })
      await Promise.resolve()
      throw new Error('interrupted')
    }),
  ).rejects.toThrow('interrupted')
  expect(await db.select().from(schema.users)).toEqual([])
})

function user(id: string) {
  return { id, email: `${id}@example.test`, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
}

it('commits all async writes and returns the callback result', async () => {
  expect(
    await runInTransaction(db, async (tx) => {
      await tx.insert(schema.users).values(user('first'))
      await tx.insert(schema.users).values(user('second'))
      return 'committed'
    }),
  ).toBe('committed')
  expect((await db.select().from(schema.users)).map((row) => row.id)).toEqual(['first', 'second'])
})

it('isolates another handle and its atomic batch until an async rollback', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const other = drizzle(createSqliteBinding(sqlite) as Parameters<typeof drizzle>[0], { schema })
  const failing = runInTransaction(db, async (tx) => {
    await tx.insert(schema.users).values(user('uncommitted'))
    entered.resolve()
    await release.promise
    throw new Error('rollback A')
  })
  const rejected = expect(failing).rejects.toThrow('rollback A')
  await entered.promise
  const reading = other.select().from(schema.users).all()
  const writing = other.batch([other.insert(schema.users).values(user('survivor'))])
  release.resolve()
  await rejected
  expect(await reading).toEqual([])
  await writing
  expect(await db.select().from(schema.users)).toMatchObject([{ id: 'survivor' }])
})

it('serializes two interactive operations without losing the successful request', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const failing = runInTransaction(db, async (tx) => {
    await tx.insert(schema.users).values(user('uncommitted'))
    entered.resolve()
    await release.promise
    throw new Error('rollback A')
  })
  const rejected = expect(failing).rejects.toThrow('rollback A')
  await entered.promise
  const successful = runInTransaction(db, async (tx) => {
    expect(await tx.select().from(schema.users)).toEqual([])
    await tx.insert(schema.users).values(user('survivor'))
  })
  release.resolve()
  await rejected
  await successful
  expect(await db.select().from(schema.users)).toMatchObject([{ id: 'survivor' }])
})

it('propagates a real BEGIN failure without running the callback or disabling another connection', async () => {
  sqlite.exec('BEGIN')
  let called = false
  await expect(
    runInTransaction(db, async () => {
      called = true
    }),
  ).rejects.toThrow('within a transaction')
  expect(called).toBe(false)
  sqlite.exec('ROLLBACK')
  await expect(
    runInTransaction(db, async (tx) => {
      await tx.insert(schema.users).values(user('rolled-back'))
      throw new Error('rollback')
    }),
  ).rejects.toThrow('rollback')
  expect(await db.select().from(schema.users)).toEqual([])
})

it.each(['local', 'native'] as const)(
  'D1 capability does not disable rollback on %s SQLite',
  async (backend) => {
    const binding = createSqliteBinding(sqlite)
    const d1 = drizzle(
      { prepare: binding.prepare, batch: binding.batch } as Parameters<typeof drizzle>[0],
      { schema },
    )
    await runInTransaction(d1, async () => undefined)
    const handle = backend === 'local' ? db : nativeDrizzle(sqlite, { schema })
    await expect(
      runInTransaction(handle, async (tx) => {
        await tx.insert(schema.users).values(user('rollback'))
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await handle.select().from(schema.users)).toEqual([])
  },
)

it('rolls back an atomic batch inside an interactive operation', async () => {
  await expect(
    runInTransaction(db, async () => {
      await db.batch([
        db.insert(schema.users).values(user('first')),
        db.insert(schema.users).values(user('second')),
      ])
      throw new Error('rollback batch')
    }),
  ).rejects.toThrow('rollback batch')
  expect(await db.select().from(schema.users)).toEqual([])
})

it('preserves the SQLite error when a trigger has already rolled back the transaction', async () => {
  sqlite.exec(`CREATE TRIGGER abort_transaction BEFORE INSERT ON users
    BEGIN SELECT RAISE(ROLLBACK, 'injected rollback'); END`)
  await expect(
    runInTransaction(db, async (tx) => {
      await tx.insert(schema.users).values(user('failed'))
    }),
  ).rejects.toThrow()
  expect(await db.select().from(schema.users)).toEqual([])
  sqlite.exec('DROP TRIGGER abort_transaction')
  expect(await runInTransaction(db, async () => 'next transaction')).toBe('next transaction')
})

it('rejects work inherited from a completed transaction', async () => {
  const release = Promise.withResolvers<void>()
  let detached: Promise<unknown> = Promise.resolve()
  await runInTransaction(db, async (tx) => {
    detached = release.promise.then(() => tx.insert(schema.users).values(user('too-late')))
  })
  const rejected = expect(detached).rejects.toThrow()
  release.resolve()
  await rejected
  expect(await db.select().from(schema.users)).toEqual([])
})

it('does not expose synchronous execution on prepared or bound statements', () => {
  const binding = createSqliteBinding(sqlite)
  const statement = binding.prepare('SELECT id FROM users WHERE id = ?')
  expect(statement).not.toHaveProperty('execute')
  expect(statement.bind('owner')).not.toHaveProperty('execute')
})

it('does not expose the native connection through a prepared statement', () => {
  const binding = createSqliteBinding(sqlite)
  const statement = binding.prepare('SELECT id FROM users WHERE id = ?')
  expect(statement).not.toHaveProperty('connection')
  expect(statement.bind('owner')).not.toHaveProperty('connection')
})

it('rejects batches spanning physical connections before executing any writes', async () => {
  const otherSqlite = new Database(':memory:')
  try {
    migrateLocalDatabase(otherSqlite)
    const binding = createSqliteBinding(sqlite)
    const other = createSqliteBinding(otherSqlite)
    const insert = 'INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)'
    await expect(
      binding.batch([
        binding.prepare(insert).bind('first', 'first@example.test', '2026-01-01', '2026-01-01'),
        other.prepare(insert).bind('second', 'second@example.test', '2026-01-01', '2026-01-01'),
      ]),
    ).rejects.toThrow('must belong to its connection')
    expect((await binding.prepare('SELECT id FROM users').all()).results).toEqual([])
    expect((await other.prepare('SELECT id FROM users').all()).results).toEqual([])
  } finally {
    otherSqlite.close()
  }
})

it.each([
  'BEGIN IMMEDIATE',
  'SAVEPOINT foreign_transaction',
  'COMMIT',
  'END',
  'ROLLBACK',
  'RELEASE foreign_transaction',
  '; /* transaction control */ COMMIT',
  '-- transaction control\nROLLBACK',
])('retains transaction ownership when a statement attempts %s', async (sql) => {
  const binding = createSqliteBinding(sqlite)
  await expect(
    runInTransaction(db, async (tx) => {
      await tx.insert(schema.users).values(user('uncommitted'))
      await expect(binding.prepare(sql).run()).rejects.toThrow('Transaction control')
      throw new Error('rollback owner')
    }),
  ).rejects.toThrow('rollback owner')
  expect(await db.select().from(schema.users)).toEqual([])
})

it.each(['first', 'raw', 'all'] as const)(
  'rejects transaction control consistently through %s',
  async (method) => {
    const binding = createSqliteBinding(sqlite)
    await expect(binding.prepare('COMMIT')[method]()).rejects.toThrow('Transaction control')
  },
)

it('rolls back prior batch writes when a transaction-control statement is rejected', async () => {
  const binding = createSqliteBinding(sqlite)
  await expect(
    binding.batch([
      binding
        .prepare('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .bind('uncommitted', 'uncommitted@example.test', '2026-01-01', '2026-01-01'),
      binding.prepare('COMMIT'),
    ]),
  ).rejects.toThrow('Transaction control')
  expect(await db.select().from(schema.users)).toEqual([])
})
