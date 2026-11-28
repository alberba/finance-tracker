import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hashPassword } from 'better-auth/crypto'
import { upsertEnvVar } from './dev-worktree.mjs'
import { provisionLocalAdministrator } from './local-init.mjs'

// `bun run dev:account <correo> [export.json]`: una cuenta con contraseña en la D1 local de
// `bun run dev`, y opcionalmente los datos de un export JSON de la aplicación (Datos → Exportar).
// Sirve para probar en local con los datos propios sin tocar producción.

const D1_FOLDER = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
const PASSWORD_FILE = '.data/dev-account-password'

/** The local D1 file: the one SQLite file of miniflare that holds the auth tables. */
export function findLocalD1(folder = D1_FOLDER) {
  if (!existsSync(folder)) return null
  for (const name of readdirSync(folder)) {
    if (!name.endsWith('.sqlite') || name === 'metadata.sqlite') continue
    const sqlite = new Database(resolve(folder, name), { readonly: true })
    try {
      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_user'")
        .get()
      if (table) return resolve(folder, name)
    } finally {
      sqlite.close()
    }
  }
  return null
}

/**
 * Leaves `email` able to sign in with `password`: creates the admitted, verified account when it is
 * new, and otherwise sets the password of the existing one.
 */
export async function setLocalAccount(sqlite, email, password) {
  email = email.trim().toLowerCase()
  const user = sqlite.prepare('SELECT id FROM auth_user WHERE email = ?').get(email)
  if (!user) {
    await provisionLocalAdministrator(sqlite, email, password)
    return 'created'
  }
  const hash = await hashPassword(password)
  const now = Date.now()
  const updated = sqlite
    .prepare(
      "UPDATE auth_account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'",
    )
    .run(hash, now, user.id)
  if (updated.changes === 0) {
    sqlite
      .prepare(
        "INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (lower(hex(randomblob(16))), ?, 'credential', ?, ?, ?, ?)",
      )
      .run(user.id, user.id, hash, now, now)
  }
  return 'updated'
}

function readPassword() {
  if (existsSync(PASSWORD_FILE)) {
    const saved = readFileSync(PASSWORD_FILE, 'utf8').trim()
    if (saved.length >= 12) return saved
  }
  const password = randomBytes(18).toString('base64url')
  mkdirSync('.data', { recursive: true })
  writeFileSync(PASSWORD_FILE, `${password}\n`, { mode: 0o600 })
  chmodSync(PASSWORD_FILE, 0o600)
  return password
}

/** Better Auth needs a secret; `.dev.vars` copied from an older checkout may not carry one. */
function ensureAuthSecret() {
  if (!existsSync('.dev.vars')) throw new Error('Falta .dev.vars: ejecuta bun run setup:worktree.')
  const current = readFileSync('.dev.vars', 'utf8')
  if (/^BETTER_AUTH_SECRET=.+$/m.test(current)) return false
  const secret = randomBytes(32).toString('base64')
  writeFileSync('.dev.vars', upsertEnvVar(current, 'BETTER_AUTH_SECRET', secret))
  return true
}

function serverOrigin() {
  const url = readFileSync('.dev.vars', 'utf8').match(/^BETTER_AUTH_URL=(.+)$/m)?.[1]
  return new URL(url ?? 'http://localhost:4321').origin
}

async function importExport(origin, email, password, file) {
  const headers = { 'Content-Type': 'application/json', Origin: origin }
  let signIn
  try {
    signIn = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new Error(`No responde ${origin}: arranca bun run dev:worktree y vuelve a ejecutarlo.`)
  }
  if (!signIn.ok) throw new Error(`El inicio de sesión falló (${signIn.status}).`)
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  const response = await fetch(`${origin}/api/data/import?mode=replace`, {
    method: 'POST',
    headers: { ...headers, Cookie: cookie },
    body: readFileSync(file),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`La importación falló (${response.status}).`)
  return result
}

async function run([email, file]) {
  if (!email) throw new Error('Uso: bun run dev:account <correo> [export.json]')
  if (file && !existsSync(file)) throw new Error(`No existe ${file}.`)
  const secretAdded = ensureAuthSecret()
  const path = findLocalD1()
  if (!path) throw new Error('No hay D1 local: ejecuta bun run setup:worktree.')
  const password = readPassword()
  const sqlite = new Database(path)
  let outcome
  try {
    outcome = await setLocalAccount(sqlite, email, password)
  } finally {
    sqlite.close()
  }
  console.log(`Cuenta ${outcome === 'created' ? 'creada' : 'actualizada'}: ${email}`)
  console.log(`Contraseña (en ${PASSWORD_FILE}): ${password}`)
  if (secretAdded) {
    console.log('Añadido BETTER_AUTH_SECRET a .dev.vars: reinicia el servidor de desarrollo.')
    if (file) console.log('Después, vuelve a ejecutar este comando para importar los datos.')
    return
  }
  if (!file) return
  const { imported = {}, skipped = {} } = await importExport(serverOrigin(), email, password, file)
  const list = (counts) =>
    Object.entries(counts)
      .map(([key, count]) => `${key} ${count}`)
      .join(', ') || 'nada'
  console.log(`Importado (sustituye los datos de la cuenta): ${list(imported)}`)
  if (Object.keys(skipped).length) console.log(`Omitido: ${list(skipped)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
