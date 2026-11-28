/**
 * Propiedad de los reportes web (#340).
 *
 * GitHub sigue siendo la fuente de verdad del estado; esta tabla solo guarda a
 * qué cuenta pertenece cada issue y hasta dónde ha leído. `wipeUserData` no la
 * toca ([D10]): no son datos financieros.
 */

import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import type { ReportDiagnostic } from '../../domain/reports/diagnostic'

import { idColumn } from './_helpers'
import { users } from './users'

export const issueReports = sqliteTable(
  'issue_reports',
  {
    id: idColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    issueNumber: integer('issue_number').notNull(),
    submittedAt: text('submitted_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    /** Cuerpo de la issue al crearla; el enricher lo sobrescribe en GitHub. `null` en altas anteriores. */
    originalBody: text('original_body'),
    privateTitle: text('private_title'),
    caseReference: text('case_reference'),
  },
  (table) => [
    uniqueIndex('issue_reports_user_issue_idx').on(table.userId, table.issueNumber),
    uniqueIndex('issue_reports_case_reference_idx').on(table.caseReference),
    index('issue_reports_user_submitted_idx').on(table.userId, table.submittedAt),
  ],
)

export const reportDiagnostics = sqliteTable(
  'report_diagnostics',
  {
    reportId: text('report_id')
      .primaryKey()
      .notNull()
      .references(() => issueReports.id, { onDelete: 'cascade' }),
    capture: text('capture', { mode: 'json' }).$type<ReportDiagnostic>().notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [index('report_diagnostics_expiry_idx').on(table.expiresAt)],
)

export const reportSupportGrants = sqliteTable(
  'report_support_grants',
  {
    reportId: text('report_id')
      .notNull()
      .references(() => issueReports.id, { onDelete: 'cascade' }),
    supportUserId: text('support_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.reportId, table.supportUserId] })],
)

export const reportSupportAudit = sqliteTable('report_support_audit', {
  id: idColumn(),
  issueNumber: integer('issue_number').notNull(),
  actorId: text('actor_id'),
  subjectId: text('subject_id'),
  action: text('action', { enum: ['read', 'denied', 'grant', 'revoke', 'withdraw'] }).notNull(),
  occurredAt: text('occurred_at').notNull(),
})

export const reportPrivateComments = sqliteTable(
  'report_private_comments',
  {
    id: integer('id').primaryKey().notNull(),
    reportId: text('report_id')
      .notNull()
      .references(() => issueReports.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: text('created_at').notNull(),
    editedAt: text('edited_at'),
  },
  (table) => [index('report_private_comments_report_idx').on(table.reportId)],
)

export const reportPrivateFiles = sqliteTable(
  'report_private_files',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id')
      .notNull()
      .references(() => issueReports.id, { onDelete: 'cascade' }),
    commentId: integer('comment_id').references(() => reportPrivateComments.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
  },
  (table) => [index('report_private_files_report_idx').on(table.reportId, table.commentId)],
)

export const reportPrivateFileParts = sqliteTable(
  'report_private_file_parts',
  {
    fileId: text('file_id')
      .notNull()
      .references(() => reportPrivateFiles.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    data: text('data').notNull(),
  },
  (table) => [primaryKey({ columns: [table.fileId, table.sequence] })],
)
