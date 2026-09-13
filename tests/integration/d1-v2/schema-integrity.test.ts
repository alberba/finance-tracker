import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedAccount, seedCategory, seedUser } from './repositories/fixtures'
import { createTestDb, type TestDatabase } from './setup'

type Sqlite = TestDatabase['sqlite']

const NOW = '2026-09-13T00:00:00.000Z'

/**
 * These checks are deliberately marked as expected failures until #149 lands.
 * They keep the intended `0003` contract executable while the repair in #148
 * is still allowed to run against the duplicate rows from #155. Once the
 * closing migration is applied, remove `.fails` from each check: a passing
 * expected-failure is then a signal that the guard can be promoted to a normal
 * green assertion.
 */

function hasUniqueIndex(sqlite: Sqlite, table: string, columns: readonly string[]): boolean {
  const indexes = sqlite.prepare(`PRAGMA index_list(${table})`).all() as Array<{
    name: string
    unique: number
  }>
  return indexes.some((index) => {
    if (index.unique !== 1) {
      return false
    }
    const indexColumns = sqlite.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{
      seqno: number
      name: string
    }>
    return indexColumns.map((column) => column.name).join('\u0000') === columns.join('\u0000')
  })
}

function insertCategory(
  sqlite: Sqlite,
  values: { id: string; userId: string; legacyId: string },
): void {
  sqlite
    .prepare(
      `INSERT INTO categories
        (id, user_id, legacy_id, name, kind, sort_order, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(values.id, values.userId, values.legacyId, 'Comida', 'expense', 0, NOW, NOW, 1)
}

function insertBudget(
  sqlite: Sqlite,
  values: { id: string; userId: string; categoryId: string },
): void {
  sqlite
    .prepare(
      `INSERT INTO budget_entries
        (id, user_id, legacy_id, category_id, year, month, amount_minor, currency,
         created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(values.id, values.userId, null, values.categoryId, 2026, 3, 1000, 'EUR', NOW, NOW, 1)
}

function insertSnapshot(sqlite: Sqlite, values: { id: string; userId: string }): void {
  sqlite
    .prepare(
      `INSERT INTO wealth_snapshots
        (id, user_id, legacy_id, snapshot_date, year, month, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(values.id, values.userId, null, '2026-03-31', 2026, 3, NOW, NOW, 1)
}

function insertTransaction(
  sqlite: Sqlite,
  values: { id: string; userId: string; accountId: string; categoryId?: string },
): void {
  sqlite
    .prepare(
      `INSERT INTO transactions
        (id, user_id, legacy_id, account_id, category_id, type, date, description,
         amount_minor, currency, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.id,
      values.userId,
      null,
      values.accountId,
      values.categoryId ?? null,
      'expense',
      '2026-03-15',
      'Schema test',
      1000,
      'EUR',
      NOW,
      NOW,
      1,
    )
}

describe('v2 schema integrity contract', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  it('applies the complete v2 migration set before integrity checks run', () => {
    const tables = (
      testDb.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name)

    expect(tables).toContain('users')
    expect(tables).toContain('budget_entries')
    expect(tables).toContain('wealth_snapshots')
    expect(tables).toContain('snapshot_balances')
  })

  it.fails('declares every natural and migration-correlation key as UNIQUE', () => {
    const expectedUniqueKeys: Array<[string, readonly string[]]> = [
      ['user_identities', ['provider', 'subject']],
      ['accounts', ['user_id', 'legacy_id']],
      ['categories', ['user_id', 'legacy_id']],
      ['twr_liquidity_accounts', ['user_id', 'legacy_id']],
      ['transactions', ['user_id', 'legacy_id']],
      ['subscriptions', ['user_id', 'legacy_id']],
      ['recurring_rules', ['user_id', 'legacy_id']],
      ['pending_movements', ['user_id', 'legacy_id']],
      ['budget_entries', ['user_id', 'legacy_id']],
      ['budget_entries', ['user_id', 'category_id', 'year', 'month']],
      ['goals', ['user_id', 'legacy_id']],
      ['goals', ['user_id', 'key']],
      ['wealth_snapshots', ['user_id', 'legacy_id']],
      ['wealth_snapshots', ['user_id', 'year', 'month']],
      ['contributions', ['user_id', 'legacy_id']],
      ['integration_credentials', ['user_id', 'provider']],
      ['stockevents_symbol_mappings', ['user_id', 'legacy_id']],
      ['stockevents_symbol_mappings', ['user_id', 'stockevents_symbol']],
      ['user_instruments', ['user_id', 'instrument_id']],
      ['market_instruments', ['provider', 'normalized_symbol']],
    ]

    for (const [table, columns] of expectedUniqueKeys) {
      expect(
        hasUniqueIndex(testDb.sqlite, table, columns),
        `${table} should have a UNIQUE index on (${columns.join(', ')})`,
      ).toBe(true)
    }
  })

  it.fails('rejects a duplicate migration identity for one user', async () => {
    const user = await seedUser(testDb.db)
    insertCategory(testDb.sqlite, {
      id: 'category-correlation-one',
      userId: user.id,
      legacyId: 'expense:Comida',
    })

    expect(() =>
      insertCategory(testDb.sqlite, {
        id: 'category-correlation-two',
        userId: user.id,
        legacyId: 'expense:Comida',
      }),
    ).toThrow(/unique/i)
  })

  it.fails('rejects two budget entries for the same category, year and month', async () => {
    const user = await seedUser(testDb.db)
    const category = await seedCategory(testDb.db, user.id)
    insertBudget(testDb.sqlite, {
      id: 'budget-natural-one',
      userId: user.id,
      categoryId: category.id,
    })

    expect(() =>
      insertBudget(testDb.sqlite, {
        id: 'budget-natural-two',
        userId: user.id,
        categoryId: category.id,
      }),
    ).toThrow(/unique/i)
  })

  it.fails('rejects two wealth snapshots for the same year and month', async () => {
    const user = await seedUser(testDb.db)
    insertSnapshot(testDb.sqlite, { id: 'snapshot-natural-one', userId: user.id })

    expect(() =>
      insertSnapshot(testDb.sqlite, { id: 'snapshot-natural-two', userId: user.id }),
    ).toThrow(/unique/i)
  })

  it.fails('cascades an investment operation when its movement is deleted', async () => {
    const user = await seedUser(testDb.db)
    const account = await seedAccount(testDb.db, user.id)
    insertTransaction(testDb.sqlite, {
      id: 'transaction-cascade',
      userId: user.id,
      accountId: account.id,
    })
    testDb.sqlite
      .prepare(
        `INSERT INTO investment_trade_details
          (id, user_id, transaction_id, instrument_id, side, quantity, price_minor,
           fee_minor, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'trade-detail-cascade',
        user.id,
        'transaction-cascade',
        null,
        'buy',
        '1',
        1000,
        0,
        'EUR',
        NOW,
        NOW,
      )

    expect(() =>
      testDb.sqlite.prepare('DELETE FROM transactions WHERE id = ?').run('transaction-cascade'),
    ).not.toThrow()
    expect(
      testDb.sqlite
        .prepare('SELECT COUNT(*) AS count FROM investment_trade_details WHERE transaction_id = ?')
        .get('transaction-cascade'),
    ).toEqual({ count: 0 })
  })

  it.fails('cascades snapshot balances when their wealth snapshot is deleted', async () => {
    const user = await seedUser(testDb.db)
    const account = await seedAccount(testDb.db, user.id)
    insertSnapshot(testDb.sqlite, { id: 'snapshot-cascade', userId: user.id })
    testDb.sqlite
      .prepare(
        `INSERT INTO snapshot_balances
          (id, user_id, snapshot_id, account_id, balance_minor, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('snapshot-balance-cascade', user.id, 'snapshot-cascade', account.id, 1000, 'EUR', NOW)

    expect(() =>
      testDb.sqlite.prepare('DELETE FROM wealth_snapshots WHERE id = ?').run('snapshot-cascade'),
    ).not.toThrow()
    expect(
      testDb.sqlite
        .prepare('SELECT COUNT(*) AS count FROM snapshot_balances WHERE snapshot_id = ?')
        .get('snapshot-cascade'),
    ).toEqual({ count: 0 })
  })

  it.fails('cascades contribution allocations when their contribution is deleted', async () => {
    const user = await seedUser(testDb.db)
    const account = await seedAccount(testDb.db, user.id)
    testDb.sqlite
      .prepare(
        `INSERT INTO contributions
          (id, user_id, legacy_id, date, amount_minor, currency, portfolio_date,
           portfolio_value_minor, flow_minor, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'contribution-cascade',
        user.id,
        null,
        '2026-03-01',
        1000,
        'EUR',
        null,
        null,
        null,
        NOW,
        NOW,
        1,
      )
    testDb.sqlite
      .prepare(
        `INSERT INTO contribution_allocations
          (id, user_id, contribution_id, account_id, amount_minor, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('allocation-cascade', user.id, 'contribution-cascade', account.id, 1000, 'EUR', NOW)

    expect(() =>
      testDb.sqlite.prepare('DELETE FROM contributions WHERE id = ?').run('contribution-cascade'),
    ).not.toThrow()
    expect(
      testDb.sqlite
        .prepare('SELECT COUNT(*) AS count FROM contribution_allocations WHERE contribution_id = ?')
        .get('contribution-cascade'),
    ).toEqual({ count: 0 })
  })

  it.fails('cascades pending movements when their recurring rule is deleted', async () => {
    const user = await seedUser(testDb.db)
    const account = await seedAccount(testDb.db, user.id)
    testDb.sqlite
      .prepare(
        `INSERT INTO recurring_rules
          (id, user_id, legacy_id, name, type, account_id, category_id, amount_minor,
           currency, frequency, next_run_date, status, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'rule-cascade',
        user.id,
        null,
        'Regla',
        'expense',
        account.id,
        null,
        1000,
        'EUR',
        'monthly',
        '2026-04-01',
        'active',
        NOW,
        NOW,
        1,
      )
    testDb.sqlite
      .prepare(
        `INSERT INTO pending_movements
          (id, user_id, legacy_id, recurring_rule_id, account_id, category_id,
           amount_minor, currency, due_date, status, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'pending-cascade',
        user.id,
        null,
        'rule-cascade',
        account.id,
        null,
        1000,
        'EUR',
        '2026-04-01',
        'pending',
        NOW,
        NOW,
        1,
      )

    expect(() =>
      testDb.sqlite.prepare('DELETE FROM recurring_rules WHERE id = ?').run('rule-cascade'),
    ).not.toThrow()
    expect(
      testDb.sqlite
        .prepare('SELECT COUNT(*) AS count FROM pending_movements WHERE recurring_rule_id = ?')
        .get('rule-cascade'),
    ).toEqual({ count: 0 })
  })

  it('does not cascade-delete independent category references', async () => {
    const user = await seedUser(testDb.db)
    const account = await seedAccount(testDb.db, user.id)
    const category = await seedCategory(testDb.db, user.id)
    insertTransaction(testDb.sqlite, {
      id: 'transaction-independent-reference',
      userId: user.id,
      accountId: account.id,
      categoryId: category.id,
    })

    expect(() =>
      testDb.sqlite.prepare('DELETE FROM categories WHERE id = ?').run(category.id),
    ).toThrow(/foreign key/i)
    expect(
      testDb.sqlite
        .prepare('SELECT COUNT(*) AS count FROM transactions WHERE id = ?')
        .get('transaction-independent-reference'),
    ).toEqual({ count: 1 })
  })
})
