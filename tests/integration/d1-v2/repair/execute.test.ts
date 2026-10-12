import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyRepairPlan,
  buildRepairPlan,
  formatRepairPlan,
  loadRepairBackup,
  repairPlanSql,
  writeRemoteRepairSql,
  type RepairExecutionReport,
  type RepairPlan,
} from '../../../../scripts/lib/repair-plan'
import { createTestDb, type TestDatabase } from '../setup'
import {
  REPAIR_FIXTURE_BACKUP,
  REPAIR_FIXTURE_COLLIDING_LEGACY_ID,
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
    expect(() => loadRepairBackup({ budgetCells: [{}], snapshots: [] })).toThrow(
      /export de respaldo/i,
    )
    expect(() =>
      loadRepairBackup({
        budgetCells: [],
        snapshots: [
          { year: 2025, month: 3, snapshotDate: '2025-03-01', balances: [{ balanceMinor: 1 }] },
        ],
      }),
    ).toThrow(/export de respaldo/i)
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

  it('restores the canonical cell when the duplicate category also had a cell', async () => {
    const { sqlite, db } = testDb
    const ts = '2026-09-13T00:00:00.000Z'

    // Replace the fixture's canonical cell with a sequence that forces the
    // duplicate's cell to be scanned first, so only an explicit preference for
    // the surviving canonical row can target it.
    sqlite.prepare('DELETE FROM budget_entries WHERE id = ?').run(fixture.budgetEntryId)
    sqlite
      .prepare(
        `INSERT INTO budget_entries
          (id, user_id, legacy_id, category_id, year, month, amount_minor, currency, created_at, updated_at, version)
         VALUES (?, ?, NULL, ?, 2025, 1, 999, 'EUR', ?, ?, 1)`,
      )
      .run('repair-budget-duplicate', fixture.userId, fixture.duplicateCategoryId, ts, ts)
    sqlite
      .prepare(
        `INSERT INTO budget_entries
          (id, user_id, legacy_id, category_id, year, month, amount_minor, currency, created_at, updated_at, version)
         VALUES (?, ?, NULL, ?, 2025, 1, 25000, 'EUR', ?, ?, 1)`,
      )
      .run('repair-budget-canonical', fixture.userId, fixture.migratedCategoryId, ts, ts)

    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    expect(plan.budgetRestorations[0]).toMatchObject({
      action: 'update',
      budgetEntryId: 'repair-budget-canonical',
      amountMinor: 10000,
    })

    const report = await applyRepairPlan(db, fixture.userId, plan)
    expect(report.budgetEntriesUpdated).toBe(1)
    expect(report.referencesRepointed).toBe(1)

    const canonicalCell = sqlite
      .prepare(
        `SELECT amount_minor FROM budget_entries
          WHERE category_id = ? AND year = 2025 AND month = 1`,
      )
      .get(fixture.migratedCategoryId)
    expect(canonicalCell).toEqual({ amount_minor: 10000 })
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
      .all(fixture.userId) as Array<{
      id: string
      snapshot_date: string
      year: number
      month: number
    }>
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
      .prepare(
        'SELECT account_id, balance_minor, currency FROM snapshot_balances WHERE snapshot_id = ?',
      )
      .all(snapshotRows[0].id)
    expect(balance2025).toEqual([
      {
        account_id: REPAIR_FIXTURE_IDS.account,
        balance_minor: 300000,
        currency: 'EUR',
      },
    ])
  })

  it('moves a colliding correlation id aside instead of dropping the row', async () => {
    const { db } = testDb
    const plan = await buildRepairPlan(db, fixture.userId, REPAIR_FIXTURE_BACKUP)

    expect(plan.correlationIdFixes).toEqual([
      {
        table: 'contributions',
        rowId: REPAIR_FIXTURE_IDS.contributionLate,
        fromLegacyId: REPAIR_FIXTURE_COLLIDING_LEGACY_ID,
        toLegacyId: `${REPAIR_FIXTURE_COLLIDING_LEGACY_ID}@2`,
      },
    ])

    const report: RepairExecutionReport = await applyRepairPlan(db, fixture.userId, plan)
    expect(report.correlationIdsRenamed).toBe(1)

    // Both rows survive with their own values: this is a reconciliation key
    // moving aside, not a delete.
    expect(
      testDb.sqlite
        .prepare('SELECT id, legacy_id FROM contributions WHERE user_id = ? ORDER BY id')
        .all(fixture.userId),
    ).toEqual([
      {
        id: REPAIR_FIXTURE_IDS.contributionEarly,
        legacy_id: REPAIR_FIXTURE_COLLIDING_LEGACY_ID,
      },
      {
        id: REPAIR_FIXTURE_IDS.contributionLate,
        legacy_id: `${REPAIR_FIXTURE_COLLIDING_LEGACY_ID}@2`,
      },
    ])

    // The point of the rename: the closing migration's UNIQUE can now be
    // created, which is what production is waiting on.
    expect(() =>
      testDb.sqlite.exec(
        'CREATE UNIQUE INDEX contributions_user_id_legacy_id_idx ON contributions (user_id, legacy_id)',
      ),
    ).not.toThrow()
  })

  /**
   * The user's rows with generated ids and timestamps left out, so a database
   * repaired by `applyRepairPlan` and one repaired by the emitted SQL compare
   * equal even though each generated its own ids for inserted rows.
   */
  function repairedState(target: TestDatabase) {
    const rows = (query: string) => target.sqlite.prepare(query).all(fixture.userId)
    return {
      categories: rows('SELECT id, legacy_id, name FROM categories WHERE user_id = ? ORDER BY id'),
      accounts: rows('SELECT id, kind FROM accounts WHERE user_id = ? ORDER BY id'),
      transactions: rows('SELECT id, category_id FROM transactions WHERE user_id = ? ORDER BY id'),
      budget: rows(
        `SELECT category_id, year, month, amount_minor, currency FROM budget_entries
          WHERE user_id = ? ORDER BY year, month, category_id`,
      ),
      snapshots: rows(
        `SELECT s.year, s.month, s.snapshot_date, b.account_id, b.balance_minor, b.currency
           FROM wealth_snapshots s LEFT JOIN snapshot_balances b ON b.snapshot_id = s.id
          WHERE s.user_id = ? ORDER BY s.year, s.month, b.account_id`,
      ),
      contributions: rows('SELECT id, legacy_id FROM contributions WHERE user_id = ? ORDER BY id'),
    }
  }

  /**
   * Applies `plan` locally and, separately, replays its emitted SQL onto a
   * database seeded with the same corruption; both must end up identical.
   */
  async function expectSqlMatchesApply(
    plan: RepairPlan,
    corrupt: (target: TestDatabase) => void = () => {},
  ): Promise<string> {
    const statements = repairPlanSql(fixture.userId, plan)
    await applyRepairPlan(testDb.db, fixture.userId, plan)

    const replay = createTestDb()
    try {
      seedRepairFixture(replay)
      corrupt(replay)
      replay.sqlite.exec(statements.join('\n'))
      expect(repairedState(replay)).toEqual(repairedState(testDb))
    } finally {
      replay.close()
    }
    return statements.join('\n')
  }

  it('emits SQL that reproduces the applied repair', async () => {
    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    await expectSqlMatchesApply(plan)
  })

  it('emits only the statements the plan changes', async () => {
    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    const sql = repairPlanSql(fixture.userId, plan).join('\n')

    // No table dumps: the rows the plan never touches stay out of the file.
    expect(sql).not.toMatch(/DELETE FROM \w+ WHERE user_id = '[^']*';/)
    expect(sql).not.toContain('INSERT INTO transactions')
    expect(sql).not.toContain('INSERT INTO contributions')
    // References are repointed before the duplicate they pointed at goes away.
    expect(sql.indexOf('UPDATE transactions SET category_id')).toBeLessThan(
      sql.indexOf('DELETE FROM categories'),
    )
    // The change log and the revision cursor stay out of it: deleting them
    // would make every other device miss the repair.
    expect(sql).not.toContain('sync_changes')
    expect(sql).not.toContain('user_revisions')
  })

  it('emits SQL that aborts when a planned budget cell no longer exists', async () => {
    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    testDb.sqlite.prepare('DELETE FROM budget_entries WHERE id = ?').run(fixture.budgetEntryId)

    expect(() => testDb.sqlite.exec(repairPlanSql(fixture.userId, plan).join('\n'))).toThrow(
      /malformed JSON/,
    )
  })

  it('emits SQL that rewrites an existing snapshot and its balances', async () => {
    const corrupt = (target: TestDatabase) =>
      target.sqlite
        .prepare('UPDATE snapshot_balances SET balance_minor = 1 WHERE id = ?')
        .run(REPAIR_FIXTURE_IDS.snapshotBalance)
    corrupt(testDb)

    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    expect(plan.snapshotRestorations).toContainEqual(
      expect.objectContaining({ action: 'update', snapshotId: REPAIR_FIXTURE_IDS.snapshot }),
    )
    await expectSqlMatchesApply(plan, corrupt)
  })

  it('emits SQL that updates a budget cell located by key when the plan has no id', async () => {
    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    for (const cell of plan.budgetRestorations) delete cell.budgetEntryId
    expect(plan.budgetRestorations.some((cell) => cell.action === 'update')).toBe(true)

    await expectSqlMatchesApply(plan)
  })

  it('writes the emitted statements to the --remote-sql-out file', async () => {
    const { mkdirSync, readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')

    const plan = await buildRepairPlan(testDb.db, fixture.userId, REPAIR_FIXTURE_BACKUP)
    mkdirSync('.scratch', { recursive: true })
    const outPath = resolve('.scratch/test-repair-remote.sql')
    const count = writeRemoteRepairSql(fixture.userId, plan, outPath)

    const lines = readFileSync(outPath, 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('--'))
    expect(lines).toHaveLength(count)
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
      correlationIdFixes: [],
    })
  })

  it('demands a backup export via CLI before execution', async () => {
    await expect(runRepairCli(['--execute'])).rejects.toThrow(/export de respaldo/i)
  })

  it('runs CLI in simulation mode by default leaving database untouched', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { openLocalV2Db } = await import('../../../../scripts/lib/local-v2-db')

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

  it('keeps stdout as a single JSON document when --json is passed', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { openLocalV2Db } = await import('../../../../scripts/lib/local-v2-db')

    mkdirSync('.scratch', { recursive: true })
    const backupPath = resolve('.scratch/test-repair-backup-json.json')
    const dbPath = resolve('.scratch/test-repair-db-json.sqlite')
    writeFileSync(backupPath, JSON.stringify(REPAIR_FIXTURE_BACKUP), 'utf8')

    const stdout: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout.push(args.map(String).join(' '))
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      if (existsSync(dbPath)) rmSync(dbPath)

      const staging = openLocalV2Db(dbPath)
      const fixtureIds = seedRepairFixture({
        db: staging.db,
        sqlite: staging.sqlite,
        close: staging.close,
      })
      staging.close()

      const result = await runRepairCli([
        `--backup=${backupPath}`,
        `--v2-sqlite=${dbPath}`,
        `--user-id=${fixtureIds.userId}`,
        '--json',
      ])
      expect(result.executed).toBe(false)
    } finally {
      logSpy.mockRestore()
      errorSpy.mockRestore()
      if (existsSync(backupPath)) rmSync(backupPath)
      if (existsSync(dbPath)) rmSync(dbPath)
    }

    expect(stdout).toHaveLength(1)
    const parsed = JSON.parse(stdout.join('\n')) as { simulation: boolean }
    expect(parsed.simulation).toBe(true)
  })

  it('runs CLI in execution mode when --execute is passed applying all repairs', async () => {
    const { mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { openLocalV2Db } = await import('../../../../scripts/lib/local-v2-db')

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
