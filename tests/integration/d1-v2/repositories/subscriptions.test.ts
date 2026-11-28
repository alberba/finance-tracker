import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as subscriptionsRepo from '../../../../src/db/repositories/subscriptions'
import { createTestDb, type TestDatabase } from '../setup'
import { seedUser } from './fixtures'
import { runWithDb } from '../../../../src/db/database'

describe('subscriptions repository', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  it('enforces cross-user isolation', async () => {
    const { db } = testDb
    const userA = await seedUser(db)
    const userB = await seedUser(db)
    const created = await runWithDb(
      db,
      subscriptionsRepo.create(userA.id, {
        name: 'Streaming',
        amount: 9.99,
        currency: 'EUR',
        frequency: 'monthly',
      }),
    )

    expect(await runWithDb(db, subscriptionsRepo.get(userB.id, created.id))).toBeUndefined()
    expect(await runWithDb(db, subscriptionsRepo.listByUser(userB.id))).toHaveLength(0)
  })
})
