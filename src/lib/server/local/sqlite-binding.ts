import Database from 'better-sqlite3'
import { AsyncLocalStorage } from 'node:async_hooks'
import { interactiveTransaction } from '../../../db/transaction-capability'

type Parameter = string | number | bigint | Buffer | null

/** The SQL boundary consumed by Drizzle's async D1 driver. */
class SqliteStatement {
  #connection: SqliteConnection
  #sql: string
  #parameters: Parameter[]

  constructor(connection: SqliteConnection, sql: string, parameters: Parameter[] = []) {
    this.#connection = connection
    this.#sql = sql
    this.#parameters = parameters
  }

  static async batch(connection: SqliteConnection, statements: SqliteStatement[]) {
    if (statements.some((statement) => statement.#connection !== connection)) {
      throw new Error('SQLite batch statements must belong to its connection.')
    }
    return connection.access(() =>
      connection.sqlite.transaction(() => statements.map((statement) => statement.#execute()))(),
    )
  }

  bind(...values: unknown[]): SqliteStatement {
    const parameters = values.map((value): Parameter => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'bigint' ||
        Buffer.isBuffer(value)
      )
        return value
      throw new TypeError('Unsupported SQLite parameter.')
    })
    return new SqliteStatement(this.#connection, this.#sql, parameters)
  }

  async first(): Promise<unknown> {
    return this.#connection.access(() => this.#prepare().get(...this.#parameters) ?? null)
  }

  #prepare() {
    // Only the connection owner may control transaction lifetime, including
    // commands preceded by SQL comments or empty statements.
    if (
      /^(?:\s|;|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(begin|savepoint|commit|rollback|release|end)\b/i.test(
        this.#sql,
      )
    ) {
      throw new Error('Transaction control must use runInTransaction or batch.')
    }
    return this.#connection.sqlite.prepare(this.#sql)
  }

  #execute() {
    const statement = this.#prepare()
    if (statement.reader) {
      return { results: statement.all(...this.#parameters), success: true, meta: { changes: 0 } }
    }
    const result = statement.run(...this.#parameters)
    return {
      results: [],
      success: true,
      meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) },
    }
  }

  async run() {
    return this.#connection.access(() => this.#execute())
  }
  async all() {
    return this.#connection.access(() => this.#execute())
  }
  async raw(): Promise<unknown[][]> {
    return this.#connection.access(
      () =>
        this.#prepare()
          .raw()
          .all(...this.#parameters) as unknown[][],
    )
  }
}

/** One queue and async owner per physical connection, including separate bindings. */
class SqliteConnection {
  private owner = new AsyncLocalStorage<{ active: boolean }>()
  private tail: Promise<unknown> = Promise.resolve()

  constructor(readonly sqlite: Database.Database) {}

  access<T>(fn: () => T | Promise<T>): Promise<T> {
    const owner = this.owner.getStore()
    if (owner) {
      if (!owner.active) return Promise.reject(new Error('SQLite transaction has ended.'))
      return Promise.resolve().then(fn)
    }
    const result = this.tail.then(fn)
    this.tail = result.catch(() => {})
    return result
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.owner.getStore()) {
      return Promise.reject(new Error('Nested interactive SQLite transactions are unsupported.'))
    }
    return this.access(async () => {
      this.sqlite.exec('BEGIN IMMEDIATE')
      const owner = { active: true }
      try {
        const result = await this.owner.run(owner, fn)
        this.sqlite.exec('COMMIT')
        return result
      } catch (error) {
        if (this.sqlite.inTransaction) this.sqlite.exec('ROLLBACK')
        throw error
      } finally {
        owner.active = false
      }
    })
  }
}

const connections = new WeakMap<Database.Database, SqliteConnection>()

export function createSqliteBinding(sqlite: Database.Database) {
  let connection = connections.get(sqlite)
  if (!connection) {
    connection = new SqliteConnection(sqlite)
    connections.set(sqlite, connection)
  }
  const ownedConnection = connection
  return {
    [interactiveTransaction]: <T>(fn: () => Promise<T>) => ownedConnection.transaction(fn),
    prepare: (sql: string) => new SqliteStatement(ownedConnection, sql),
    batch: (statements: SqliteStatement[]) => SqliteStatement.batch(ownedConnection, statements),
  }
}
