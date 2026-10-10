import Database from 'better-sqlite3'

type Parameter = string | number | bigint | Buffer | null

/** The SQL boundary consumed by Drizzle's async D1 driver and legacy state. */
class SqliteStatement {
  constructor(
    private sqlite: Database.Database,
    private sql: string,
    private parameters: Parameter[] = [],
  ) {}

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
    return new SqliteStatement(this.sqlite, this.sql, parameters)
  }

  async first(): Promise<unknown> {
    return this.sqlite.prepare(this.sql).get(...this.parameters) ?? null
  }

  execute() {
    // Match D1's lack of interactive transactions: async requests must never
    // share a BEGIN across awaits on this single connection. batch is atomic.
    if (/^\s*(begin|savepoint)\b/i.test(this.sql)) {
      throw new Error('Interactive transactions are unsupported; use batch.')
    }
    const statement = this.sqlite.prepare(this.sql)
    if (statement.reader) {
      return { results: statement.all(...this.parameters), success: true, meta: { changes: 0 } }
    }
    const result = statement.run(...this.parameters)
    return {
      results: [],
      success: true,
      meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) },
    }
  }

  async run() {
    return this.execute()
  }
  async all() {
    return this.execute()
  }
  async raw(): Promise<unknown[][]> {
    return this.sqlite
      .prepare(this.sql)
      .raw()
      .all(...this.parameters) as unknown[][]
  }
}

export function createSqliteBinding(sqlite: Database.Database) {
  return {
    prepare: (sql: string) => new SqliteStatement(sqlite, sql),
    batch: async (statements: SqliteStatement[]) =>
      sqlite.transaction(() => statements.map((statement) => statement.execute()))(),
  }
}
