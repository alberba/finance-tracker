import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyPassword } from 'better-auth/crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { findLocalD1, setLocalAccount } from '../../scripts/dev-account.mjs'
import { migrateLocalDatabase } from '../../scripts/local-init.mjs'

let sqlite: Database.Database | undefined
let folder: string | undefined
afterEach(() => {
  sqlite?.close()
  if (folder) rmSync(folder, { recursive: true, force: true })
  sqlite = folder = undefined
})

function database() {
  sqlite = new Database(':memory:')
  migrateLocalDatabase(sqlite)
  return sqlite
}

function credential(db: Database.Database, email: string) {
  return db
    .prepare(
      "SELECT a.password FROM auth_account a JOIN auth_user u ON u.id = a.user_id WHERE u.email = ? AND a.provider_id = 'credential'",
    )
    .all(email) as Array<{ password: string }>
}

describe('setLocalAccount', () => {
  it('creates an admitted, verified account that signs in with the password', async () => {
    const db = database()
    expect(await setLocalAccount(db, ' Yo@Ejemplo.test ', 'una-clave-larga')).toBe('created')
    const user = db.prepare('SELECT id, email_verified FROM auth_user').get() as {
      id: string
      email_verified: number
    }
    expect(user.email_verified).toBe(1)
    expect(db.prepare('SELECT user_id FROM auth_admission').get()).toEqual({ user_id: user.id })
    const [row] = credential(db, 'yo@ejemplo.test')
    expect(await verifyPassword({ hash: row.password, password: 'una-clave-larga' })).toBe(true)
  })

  it('sets a new password on an existing account instead of creating another', async () => {
    const db = database()
    await setLocalAccount(db, 'yo@ejemplo.test', 'una-clave-larga')
    expect(await setLocalAccount(db, 'yo@ejemplo.test', 'otra-clave-larga')).toBe('updated')
    const rows = credential(db, 'yo@ejemplo.test')
    expect(rows).toHaveLength(1)
    expect(await verifyPassword({ hash: rows[0].password, password: 'otra-clave-larga' })).toBe(
      true,
    )
  })

  it('adds a password to an account that only had a provider login', async () => {
    const db = database()
    await setLocalAccount(db, 'yo@ejemplo.test', 'una-clave-larga')
    db.prepare("DELETE FROM auth_account WHERE provider_id = 'credential'").run()
    await setLocalAccount(db, 'yo@ejemplo.test', 'otra-clave-larga')
    expect(credential(db, 'yo@ejemplo.test')).toHaveLength(1)
  })
})

describe('findLocalD1', () => {
  it('picks the miniflare file that holds the auth tables', () => {
    folder = mkdtempSync(join(tmpdir(), 'dev-account-'))
    mkdirSync(folder, { recursive: true })
    new Database(join(folder, 'metadata.sqlite')).close()
    new Database(join(folder, 'other.sqlite')).close()
    const d1 = new Database(join(folder, 'app.sqlite'))
    migrateLocalDatabase(d1)
    d1.close()
    writeFileSync(join(folder, 'notes.txt'), '')
    expect(findLocalD1(folder)).toBe(join(folder, 'app.sqlite'))
  })

  it('returns null without a local D1', () => {
    expect(findLocalD1(join(tmpdir(), 'no-such-d1-folder'))).toBeNull()
  })
})
