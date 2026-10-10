import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'

export function migrateLocalDatabase(sqlite, directory = resolve('migrations-v2')) {
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)')
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name)) continue
    sqlite.transaction(() => {
      sqlite.exec(readFileSync(resolve(directory, name), 'utf8'))
      sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(name)
    })()
  }
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)',
  )
}

export async function provisionLocalAdministrator(sqlite, email, password) {
  if (!email || !password || password.length < 12) {
    throw new Error(
      'LOCAL_ADMIN_EMAIL y LOCAL_ADMIN_PASSWORD (mínimo 12 caracteres) son obligatorios.',
    )
  }
  email = email.trim().toLowerCase()
  if (sqlite.prepare('SELECT id FROM auth_user WHERE email = ?').get(email)) return
  const hash = await hashPassword(password)
  const id = randomUUID()
  const now = Date.now()
  sqlite.transaction(() => {
    sqlite
      .prepare(
        'INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        id,
        email,
        'Administrador local',
        new Date(now).toISOString(),
        new Date(now).toISOString(),
      )
    sqlite
      .prepare(
        'INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
      )
      .run(id, 'Administrador local', email, now, now)
    sqlite
      .prepare(
        'INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(randomUUID(), id, 'credential', id, hash, now, now)
    sqlite.prepare('INSERT INTO auth_admission (user_id, created_at) VALUES (?, ?)').run(id, now)
    sqlite.prepare('INSERT INTO auth_role (user_id, role) VALUES (?, ?)').run(id, 'admin')
  })()
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/local-init.mjs')) {
  const path = process.env.SQLITE_PATH ?? '.data/finance.sqlite'
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  try {
    migrateLocalDatabase(sqlite)
    await provisionLocalAdministrator(
      sqlite,
      process.env.LOCAL_ADMIN_EMAIL,
      process.env.LOCAL_ADMIN_PASSWORD,
    )
    console.log('Base de datos local preparada.')
  } finally {
    sqlite.close()
  }
}
