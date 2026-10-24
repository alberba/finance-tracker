import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import * as schema from '../../../src/db/schema'
import type { Db } from '../../../src/db/client'
import { createAuthentication } from '../../../src/lib/server/auth/better-auth'
import {
  authenticatedPrincipal,
  registrationAdministration,
} from '../../../src/db/repositories/authentication'
import { authRole } from '../../../src/db/schema/authentication'
import { runWithDb } from '../../../src/db/database'

let sqlite: Database.Database | undefined
afterEach(() => sqlite?.close())
it('preserves the migrated financial identity and explicit administrator role at login', async () => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  for (const filename of readdirSync('migrations-v2')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (filename === '0008_authentication.sql') {
      sqlite.exec(`INSERT INTO users(id,email,is_legacy_owner,created_at,updated_at) VALUES('existing-owner','owner@example.com',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO user_identities(id,user_id,provider,subject,email,created_at) VALUES('known-access','existing-owner','cf-access','access-subject','owner@example.com','2026-01-01T00:00:00Z');`)
    }
    sqlite.exec(
      readFileSync(`migrations-v2/${filename}`, 'utf8').replaceAll('--> statement-breakpoint', ''),
    )
  }
  const db = drizzle(sqlite, { schema }) as unknown as Db
  let otp = ''
  const auth = createAuthentication(
    db,
    {
      BETTER_AUTH_URL: 'http://localhost:4321',
      BETTER_AUTH_SECRET: 'migration-secret-with-thirty-two-characters',
    },
    async ({ text }) => {
      otp = text.match(/\b\d{6}\b/)![0]
    },
  )
  await db.insert(authRole).values({ userId: 'existing-owner', role: 'admin' })
  await auth.api.sendVerificationOTP({ body: { email: 'owner@example.com', type: 'sign-in' } })
  const login = await auth.api.signInEmailOTP({ body: { email: 'owner@example.com', otp } })
  expect(login.user.id).toBe('existing-owner')
  expect(await runWithDb(db, authenticatedPrincipal(login.user.id))).toEqual({
    userId: 'existing-owner',
    email: 'owner@example.com',
    name: login.user.name,
    provider: 'better-auth',
    subject: 'existing-owner',
    isAdmin: true,
  })
  expect((await runWithDb(db, registrationAdministration())).invitations).toEqual([])
})
