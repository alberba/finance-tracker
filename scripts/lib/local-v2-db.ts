/**
 * Opens a persistent local v2 SQLite database with the v2 schema available to
 * the repair tooling.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from '../../src/db/schema'

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations-v2')

function readMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8'))
}

/** Mirrors `tests/integration/d1-v2/setup.ts`'s statement splitting. */
function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

export type V2Db = BetterSQLite3Database<typeof schema>

export interface LocalV2Database {
  db: V2Db
  sqlite: Database.Database
  close: () => void
}

/** Opens a persistent local v2 SQLite file, applying v2 migrations when new. */
export function openLocalV2Db(path: string): LocalV2Database {
  const isNew = !existsSync(path)
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  if (isNew) {
    for (const migration of readMigrationFiles()) {
      for (const statement of splitStatements(migration)) {
        sqlite.exec(statement)
      }
    }
  }
  const db = drizzle(sqlite, { schema })
  return { db, sqlite, close: () => sqlite.close() }
}
