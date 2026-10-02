import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations-v2')
const MONTHS = '0003_months_canonical.sql'
const CLOSING = '0004_close_schema.sql'
const NOW = '2026-09-13T00:00:00.000Z'
const USER = 'months-user'
const CATEGORY = 'months-category'

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

/** Mirrors `tests/integration/d1-v2/setup.ts`'s statement splitting. */
function statements(file: string): string[] {
  return readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function run(sqlite: Database.Database, file: string): void {
  for (const statement of statements(file)) sqlite.exec(statement)
}

/**
 * Applies the migration set minus `excluded`, so a test can put one migration
 * on either side of a data change and pin down the order the two need.
 */
function applyAllExcept(sqlite: Database.Database, excluded: readonly string[]): void {
  for (const file of migrationFiles()) {
    if (excluded.includes(file)) continue
    run(sqlite, file)
  }
}

/**
 * A year written the way production holds it today: 0-based months, one budget
 * cell per month and eight monthly snapshots.
 */
function seedLegacyMonths(sqlite: Database.Database): void {
  sqlite
    .prepare('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(USER, 'months@example.com', NOW, NOW)
  sqlite
    .prepare(
      `INSERT INTO categories (id, user_id, legacy_id, name, kind, sort_order, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)`,
    )
    .run(CATEGORY, USER, 'Comida', 'Comida', 'expense', NOW, NOW)
  for (let month = 0; month < 12; month += 1) {
    sqlite
      .prepare(
        `INSERT INTO budget_entries (id, user_id, legacy_id, category_id, year, month, amount_minor, currency, created_at, updated_at, version)
         VALUES (?, ?, NULL, ?, 2026, ?, ?, 'EUR', ?, ?, 1)`,
      )
      .run(`months-budget-${month}`, USER, CATEGORY, month, 10000 + month, NOW, NOW)
  }
  for (let month = 0; month < 8; month += 1) {
    sqlite
      .prepare(
        `INSERT INTO wealth_snapshots (id, user_id, legacy_id, snapshot_date, year, month, created_at, updated_at, version)
         VALUES (?, ?, NULL, ?, 2026, ?, ?, ?, 1)`,
      )
      .run(
        `months-snapshot-${month}`,
        USER,
        `2026-${String(month + 1).padStart(2, '0')}-01`,
        month,
        NOW,
        NOW,
      )
  }
}

describe('0003_months_canonical', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
  })

  afterEach(() => {
    sqlite.close()
  })

  it("shifts every stored month from v1's 0-11 to the canonical 1-12", () => {
    applyAllExcept(sqlite, [MONTHS, CLOSING])
    seedLegacyMonths(sqlite)

    run(sqlite, MONTHS)

    expect(
      sqlite.prepare('SELECT MIN(month) AS min, MAX(month) AS max FROM budget_entries').get(),
    ).toEqual({ min: 1, max: 12 })
    expect(
      sqlite.prepare('SELECT MIN(month) AS min, MAX(month) AS max FROM wealth_snapshots').get(),
    ).toEqual({ min: 1, max: 8 })
    // Injective, so it can neither invent nor lose a row.
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM budget_entries').get()).toEqual({ n: 12 })
    expect(
      sqlite
        .prepare(
          `SELECT month, snapshot_date FROM wealth_snapshots WHERE id = 'months-snapshot-7'`,
        )
        .get(),
    ).toEqual({ month: 8, snapshot_date: '2026-08-01' })
  })

  it('lets the closing migration create its UNIQUE indexes afterwards', () => {
    applyAllExcept(sqlite, [MONTHS, CLOSING])
    seedLegacyMonths(sqlite)
    run(sqlite, MONTHS)

    expect(() => run(sqlite, CLOSING)).not.toThrow()
  })

  it('has to run first: the closing UNIQUE indexes reject the shift', () => {
    applyAllExcept(sqlite, [MONTHS])
    seedLegacyMonths(sqlite)

    // The closing migration on its own is happy with 0-based months: it even
    // got as far as creating the index the shift will trip over.
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'budget_entries_user_id_category_year_month_idx'",
        )
        .get(),
    ).toEqual({ n: 1 })

    // Normalising afterwards is what fails: every destination month is already
    // occupied by the cell one month later.
    expect(() => run(sqlite, MONTHS)).toThrow(/unique/i)
  })
})
