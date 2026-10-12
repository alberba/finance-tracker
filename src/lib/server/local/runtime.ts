import Database from 'better-sqlite3'
import { createSqliteBinding } from './sqlite-binding'
import type { RuntimeEnv } from '../cloudflare-env'

const sqlite = new Database(process.env.SQLITE_PATH ?? '.data/finance.sqlite')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
const binding = createSqliteBinding(sqlite)

export const env: RuntimeEnv = {
  ...process.env,
  finance_tracker_db_v2: binding,
}
