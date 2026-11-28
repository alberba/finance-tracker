import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations-v2')
const SETUP = '0020_onboarding_setup.sql'
const NOW = '2026-11-28T00:00:00.000Z'

function run(sqlite: Database.Database, file: string): void {
  readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .forEach((statement) => sqlite.exec(statement))
}

function seedUser(sqlite: Database.Database, id: string, withAccount: boolean): void {
  sqlite
    .prepare('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, `${id}@example.com`, NOW, NOW)
  sqlite
    .prepare(
      `INSERT INTO user_settings (id, user_id, currency, created_at, updated_at, version)
       VALUES (?, ?, 'EUR', ?, ?, 1)`,
    )
    .run(`${id}-settings`, id, NOW, NOW)
  if (!withAccount) return
  sqlite
    .prepare(
      `INSERT INTO accounts (id, user_id, name, kind, currency, opening_balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Cuenta', 'cash', 'EUR', 0, ?, ?, 1)`,
    )
    .run(`${id}-account`, id, NOW, NOW)
}

describe(SETUP, () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort()
    for (const file of files.filter((name) => name < SETUP)) run(sqlite, file)
    seedUser(sqlite, 'with-account', true)
    seedUser(sqlite, 'without-account', false)
    run(sqlite, SETUP)
  })

  afterEach(() => sqlite.close())

  it('marks the wizard as done for whoever already has an account, and only them', () => {
    const rows = sqlite
      .prepare(
        `SELECT user_id, onboarding_presented, onboarding_completed, onboarding_step
         FROM user_settings ORDER BY user_id`,
      )
      .all()
    expect(rows).toEqual([
      {
        user_id: 'with-account',
        onboarding_presented: 1,
        onboarding_completed: 1,
        onboarding_step: 0,
      },
      {
        user_id: 'without-account',
        onboarding_presented: 0,
        onboarding_completed: 0,
        onboarding_step: 0,
      },
    ])
  })
})
