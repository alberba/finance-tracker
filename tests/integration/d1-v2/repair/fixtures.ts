/**
 * Reusable production-corruption fixture for the v2 repair planner.
 *
 * These rows mirror the defects described in
 * `docs/migration/d1-v2-persistence-audit.md`: a migrated category and a
 * client-derived duplicate, an account written with the old `checking` kind,
 * a budget value from 2026 overwriting the 2025 cell, and a March snapshot
 * whose month-only legacy id collided across years. IDs and timestamps are
 * fixed so the fixture can be shared by planner and schema tests without
 * depending on test order or wall-clock time.
 */

import type { TestDatabase } from '../setup'
import type {
  RepairBackup,
  RepairBackupBudgetCell,
  RepairBackupSnapshot,
} from '../../../../scripts/lib/repair-plan'

export const REPAIR_FIXTURE_IDS = {
  user: 'repair-fixture-user',
  migratedCategory: 'repair-category-food-migrated',
  duplicateCategory: 'repair-category-food-derived',
  account: 'repair-account-checking',
  transaction: 'repair-transaction-food',
  budgetEntry: 'repair-budget-overwritten',
  snapshot: 'repair-snapshot-march-2026',
  snapshotBalance: 'repair-snapshot-balance',
  contributionEarly: 'repair-contribution-1',
  contributionLate: 'repair-contribution-2',
} as const

/**
 * The correlation id v1 handed to two different March contributions, which the
 * v1→v2 migration then copied onto both rows.
 */
export const REPAIR_FIXTURE_COLLIDING_LEGACY_ID = 'contrib-snapshot-2026-3'

const FIXTURE_TIMESTAMP = '2026-09-13T00:00:00.000Z'

/** The clean-export budget cells expected after repair. */
export const REPAIR_FIXTURE_BUDGET_CELLS: readonly RepairBackupBudgetCell[] = [
  {
    categoryName: 'Comida',
    categoryKind: 'expense',
    year: 2025,
    month: 1,
    amountMinor: 10000,
    currency: 'EUR',
  },
  {
    categoryName: 'Comida',
    categoryKind: 'expense',
    year: 2026,
    month: 1,
    amountMinor: 25000,
    currency: 'EUR',
  },
]

/** The clean-export snapshots expected after repair. */
export const REPAIR_FIXTURE_SNAPSHOTS: readonly RepairBackupSnapshot[] = [
  {
    year: 2025,
    month: 3,
    snapshotDate: '2025-03-31',
    balances: [
      {
        accountLegacyId: 'account:main',
        balanceMinor: 300000,
        currency: 'EUR',
      },
    ],
  },
  {
    year: 2026,
    month: 3,
    snapshotDate: '2026-03-31',
    balances: [
      {
        accountLegacyId: 'account:main',
        balanceMinor: 400000,
        currency: 'EUR',
      },
    ],
  },
]

/** Backup source of truth passed explicitly to `buildRepairPlan`. */
export const REPAIR_FIXTURE_BACKUP: RepairBackup = {
  budgetCells: REPAIR_FIXTURE_BUDGET_CELLS,
  snapshots: REPAIR_FIXTURE_SNAPSHOTS,
}

export interface RepairFixture {
  userId: string
  migratedCategoryId: string
  duplicateCategoryId: string
  accountId: string
  transactionId: string
  budgetEntryId: string
  snapshotId: string
}

/**
 * Seeds the four documented corruption shapes into a real SQLite database.
 * Raw inserts are intentional: the invalid `checking` value must bypass the
 * repository's happy-path assumptions so the repair planner sees production
 * data exactly as it was stored.
 */
export function seedRepairFixture(testDb: TestDatabase): RepairFixture {
  const { sqlite } = testDb
  const ids = REPAIR_FIXTURE_IDS
  const insert = sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO users
          (id, email, display_name, is_legacy_owner, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.user,
        'repair-fixture@example.com',
        'Repair fixture',
        0,
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
      )

    sqlite
      .prepare(
        `INSERT INTO categories
          (id, user_id, legacy_id, name, kind, sort_order, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.migratedCategory,
        ids.user,
        'Comida',
        'Comida',
        'expense',
        0,
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        1,
      )

    sqlite
      .prepare(
        `INSERT INTO categories
          (id, user_id, legacy_id, name, kind, sort_order, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.duplicateCategory,
        ids.user,
        'expense:Comida',
        'Comida',
        'expense',
        1,
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        1,
      )

    sqlite
      .prepare(
        `INSERT INTO accounts
          (id, user_id, legacy_id, name, kind, currency, opening_balance_minor,
           is_archived, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.account,
        ids.user,
        'account:main',
        'Cuenta principal',
        'checking',
        'EUR',
        0,
        0,
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        1,
      )

    sqlite
      .prepare(
        `INSERT INTO transactions
          (id, user_id, legacy_id, account_id, category_id, type, date, description,
           amount_minor, currency, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.transaction,
        ids.user,
        'transaction:food',
        ids.account,
        ids.duplicateCategory,
        'expense',
        '2026-01-15',
        'Compra que conserva el historial',
        1250,
        'EUR',
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        1,
      )

    // The 2026 value was written through the month-only legacy id and landed
    // on the existing 2025 row. The clean export contains both cells.
    sqlite
      .prepare(
        `INSERT INTO budget_entries
          (id, user_id, legacy_id, category_id, year, month, amount_minor, currency,
           created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.budgetEntry,
        ids.user,
        'expense:Comida:1',
        ids.migratedCategory,
        2025,
        1,
        25000,
        'EUR',
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        1,
      )

    sqlite
      .prepare(
        `INSERT INTO wealth_snapshots
          (id, user_id, legacy_id, snapshot_date, year, month, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.snapshot,
        ids.user,
        '3',
        '2026-03-31',
        2026,
        3,
        FIXTURE_TIMESTAMP,
        FIXTURE_TIMESTAMP,
        1,
      )

    sqlite
      .prepare(
        `INSERT INTO snapshot_balances
          (id, user_id, snapshot_id, account_id, balance_minor, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ids.snapshotBalance,
        ids.user,
        ids.snapshot,
        ids.account,
        400000,
        'EUR',
        FIXTURE_TIMESTAMP,
      )

    // v1 already keyed contributions by an id that was not unique: two March
    // entries shared this one. Both are real records and the migration copied
    // both, so the closing UNIQUE on `(user_id, legacy_id)` rejects the pair
    // until the later row's correlation id moves aside.
    //
    // The tier applies every migration, so that UNIQUE is already in place
    // here. Production is still one migration behind it, which is the state
    // this fixture reproduces: drop the index so the pair can be seeded, and
    // let the repair be what makes it creatable again.
    sqlite.exec('DROP INDEX contributions_user_id_legacy_id_idx')
    for (const [id, date] of [
      [ids.contributionEarly, '2026-03-02'],
      [ids.contributionLate, '2026-03-31'],
    ] as const) {
      sqlite
        .prepare(
          `INSERT INTO contributions
            (id, user_id, legacy_id, date, amount_minor, currency, portfolio_date,
             portfolio_value_minor, flow_minor, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          ids.user,
          REPAIR_FIXTURE_COLLIDING_LEGACY_ID,
          date,
          52000,
          'EUR',
          date,
          1317047,
          52000,
          FIXTURE_TIMESTAMP,
          FIXTURE_TIMESTAMP,
          1,
        )
    }
  })

  insert()

  return {
    userId: ids.user,
    migratedCategoryId: ids.migratedCategory,
    duplicateCategoryId: ids.duplicateCategory,
    accountId: ids.account,
    transactionId: ids.transaction,
    budgetEntryId: ids.budgetEntry,
    snapshotId: ids.snapshot,
  }
}
