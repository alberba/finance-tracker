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
    await admitVerifiedUser(database.db as unknown as Db, id)
    const categories = await accountsRepository.listCategoriesByUser(database.db, id)
    expect(categories).toHaveLength(10)
    expect((await userSettingsRepository.get(database.db, id))?.onboardingPresented).toBe(0)
    expect(await accountsRepository.listByUser(database.db, id)).toEqual([])
    await userSettingsRepository.update(database.db, id, { onboardingCompleted: true })
    await admitVerifiedUser(database.db as unknown as Db, id)
    expect(await accountsRepository.listCategoriesByUser(database.db, id)).toEqual(categories)
    expect((await userSettingsRepository.get(database.db, id))?.onboardingCompleted).toBe(1)
  })

  it('does not initialize an existing Better Auth financial user with absent settings', async () => {
    const user = await seedUser(database.db, 'existing-auth@example.com')
    await verifiedUser(user.id, user.email)
    await admitVerifiedUser(database.db as unknown as Db, user.id)
    expect(await userSettingsRepository.get(database.db, user.id)).toBeUndefined()
    expect(await accountsRepository.listCategoriesByUser(database.db, user.id)).toEqual([])
  })

  it('provisions settings and default categories for a new loopback identity', async () => {
    const principal = await resolvePrincipal(database.db, {
      provider: 'better-auth',
      subject: 'shim-user',
      email: 'shim@example.com',
    })
    expect((await userSettingsRepository.get(database.db, principal.userId))?.onboardingPresented).toBe(
      0,
    )
    expect(await accountsRepository.listCategoriesByUser(database.db, principal.userId)).toHaveLength(
      10,
    )
  })

  it('rolls back admission if category provisioning fails', async () => {
    await verifiedUser('failed-auth-user', 'failed@example.com')
    database.sqlite.exec(
      "CREATE TRIGGER reject_categories BEFORE INSERT ON categories BEGIN SELECT RAISE(ABORT, 'category failure'); END",
    )
    await expect(
      admitVerifiedUser(database.db as unknown as Db, 'failed-auth-user'),
    ).rejects.toThrow()
    expect(await database.db.select().from(authAdmission)).toEqual([])
    expect(await database.db.select().from(users)).toEqual([])
  })
})
