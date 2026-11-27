import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildRepairPlan } from '../../../../scripts/lib/repair-plan'
import { createTestDb, type TestDatabase } from '../setup'
import {
  REPAIR_FIXTURE_BACKUP,
  REPAIR_FIXTURE_COLLIDING_LEGACY_ID,
  REPAIR_FIXTURE_IDS,
  seedRepairFixture,
} from './fixtures'

const REPAIR_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'budget_entries',
  'wealth_snapshots',
  'snapshot_balances',
] as const

function repairRows(testDb: TestDatabase, userId: string): Record<string, unknown[]> {
  return Object.fromEntries(
    REPAIR_TABLES.map((table) => [
      table,
      testDb.sqlite
        .prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY id`)
        .all(userId) as unknown[],
    ]),
  )
}

describe('v2 repair planner', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  it('returns the repair plan and leaves the database untouched', async () => {
    const fixture = seedRepairFixture(testDb)
    const before = repairRows(testDb, fixture.userId)

    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    expect(plan).toMatchObject({
      categoryMerges: [
        {
          duplicateCategoryId: REPAIR_FIXTURE_IDS.duplicateCategory,
          canonicalCategoryId: REPAIR_FIXTURE_IDS.migratedCategory,
        },
      ],
      accountKindCorrections: [
        { accountId: REPAIR_FIXTURE_IDS.account, fromKind: 'checking', toKind: 'cash' },
      ],
      budgetRestorations: [{ action: 'update' }, { action: 'insert' }],
      snapshotRestorations: [{ action: 'insert' }],
      correlationIdFixes: [
        {
          rowId: REPAIR_FIXTURE_IDS.contributionLate,
          fromLegacyId: REPAIR_FIXTURE_COLLIDING_LEGACY_ID,
          toLegacyId: `${REPAIR_FIXTURE_COLLIDING_LEGACY_ID}@2`,
        },
      ],
    })

    expect(repairRows(testDb, fixture.userId)).toEqual(before)
  })
})
