/**
 * Email casing must never decide whether an identity resolves.
 *
 * `users.email` is a plain `text ... unique` column and SQLite compares text
 * case-sensitively, so before normalization `Owner@Example.com` and
 * `owner@example.com` were two distinct rows and two distinct lookups.
 * Authentication providers can return the same address with different casing,
 * so normalization must happen before persistence and lookup.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDatabase } from '../setup'
import * as usersRepository from '../../../../src/db/repositories/users'

describe('email casing', () => {
  let testDb: TestDatabase
  let db: TestDatabase['db']

  beforeEach(() => {
    testDb = createTestDb()
    db = testDb.db
  })

  afterEach(() => {
    testDb.close()
  })

  it('stores users.email normalized', async () => {
    const user = await usersRepository.create(db, {
      email: '  Owner@Example.COM ',
    })
    expect(user.email).toBe('owner@example.com')
  })

  it('finds a user regardless of the casing used to look it up', async () => {
    await usersRepository.create(db, { email: 'owner@example.com' })

    for (const variant of [
      'owner@example.com',
      'Owner@Example.com',
      'OWNER@EXAMPLE.COM',
      '  owner@example.com  ',
    ]) {
      const found = await usersRepository.getByEmail(db, variant)
      expect(found, `lookup failed for ${JSON.stringify(variant)}`).toBeDefined()
      expect(found?.email).toBe('owner@example.com')
    }
  })
})
