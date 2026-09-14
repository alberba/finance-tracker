import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildRepairPlan } from '../../../../scripts/lib/repair-plan'
import { createTestDb, type TestDatabase } from '../setup'
import { REPAIR_FIXTURE_BACKUP, REPAIR_FIXTURE_IDS, seedRepairFixture } from './fixtures'

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

  it('seeds each documented production defect with stable evidence', () => {
    const fixture = seedRepairFixture(testDb)
    const { sqlite } = testDb

    expect(
      sqlite
        .prepare('SELECT legacy_id, name, kind FROM categories WHERE user_id = ? ORDER BY id')
        .all(fixture.userId),
    ).toEqual([
      { legacy_id: 'expense:Comida', name: 'Comida', kind: 'expense' },
      { legacy_id: 'Comida', name: 'Comida', kind: 'expense' },
    ])
    expect(sqlite.prepare('SELECT kind FROM accounts WHERE id = ?').get(fixture.accountId)).toEqual(
      { kind: 'checking' },
    )
    expect(
      sqlite
        .prepare('SELECT year, month, amount_minor FROM budget_entries WHERE id = ?')
        .get(fixture.budgetEntryId),
    ).toEqual({ year: 2025, month: 1, amount_minor: 25000 })
    expect(
      sqlite
        .prepare('SELECT legacy_id, year, month FROM wealth_snapshots WHERE id = ?')
        .get(fixture.snapshotId),
    ).toEqual({ legacy_id: '3', year: 2026, month: 3 })
  })

  it('returns the repair plan and leaves the database untouched', async () => {
    const fixture = seedRepairFixture(testDb)
    const before = repairRows(testDb, fixture.userId)

    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    expect(plan).toEqual({
      categoryMerges: [
        {
          duplicateCategoryId: REPAIR_FIXTURE_IDS.duplicateCategory,
          canonicalCategoryId: REPAIR_FIXTURE_IDS.migratedCategory,
          name: 'Comida',
          kind: 'expense',
          references: [
            {
              table: 'transactions',
              column: 'categoryId',
              rowId: REPAIR_FIXTURE_IDS.transaction,
            },
          ],
        },
      ],
      accountKindCorrections: [
        {
          accountId: REPAIR_FIXTURE_IDS.account,
          name: 'Cuenta principal',
          fromKind: 'checking',
          toKind: 'cash',
        },
      ],
      budgetRestorations: [
        {
          action: 'update',
          budgetEntryId: REPAIR_FIXTURE_IDS.budgetEntry,
          categoryId: REPAIR_FIXTURE_IDS.migratedCategory,
          year: 2025,
          month: 1,
          amountMinor: 10000,
          currency: 'EUR',
          reason: 'overwritten',
        },
        {
          action: 'insert',
          categoryId: REPAIR_FIXTURE_IDS.migratedCategory,
          year: 2026,
          month: 1,
          amountMinor: 25000,
          currency: 'EUR',
          reason: 'missing',
        },
      ],
      snapshotRestorations: [
        {
          action: 'insert',
          snapshotDate: '2025-03-31',
          year: 2025,
          month: 3,
          balances: [
            {
              accountId: REPAIR_FIXTURE_IDS.account,
              balanceMinor: 300000,
              currency: 'EUR',
            },
          ],
          reason: 'missing',
        },
      ],
    })

    expect(repairRows(testDb, fixture.userId)).toEqual(before)
  })
})
