import { and, asc, eq, exists, gt, lte, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'

import { lift } from '../database'
import {
  issueReports,
  reportDiagnostics,
  reportPrivateComments,
  reportPrivateFileParts,
  reportPrivateFiles,
  reportSupportAudit,
  reportSupportGrants,
} from '../schema'
import { decodeBase64, encodeBase64 } from '../../domain/reports/issue-attachments'
import type { ReportDiagnostic } from '../../domain/reports/diagnostic'
import type { ThreadAttachment, ThreadItem } from '../../domain/reports/report-entry'
import type { ResolvedAttachment } from '../../lib/server/issue-report-schema'
import { runInTransaction, type Db } from './shared'

const CAPTURE_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Keep each D1 row below its size limit, even for a maximum-size screenshot.
const FILE_PART_BYTES = 512 * 1024
type Statement = BatchItem<'sqlite'> & PromiseLike<unknown>

async function atomic(db: Db, first: Statement, ...rest: Statement[]) {
  if ('batch' in db && typeof db.batch === 'function') {
    await db.batch([first, ...rest])
  } else {
    await runInTransaction(db, async () => {
      await first
      for (const operation of rest) await operation
    })
  }
}

function attachmentLink(file: { id: string; name: string }): ThreadAttachment {
  return { name: file.name, url: `/api/report-files/${file.id}` }
}

function addFiles(
  db: Db,
  reportId: string,
  commentId: number | null,
  attachments: ResolvedAttachment[],
) {
  const links: ThreadAttachment[] = []
  const statements: Statement[] = []
  for (const attachment of attachments) {
    const file = {
      id: crypto.randomUUID(),
      reportId,
      commentId,
      name: attachment.name,
      contentType: attachment.contentType,
    }
    links.push(attachmentLink(file))
    statements.push(db.insert(reportPrivateFiles).values(file))
    const parts = []
    for (let offset = 0; offset < attachment.bytes.length; offset += FILE_PART_BYTES) {
      parts.push({
        fileId: file.id,
        sequence: parts.length,
        data: encodeBase64(attachment.bytes.subarray(offset, offset + FILE_PART_BYTES)),
      })
    }
    statements.push(db.insert(reportPrivateFileParts).values(parts))
  }
  return { links, statements }
}

interface Submission {
  caseReference: string
  issueNumber: number
  submittedAt: string
  title: string
  body: string
  diagnostic?: ReportDiagnostic
  attachments: ResolvedAttachment[]
}

async function saveSubmissionSql(db: Db, userId: string, input: Submission) {
  const id = crypto.randomUUID()
  const files = addFiles(db, id, null, input.attachments)
  const statements = [...files.statements]
  if (input.diagnostic) {
    const expiresAt = new Date(Date.parse(input.submittedAt) + CAPTURE_TTL_MS).toISOString()
    statements.push(
      db.insert(reportDiagnostics).values({ reportId: id, capture: input.diagnostic, expiresAt }),
    )
  }
  await atomic(
    db,
    db.insert(issueReports).values({
      id,
      userId,
      issueNumber: input.issueNumber,
      submittedAt: input.submittedAt,
      lastSeenAt: input.submittedAt,
      originalBody: input.body,
      privateTitle: input.title,
      caseReference: input.caseReference,
    }),
    ...statements,
  )
}

type CommentRow = typeof reportPrivateComments.$inferSelect

function toComment(
  row: CommentRow,
  attachments: ThreadAttachment[],
  editable: boolean,
): ThreadItem {
  return {
    id: row.id,
    kind: 'reporter',
    author: 'Tú',
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    text: row.text,
    attachments,
    editable,
  }
}

async function readFiles(db: Db, reportId: string) {
  return db
    .select({
      id: reportPrivateFiles.id,
      name: reportPrivateFiles.name,
      commentId: reportPrivateFiles.commentId,
    })
    .from(reportPrivateFiles)
    .where(eq(reportPrivateFiles.reportId, reportId))
}

async function readContentSql(db: Db, reportId: string, open: boolean) {
  const files = await readFiles(db, reportId)
  const comments = await db
    .select()
    .from(reportPrivateComments)
    .where(eq(reportPrivateComments.reportId, reportId))
    .orderBy(asc(reportPrivateComments.createdAt), asc(reportPrivateComments.id))
  return {
    attachments: files.filter((file) => file.commentId === null).map(attachmentLink),
    comments: comments.map((row) =>
      toComment(row, files.filter((file) => file.commentId === row.id).map(attachmentLink), open),
    ),
  }
}

// Keep local comment IDs in a separate range from GitHub's GraphQL databaseId (32-bit).
const PRIVATE_COMMENT_BASE = 100_000_000_000_000
export const isPrivateCommentId = (id: number) => id >= PRIVATE_COMMENT_BASE

async function addCommentSql(
  db: Db,
  reportId: string,
  text: string,
  attachments: ResolvedAttachment[],
  now: string,
) {
  const random = crypto.getRandomValues(new Uint32Array(2))
  const id = PRIVATE_COMMENT_BASE + (random[0] & 0xffff) * 2 ** 32 + random[1]
  const row = { id, reportId, text, createdAt: now, editedAt: null }
  const files = addFiles(db, reportId, id, attachments)
  await atomic(db, db.insert(reportPrivateComments).values(row), ...files.statements)
  return toComment(row, files.links, true)
}

function commentMatch(reportId: string, commentId: number) {
  return and(eq(reportPrivateComments.reportId, reportId), eq(reportPrivateComments.id, commentId))
}

async function updateCommentSql(
  db: Db,
  reportId: string,
  commentId: number,
  input: { text: string; keepAttachments: string[]; attachments: ResolvedAttachment[] },
  now: string,
) {
  const [row] = await db
    .select()
    .from(reportPrivateComments)
    .where(commentMatch(reportId, commentId))
  if (!row) return { status: 'missing' } as const
  const existing = (await readFiles(db, reportId)).filter((file) => file.commentId === commentId)
  const kept = existing.filter((file) => input.keepAttachments.includes(attachmentLink(file).url))
  if (kept.length !== new Set(input.keepAttachments).size) return { status: 'invalid' } as const
  const removed = existing.filter((file) => !kept.includes(file))
  const files = addFiles(db, reportId, commentId, input.attachments)
  await atomic(
    db,
    db
      .update(reportPrivateComments)
      .set({ text: input.text, editedAt: now })
      .where(commentMatch(reportId, commentId)),
    ...removed.map((file) =>
      db.delete(reportPrivateFiles).where(eq(reportPrivateFiles.id, file.id)),
    ),
    ...files.statements,
  )
  return {
    status: 'updated',
    comment: toComment(
      { ...row, text: input.text, editedAt: now },
      [...kept.map(attachmentLink), ...files.links],
      true,
    ),
  } as const
}

async function removeCommentSql(db: Db, reportId: string, commentId: number) {
  const rows = await db
    .delete(reportPrivateComments)
    .where(commentMatch(reportId, commentId))
    .returning({ id: reportPrivateComments.id })
  return rows.length > 0
}

async function audit(
  db: Db,
  issueNumber: number,
  actorId: string | null,
  action: typeof reportSupportAudit.$inferInsert.action,
  now: string,
) {
  await db.insert(reportSupportAudit).values({ issueNumber, actorId, action, occurredAt: now })
}

function grantFor(db: Db, userId: string) {
  return exists(
    db
      .select({ id: reportSupportGrants.reportId })
      .from(reportSupportGrants)
      .where(
        and(
          eq(reportSupportGrants.supportUserId, userId),
          eq(reportSupportGrants.reportId, issueReports.id),
        ),
      ),
  )
}

async function readSupportCaseSql(db: Db, issueNumber: number, supportUserId: string, now: string) {
  const [report] = await db
    .select({
      id: issueReports.id,
      reference: issueReports.caseReference,
      title: issueReports.privateTitle,
      original: issueReports.originalBody,
      submittedAt: issueReports.submittedAt,
      diagnostic: reportDiagnostics.capture,
      diagnosticExpiresAt: reportDiagnostics.expiresAt,
    })
    .from(issueReports)
    .leftJoin(
      reportDiagnostics,
      and(eq(reportDiagnostics.reportId, issueReports.id), gt(reportDiagnostics.expiresAt, now)),
    )
    .where(and(eq(issueReports.issueNumber, issueNumber), grantFor(db, supportUserId)))
    .limit(1)

  if (!report) {
    await audit(db, issueNumber, supportUserId, 'denied', now)
    return null
  }
  const content = await readContentSql(db, report.id, false)
  await audit(db, issueNumber, supportUserId, 'read', now)
  return {
    issueNumber,
    reference: report.reference,
    title: report.title,
    original: report.original,
    submittedAt: report.submittedAt,
    diagnostic: report.diagnostic,
    diagnosticExpiresAt: report.diagnosticExpiresAt,
    ...content,
  }
}

async function changeGrantSql(
  db: Db,
  issueNumber: number,
  actorId: string,
  supportUserId: string,
  enable: boolean,
  now: string,
) {
  const reports = await db
    .select({ id: issueReports.id })
    .from(issueReports)
    .where(eq(issueReports.issueNumber, issueNumber))
    .limit(2)
  if (reports.length !== 1) return false
  const [{ id: reportId }] = reports
  const operation = enable
    ? db.insert(reportSupportGrants).values({ reportId, supportUserId }).onConflictDoNothing()
    : db
        .delete(reportSupportGrants)
        .where(
          and(
            eq(reportSupportGrants.reportId, reportId),
            eq(reportSupportGrants.supportUserId, supportUserId),
          ),
        )
  await atomic(
    db,
    operation,
    db.insert(reportSupportAudit).values({
      issueNumber,
      actorId,
      subjectId: supportUserId,
      action: enable ? 'grant' : 'revoke',
      occurredAt: now,
    }),
  )
  return true
}

function ownReport(db: Db, userId: string, issueNumber: number) {
  return db
    .select({ id: issueReports.id })
    .from(issueReports)
    .where(and(eq(issueReports.userId, userId), eq(issueReports.issueNumber, issueNumber)))
}

async function diagnosticExpirySql(db: Db, userId: string, issueNumber: number, now: string) {
  const [row] = await db
    .select({ expiresAt: reportDiagnostics.expiresAt })
    .from(reportDiagnostics)
    .where(
      and(
        eq(reportDiagnostics.reportId, ownReport(db, userId, issueNumber)),
        gt(reportDiagnostics.expiresAt, now),
      ),
    )
  return row?.expiresAt ?? null
}

async function withdrawSql(db: Db, userId: string, issueNumber: number, now: string) {
  const [report] = await ownReport(db, userId, issueNumber)
  if (!report) return false
  await atomic(
    db,
    db.delete(reportDiagnostics).where(eq(reportDiagnostics.reportId, report.id)),
    db
      .insert(reportSupportAudit)
      .values({ issueNumber, actorId: userId, action: 'withdraw', occurredAt: now }),
  )
  return true
}

async function readFileSql(db: Db, fileId: string, userId: string, support: boolean, now: string) {
  const [file] = await db
    .select({
      contentType: reportPrivateFiles.contentType,
      issueNumber: issueReports.issueNumber,
      owned: sql<boolean>`${issueReports.userId} = ${userId}`,
    })
    .from(reportPrivateFiles)
    .innerJoin(issueReports, eq(issueReports.id, reportPrivateFiles.reportId))
    .where(
      and(
        eq(reportPrivateFiles.id, fileId),
        support
          ? sql`(${issueReports.userId} = ${userId} or ${grantFor(db, userId)})`
          : eq(issueReports.userId, userId),
      ),
    )
  if (!file) return null
  const parts = await db
    .select({ data: reportPrivateFileParts.data })
    .from(reportPrivateFileParts)
    .where(eq(reportPrivateFileParts.fileId, fileId))
    .orderBy(asc(reportPrivateFileParts.sequence))
  if (!file.owned) await audit(db, file.issueNumber, userId, 'read', now)
  return {
    contentType: file.contentType,
    bytes: new Blob(parts.map(({ data }) => decodeBase64(data))),
  }
}

/** Reclaims expired captures on report activity. Reads enforce the exact deadline independently. */
async function purgeExpiredSql(db: Db, now: string) {
  await db.delete(reportDiagnostics).where(lte(reportDiagnostics.expiresAt, now))
}

export const saveSubmission = lift(saveSubmissionSql)
export const readContent = lift(readContentSql)
export const addComment = lift(addCommentSql)
export const updateComment = lift(updateCommentSql)
export const removeComment = lift(removeCommentSql)
export const readSupportCase = lift(readSupportCaseSql)
export const changeGrant = lift(changeGrantSql)
export const diagnosticExpiry = lift(diagnosticExpirySql)
export const withdraw = lift(withdrawSql)
export const readFile = lift(readFileSql)
export const purgeExpired = lift(purgeExpiredSql)
