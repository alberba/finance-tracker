import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

import { runWithDb } from '../../../../src/db/database'
import { getByUserAndNumber } from '../../../../src/db/repositories/issue-reports'
import * as schema from '../../../../src/db/schema'

it('keeps reports created before migration 0023 readable by their original owner', async () => {
  const sqlite = new Database(':memory:')
  const folder = resolve('migrations-v2')
  const migration = '0023_private_report_diagnostics.sql'
  const apply = (file: string) => sqlite.exec(readFileSync(resolve(folder, file), 'utf8'))
  const now = '2026-08-01T00:00:00.000Z'

  try {
    sqlite.pragma('foreign_keys = ON')
    for (const file of readdirSync(folder)
      .filter((name) => name.endsWith('.sql') && name < migration)
      .sort()) {
      apply(file)
    }
    sqlite
      .prepare('insert into users (id, email, created_at, updated_at) values (?, ?, ?, ?)')
      .run('owner', 'owner@example.test', now, now)
    sqlite
      .prepare(
        'insert into issue_reports (id, user_id, issue_number, submitted_at, last_seen_at, original_body) values (?, ?, ?, ?, ?, ?)',
      )
      .run('legacy', 'owner', 42, now, now, 'Legacy description')
    apply(migration)

    const db = drizzle(sqlite, { schema })
    const result = await runWithDb(db, getByUserAndNumber('owner', 42))
    expect(result).toMatchObject({
      issueNumber: 42,
      lastSeenAt: now,
      originalBody: 'Legacy description',
      privateTitle: null,
      caseReference: null,
    })
  } finally {
    sqlite.close()
  }
})
