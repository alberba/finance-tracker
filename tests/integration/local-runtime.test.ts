import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createSqliteBinding } from '../../src/lib/server/local/sqlite-binding'
import { migrateLocalDatabase, provisionLocalAdministrator } from '../../scripts/local-init.mjs'
import { createAuthentication } from '../../src/lib/server/auth/better-auth'
import * as schema from '../../src/db/schema'
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
  await db
    .insert(schema.users)
    .values({
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
      db
        .insert(schema.users)
        .values({
          id: 'first',
          email: 'same@example.test',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        }),
      db
        .insert(schema.users)
        .values({
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
