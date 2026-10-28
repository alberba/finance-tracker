/** `issue_reports` repository (#340) — propiedad y última lectura por cuenta. */

import { and, desc, eq, sql } from 'drizzle-orm'

import { lift } from '../database'
import { issueReports } from '../schema'
import { MAX_SQL_VARIABLES_PER_STATEMENT, type Db } from './shared'

export type IssueReportRow = typeof issueReports.$inferSelect

export interface IssueReportSubmission {
  userId: string
  issueNumber: number
  submittedAt: string
  lastSeenAt: string
}

/** Inserta la propiedad una sola vez; `false` si ya existía. */
async function recordSubmissionSql(
  db: Db,
  userId: string,
  issueNumber: number,
  submittedAt: string,
): Promise<boolean> {
  const inserted = await db
    .insert(issueReports)
    .values({ userId, issueNumber, submittedAt, lastSeenAt: submittedAt })
    .onConflictDoNothing()
    .returning({ id: issueReports.id })
  return inserted.length > 0
}

/** Todas las filas de la cuenta, las más recientes primero. */
async function listByUserSql(db: Db, userId: string): Promise<IssueReportRow[]> {
  return db
    .select()
    .from(issueReports)
    .where(eq(issueReports.userId, userId))
    .orderBy(desc(issueReports.submittedAt), desc(issueReports.issueNumber))
}

/** La comprobación de propiedad: la fila de esta cuenta o `undefined`. */
async function getByUserAndNumberSql(
  db: Db,
  userId: string,
  issueNumber: number,
): Promise<IssueReportRow | undefined> {
  const [row] = await db
    .select()
    .from(issueReports)
    .where(and(eq(issueReports.userId, userId), eq(issueReports.issueNumber, issueNumber)))
  return row
}

/** Monótona: la marca nunca retrocede. `false` si la fila no existe. */
async function markSeenSql(
  db: Db,
  userId: string,
  issueNumber: number,
  seenAtIso: string,
): Promise<boolean> {
  const updated = await db
    .update(issueReports)
    .set({ lastSeenAt: sql`max(${issueReports.lastSeenAt}, ${seenAtIso})` })
    .where(and(eq(issueReports.userId, userId), eq(issueReports.issueNumber, issueNumber)))
    .returning({ id: issueReports.id })
  return updated.length > 0
}

/** Backfill: inserta solo las que faltan, por lotes que respetan el límite de D1. */
async function insertManyIfMissingSql(db: Db, rows: IssueReportSubmission[]): Promise<number> {
  let inserted = 0
  const columnsPerRow = 4
  const chunkSize = Math.max(1, Math.floor(MAX_SQL_VARIABLES_PER_STATEMENT / columnsPerRow))
  for (let start = 0; start < rows.length; start += chunkSize) {
    const values = rows.slice(start, start + chunkSize)
    const result = await db
      .insert(issueReports)
      .values(
        values.map((row) => ({
          userId: row.userId,
          issueNumber: row.issueNumber,
          submittedAt: row.submittedAt,
          lastSeenAt: row.lastSeenAt,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: issueReports.id })
    inserted += result.length
  }
  return inserted
}

async function listIssueNumbersByUserSql(db: Db, userId: string): Promise<number[]> {
  const rows = await db
    .select({ issueNumber: issueReports.issueNumber })
    .from(issueReports)
    .where(eq(issueReports.userId, userId))
  return rows.map((row) => row.issueNumber)
}

async function listAllSql(db: Db): Promise<IssueReportRow[]> {
  return db.select().from(issueReports)
}

export const recordSubmission = lift(recordSubmissionSql)
export const listByUser = lift(listByUserSql)
export const getByUserAndNumber = lift(getByUserAndNumberSql)
export const markSeen = lift(markSeenSql)
export const insertManyIfMissing = lift(insertManyIfMissingSql)
export const listIssueNumbersByUser = lift(listIssueNumbersByUserSql)
export const listAll = lift(listAllSql)
