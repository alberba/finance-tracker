import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDatabase } from '../setup'

describe('migración issue_reports', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  it('crea la tabla con su clave foránea', () => {
    const table = testDb.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'issue_reports'")
      .get()
    expect(table).toBeTruthy()

    const foreignKeys = testDb.sqlite
      .prepare("PRAGMA foreign_key_list('issue_reports')")
      .all() as Array<{ table: string }>
    expect(foreignKeys.map((key) => key.table)).toEqual(['users'])
  })
})
