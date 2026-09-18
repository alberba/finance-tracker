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

  it('loads backup from direct RepairBackup structure', () => {
    const direct = loadRepairBackup(REPAIR_FIXTURE_BACKUP)
    expect(direct.budgetCells).toHaveLength(2)
    expect(direct.snapshots).toHaveLength(2)
  })

  it('loads backup from v1 State export format and preserves zero amounts', () => {
    const legacyState = {
      meta: { source: 'test', generatedAt: '2026-08-12T00:00:00Z', version: 1, savedAt: null },
      year: 2025,
      currency: 'EUR',
      budget: {
        expense: {
          Comida: [100, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
      {
        categoryName: 'Comida',
        categoryKind: 'expense',
        year: 2025,
        month: 2,
        amountMinor: 0,
        currency: 'EUR',
      },
      {
        categoryName: 'Comida',
        categoryKind: 'expense',
        year: 2025,
        month: 3,
        amountMinor: 5000,
        currency: 'EUR',
      },
      ...Array.from({ length: 9 }, (_, idx) => ({
        categoryName: 'Comida',
        categoryKind: 'expense',
        year: 2025,
        month: idx + 4,
        amountMinor: 0,
        currency: 'EUR',
      })),
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

  it('merges duplicate categories into canonical category preserving references', async () => {
    const { sqlite, db } = testDb
    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    await applyRepairPlan(db, fixture.userId, plan)

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
  })

  it('corrects account kinds with invalid values to cash', async () => {
    const { sqlite, db } = testDb
    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    await applyRepairPlan(db, fixture.userId, plan)

    expect(sqlite.prepare('SELECT kind FROM accounts WHERE id = ?').get(fixture.accountId)).toEqual(
      { kind: 'cash' },
    )
  })

  it('restores budget cells from clean export', async () => {
    const { sqlite, db } = testDb
    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    await applyRepairPlan(db, fixture.userId, plan)

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
  })

  it('restores missing wealth snapshots and account balances', async () => {
    const { sqlite, db } = testDb
    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    await applyRepairPlan(db, fixture.userId, plan)

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
  })

  it('is idempotent: re-evaluating repair plan on repaired database produces an empty plan', async () => {
    const { db } = testDb
    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    const report: RepairExecutionReport = await applyRepairPlan(db, fixture.userId, plan)
    expect(report.categoryMerges).toBe(1)
    expect(report.referencesRepointed).toBe(1)
    expect(report.accountsCorrected).toBe(1)

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
  })

  it('runs CLI in simulation mode by default leaving database untouched', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { openLocalV2Db } = await import('../../../../scripts/lib/migration-db')

    mkdirSync('.scratch', { recursive: true })
    const backupPath = resolve('.scratch/test-repair-backup-sim.json')
    const dbPath = resolve('.scratch/test-repair-db-sim.sqlite')

    writeFileSync(backupPath, JSON.stringify(REPAIR_FIXTURE_BACKUP), 'utf8')

    try {
      if (existsSync(dbPath)) rmSync(dbPath)

      const staging = openLocalV2Db(dbPath)
      const fixtureIds = seedRepairFixture({
        db: staging.db,
        sqlite: staging.sqlite,
        close: staging.close,
      })
      staging.close()

      const simResult = await runRepairCli([
        `--backup=${backupPath}`,
        `--v2-sqlite=${dbPath}`,
        `--user-id=${fixtureIds.userId}`,
      ])
      expect(simResult.executed).toBe(false)
      expect(simResult.plan.categoryMerges).toHaveLength(1)

      // Verify db is untouched
      const check = openLocalV2Db(dbPath)
      const catCount = check.sqlite
        .prepare('SELECT COUNT(*) as count FROM categories WHERE user_id = ?')
        .get(fixtureIds.userId) as { count: number }
      expect(catCount.count).toBe(2)
      check.close()
    } finally {
      if (existsSync(backupPath)) rmSync(backupPath)
      if (existsSync(dbPath)) rmSync(dbPath)
    }
  })

  it('runs CLI in execution mode when --execute is passed applying all repairs', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { openLocalV2Db } = await import('../../../../scripts/lib/migration-db')

    mkdirSync('.scratch', { recursive: true })
    const backupPath = resolve('.scratch/test-repair-backup-exec.json')
    const dbPath = resolve('.scratch/test-repair-db-exec.sqlite')

    writeFileSync(backupPath, JSON.stringify(REPAIR_FIXTURE_BACKUP), 'utf8')

    try {
      if (existsSync(dbPath)) rmSync(dbPath)

      const staging = openLocalV2Db(dbPath)
      const fixtureIds = seedRepairFixture({
        db: staging.db,
        sqlite: staging.sqlite,
        close: staging.close,
      })
      staging.close()

      const execResult = await runRepairCli([
        `--backup=${backupPath}`,
        `--v2-sqlite=${dbPath}`,
        `--user-id=${fixtureIds.userId}`,
        '--execute',
      ])
      expect(execResult.executed).toBe(true)

      // Verify db was repaired
      const check = openLocalV2Db(dbPath)
      const catCount = check.sqlite
        .prepare('SELECT COUNT(*) as count FROM categories WHERE user_id = ?')
        .get(fixtureIds.userId) as { count: number }
      expect(catCount.count).toBe(1)
      const accountKind = check.sqlite
        .prepare('SELECT kind FROM accounts WHERE id = ?')
        .get(fixtureIds.accountId) as { kind: string }
      expect(accountKind.kind).toBe('cash')
      check.close()
    } finally {
      if (existsSync(backupPath)) rmSync(backupPath)
      if (existsSync(dbPath)) rmSync(dbPath)
    }
  })
})
