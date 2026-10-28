import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as issueReportsRepo from '../../../../src/db/repositories/issue-reports'
import { runWithDb } from '../../../../src/db/database'
import { createTestDb, type TestDatabase } from '../setup'
import { seedUser } from './fixtures'

const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
const T3 = '2026-10-03T10:00:00.000Z'

describe('issue-reports repository', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  it('registra la propiedad una sola vez', async () => {
    const { db } = testDb
    const user = await seedUser(db)

    expect(await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 340, T1))).toBe(true)
    expect(await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 340, T2))).toBe(false)

    const row = await runWithDb(db, issueReportsRepo.getByUserAndNumber(user.id, 340))
    expect(row).toMatchObject({ issueNumber: 340, submittedAt: T1, lastSeenAt: T1 })
  })

  it('aísla las filas entre cuentas', async () => {
    const { db } = testDb
    const userA = await seedUser(db)
    const userB = await seedUser(db)

    await runWithDb(db, issueReportsRepo.recordSubmission(userA.id, 340, T1))
    expect(await runWithDb(db, issueReportsRepo.getByUserAndNumber(userB.id, 340))).toBeUndefined()
    expect(await runWithDb(db, issueReportsRepo.listIssueNumbersByUser(userB.id))).toEqual([])
  })

  it('devuelve las más recientes primero', async () => {
    const { db } = testDb
    const user = await seedUser(db)
    await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 1, T1))
    await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 3, T3))
    await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 2, T2))

    const rows = await runWithDb(db, issueReportsRepo.listByUser(user.id))
    expect(rows.map((row) => row.issueNumber)).toEqual([3, 2, 1])
  })

  it('marca visto sin retroceder', async () => {
    const { db } = testDb
    const user = await seedUser(db)
    await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 10, T1))

    expect(await runWithDb(db, issueReportsRepo.markSeen(user.id, 10, T3))).toBe(true)
    expect(await runWithDb(db, issueReportsRepo.markSeen(user.id, 10, T2))).toBe(true)
    expect(
      (await runWithDb(db, issueReportsRepo.getByUserAndNumber(user.id, 10)))?.lastSeenAt,
    ).toBe(T3)
  })

  it('no marca visto un reporte de otra cuenta', async () => {
    const { db } = testDb
    const userA = await seedUser(db)
    const userB = await seedUser(db)
    await runWithDb(db, issueReportsRepo.recordSubmission(userA.id, 10, T1))

    expect(await runWithDb(db, issueReportsRepo.markSeen(userB.id, 10, T3))).toBe(false)
  })

  it('inserta por lotes solo las que faltan', async () => {
    const { db } = testDb
    const user = await seedUser(db)

    const rows = Array.from({ length: 120 }, (_, index) => ({
      userId: user.id,
      issueNumber: index + 1,
      submittedAt: T1,
      lastSeenAt: T2,
    }))
    expect(await runWithDb(db, issueReportsRepo.insertManyIfMissing(rows))).toBe(120)
    expect(await runWithDb(db, issueReportsRepo.insertManyIfMissing(rows))).toBe(0)
    expect(await runWithDb(db, issueReportsRepo.listIssueNumbersByUser(user.id))).toHaveLength(120)
  })

  it('rechaza una fila de una cuenta inexistente (FK)', async () => {
    const { db } = testDb
    await expect(runWithDb(db, issueReportsRepo.recordSubmission('nadie', 1, T1))).rejects.toThrow(
      /FOREIGN KEY constraint failed/i,
    )
  })
})
