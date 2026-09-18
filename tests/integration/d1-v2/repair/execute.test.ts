import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyRepairPlan,
  buildRepairPlan,
  formatRepairPlan,
  loadRepairBackup,
  type RepairExecutionReport,
} from '../../../../scripts/lib/repair-plan'
import { createTestDb, type TestDatabase } from '../setup'
import {
  REPAIR_FIXTURE_BACKUP,
  REPAIR_FIXTURE_IDS,
  seedRepairFixture,
  type RepairFixture,
} from './fixtures'
import { runRepairCli } from '../../../../scripts/repair-corrupted-data'

describe('v2 repair execution', () => {
  let testDb: TestDatabase
  let fixture: RepairFixture

  beforeEach(() => {
    testDb = createTestDb()
    fixture = seedRepairFixture(testDb)
  })

  afterEach(() => {
    testDb.close()
  })

  it('demands a valid backup export before execution', () => {
    expect(() => loadRepairBackup(null)).toThrow(/export de respaldo/i)
    expect(() => loadRepairBackup({})).toThrow(/export de respaldo/i)
    expect(() => loadRepairBackup({ budgetCells: 'invalid' })).toThrow(/export de respaldo/i)
  })

  it('loads backup from direct RepairBackup structure and v1 State export format', () => {
    const direct = loadRepairBackup(REPAIR_FIXTURE_BACKUP)
    expect(direct.budgetCells).toHaveLength(2)
    expect(direct.snapshots).toHaveLength(2)

    const legacyState = {
      meta: { source: 'test', generatedAt: '2026-08-12T00:00:00Z', version: 1, savedAt: null },
      year: 2025,
      currency: 'EUR',
      budget: {
        expense: {
          Comida: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        income: {},
        investment: {},
      },
      snapshots: {
        '2': {
          month: 2,
          accounts: { 'account:main': 3000 },
          investments: {},
          liabilities: {},
        },
      },
    }

    const fromLegacy = loadRepairBackup(legacyState)
    expect(fromLegacy.budgetCells).toEqual([
      {
        categoryName: 'Comida',
        categoryKind: 'expense',
        year: 2025,
        month: 1,
        amountMinor: 10000,
        currency: 'EUR',
      },
    ])
    expect(fromLegacy.snapshots).toEqual([
      {
        year: 2025,
        month: 3,
        snapshotDate: '2025-03-01',
        balances: [
          {
            accountLegacyId: 'account:main',
            balanceMinor: 300000,
            currency: 'EUR',
          },
        ],
      },
    ])
  })

  it('formats simulation plan as human-readable text without writing to database', async () => {
    const { sqlite } = testDb
    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    const formatted = formatRepairPlan(plan, { simulation: true })

    expect(formatted).toContain('SIMULACIÓN')
    expect(formatted).toContain('Comida')
    expect(formatted).toContain('Cuenta principal')
    expect(formatted).toContain('2025')
    expect(formatted).toContain('2026')

    // Database remains untouched
    expect(
      sqlite
        .prepare('SELECT COUNT(*) AS count FROM categories WHERE user_id = ?')
        .get(fixture.userId),
    ).toEqual({ count: 2 })
    expect(sqlite.prepare('SELECT kind FROM accounts WHERE id = ?').get(fixture.accountId)).toEqual(
      { kind: 'checking' },
    )
  })

  it('applies the repair plan, merges categories preserving history, fixes accounts and restores budget/snapshots', async () => {
    const { sqlite, db } = testDb
    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    const report: RepairExecutionReport = await applyRepairPlan(db, fixture.userId, plan)

    expect(report).toEqual({
      categoryMerges: 1,
      referencesRepointed: 1,
      accountsCorrected: 1,
      budgetEntriesUpdated: 1,
      budgetEntriesInserted: 1,
      snapshotsUpdated: 0,
      snapshotsInserted: 1,
    })

    // 1. Categories: duplicate deleted, canonical remains
    const remainingCategories = sqlite
      .prepare('SELECT id, legacy_id, name FROM categories WHERE user_id = ? ORDER BY id')
      .all(fixture.userId)
    expect(remainingCategories).toEqual([
      {
        id: REPAIR_FIXTURE_IDS.migratedCategory,
        legacy_id: 'Comida',
        name: 'Comida',
      },
    ])

    // 2. Transaction history preserved: repointed to canonical category
    const tx = sqlite
      .prepare('SELECT id, category_id, description, amount_minor FROM transactions WHERE id = ?')
      .get(fixture.transactionId) as {
      id: string
      category_id: string
      description: string
      amount_minor: number
    }
    expect(tx.category_id).toBe(REPAIR_FIXTURE_IDS.migratedCategory)
    expect(tx.description).toBe('Compra que conserva el historial')
    expect(tx.amount_minor).toBe(1250)

    // 3. Accounts: kind corrected to cash
    expect(sqlite.prepare('SELECT kind FROM accounts WHERE id = ?').get(fixture.accountId)).toEqual(
      { kind: 'cash' },
    )

    // 4. Budget cells: 2025 restored to 10000, 2026 inserted with 25000
    const budgetRows = sqlite
      .prepare(
        'SELECT category_id, year, month, amount_minor, currency FROM budget_entries WHERE user_id = ? ORDER BY year, month',
      )
      .all(fixture.userId)
    expect(budgetRows).toEqual([
      {
        category_id: REPAIR_FIXTURE_IDS.migratedCategory,
        year: 2025,
        month: 1,
        amount_minor: 10000,
        currency: 'EUR',
      },
      {
        category_id: REPAIR_FIXTURE_IDS.migratedCategory,
        year: 2026,
        month: 1,
        amount_minor: 25000,
        currency: 'EUR',
      },
    ])

    // 5. Wealth snapshots: March 2025 inserted, March 2026 preserved
    const snapshotRows = sqlite
      .prepare(
        'SELECT id, snapshot_date, year, month FROM wealth_snapshots WHERE user_id = ? ORDER BY year, month',
      )
      .all(fixture.userId) as Array<{ id: string; snapshot_date: string; year: number; month: number }>
    expect(snapshotRows).toHaveLength(2)
    expect(snapshotRows[0]).toMatchObject({
      snapshot_date: '2025-03-31',
      year: 2025,
      month: 3,
    })
    expect(snapshotRows[1]).toMatchObject({
      id: REPAIR_FIXTURE_IDS.snapshot,
      snapshot_date: '2026-03-31',
      year: 2026,
      month: 3,
    })

    const balance2025 = sqlite
      .prepare('SELECT account_id, balance_minor, currency FROM snapshot_balances WHERE snapshot_id = ?')
      .all(snapshotRows[0].id)
    expect(balance2025).toEqual([
      {
        account_id: REPAIR_FIXTURE_IDS.account,
        balance_minor: 300000,
        currency: 'EUR',
      },
    ])

    // 6. Idempotency: rebuilding plan on repaired DB returns empty plan
    const secondPlan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    expect(secondPlan).toEqual({
      categoryMerges: [],
      accountKindCorrections: [],
      budgetRestorations: [],
      snapshotRestorations: [],
    })
  })

  it('demands a backup export via CLI before execution', async () => {
    await expect(runRepairCli(['--execute'])).rejects.toThrow(/export de respaldo/i)
    await expect(runRepairCli([])).rejects.toThrow(/export de respaldo/i)
  })

  it('runs CLI in simulation mode by default and in execute mode when flag is passed', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { openLocalV2Db } = await import('../../../../scripts/lib/migration-db')

    mkdirSync('.scratch', { recursive: true })
    const backupPath = resolve('.scratch/test-repair-backup.json')
    const dbPath = resolve('.scratch/test-repair-db.sqlite')

    writeFileSync(backupPath, JSON.stringify(REPAIR_FIXTURE_BACKUP), 'utf8')

    try {
      if (existsSync(dbPath)) rmSync(dbPath)

      // Seed database
      const staging = openLocalV2Db(dbPath)
      const fixtureIds = seedRepairFixture({
        db: staging.db,
        sqlite: staging.sqlite,
        close: staging.close,
      })
      staging.close()

      // 1. Simulation run (default)
      const simResult = await runRepairCli([
        `--backup=${backupPath}`,
        `--v2-sqlite=${dbPath}`,
        `--user-id=${fixtureIds.userId}`,
      ])
      expect(simResult.executed).toBe(false)
      expect(simResult.plan.categoryMerges).toHaveLength(1)

      // Verify db is untouched
      const check1 = openLocalV2Db(dbPath)
      const catCountBefore = check1.sqlite
        .prepare('SELECT COUNT(*) as count FROM categories WHERE user_id = ?')
        .get(fixtureIds.userId) as { count: number }
      expect(catCountBefore.count).toBe(2)
      check1.close()

      // 2. Execute run
      const execResult = await runRepairCli([
        `--backup=${backupPath}`,
        `--v2-sqlite=${dbPath}`,
        `--user-id=${fixtureIds.userId}`,
        '--execute',
      ])
      expect(execResult.executed).toBe(true)

      // Verify db was repaired
      const check2 = openLocalV2Db(dbPath)
      const catCountAfter = check2.sqlite
        .prepare('SELECT COUNT(*) as count FROM categories WHERE user_id = ?')
        .get(fixtureIds.userId) as { count: number }
      expect(catCountAfter.count).toBe(1)
      const accountKind = check2.sqlite
        .prepare('SELECT kind FROM accounts WHERE id = ?')
        .get(fixtureIds.accountId) as { kind: string }
      expect(accountKind.kind).toBe('cash')
      check2.close()
    } finally {
      if (existsSync(backupPath)) rmSync(backupPath)
      if (existsSync(dbPath)) rmSync(dbPath)
    }
  })
})

