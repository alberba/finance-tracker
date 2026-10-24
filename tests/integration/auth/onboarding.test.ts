import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { authPolicy, authUser, authAdmission, users } from '../../../src/db/schema'
import { admitVerifiedUser } from '../../../src/db/repositories/authentication'
import * as userSettingsRepository from '../../../src/db/repositories/user-settings'
import * as accountsRepository from '../../../src/db/repositories/accounts'
import { resolvePrincipal } from '../../../src/lib/server/auth/principal'
import type { Db } from '../../../src/db/client'
import { createTestDb, type TestDatabase } from '../d1-v2/setup'
import { seedUser } from '../d1-v2/repositories/fixtures'
import { runWithDb } from '../../../src/db/database'

describe('authentication provisions only newly created financial users', () => {
  let database: TestDatabase
  beforeEach(() => {
    database = createTestDb()
  })
  afterEach(() => database.close())

  async function verifiedUser(id: string, email: string) {
    const now = new Date('2026-10-10T12:00:00Z')
    await database.db
      .insert(authUser)
      .values({ id, email, name: 'New user', emailVerified: true, createdAt: now, updatedAt: now })
    await database.db
      .update(authPolicy)
      .set({ publicRegistration: true })
      .where(eq(authPolicy.id, 'registration'))
  }

  it('creates ten categories before Better Auth admission returns and never duplicates them', async () => {
    const id = 'new-auth-user'
    await verifiedUser(id, 'new-auth@example.com')
    await runWithDb(database.db as unknown as Db, admitVerifiedUser(id))
    const categories = await runWithDb(database.db, accountsRepository.listCategoriesByUser(id))
    expect(categories).toHaveLength(10)
    expect((await runWithDb(database.db, userSettingsRepository.get(id)))?.onboardingPresented).toBe(0)
    expect(await runWithDb(database.db, accountsRepository.listByUser(id))).toEqual([])
    await runWithDb(database.db, userSettingsRepository.update(id, { onboardingCompleted: true }))
    await runWithDb(database.db as unknown as Db, admitVerifiedUser(id))
    expect(await runWithDb(database.db, accountsRepository.listCategoriesByUser(id))).toEqual(categories)
    expect((await runWithDb(database.db, userSettingsRepository.get(id)))?.onboardingCompleted).toBe(1)
  })

  it('does not initialize an existing Better Auth financial user with absent settings', async () => {
    const user = await seedUser(database.db, 'existing-auth@example.com')
    await verifiedUser(user.id, user.email)
    await runWithDb(database.db as unknown as Db, admitVerifiedUser(user.id))
    expect(await runWithDb(database.db, userSettingsRepository.get(user.id))).toBeUndefined()
    expect(await runWithDb(database.db, accountsRepository.listCategoriesByUser(user.id))).toEqual([])
  })

  it('provisions settings and default categories for a new loopback identity', async () => {
    const principal = await resolvePrincipal(database.db, {
      provider: 'better-auth',
      subject: 'shim-user',
      email: 'shim@example.com',
    })
    expect((await runWithDb(database.db, userSettingsRepository.get(principal.userId)))?.onboardingPresented).toBe(
      0,
    )
    expect(await runWithDb(database.db, accountsRepository.listCategoriesByUser(principal.userId))).toHaveLength(
      10,
    )
  })

  it('rolls back admission if category provisioning fails', async () => {
    await verifiedUser('failed-auth-user', 'failed@example.com')
    database.sqlite.exec(
      "CREATE TRIGGER reject_categories BEFORE INSERT ON categories BEGIN SELECT RAISE(ABORT, 'category failure'); END",
    )
    await expect(
      runWithDb(database.db as unknown as Db, admitVerifiedUser('failed-auth-user')),
    ).rejects.toThrow()
    expect(await database.db.select().from(authAdmission)).toEqual([])
    expect(await database.db.select().from(users)).toEqual([])
  })
})
