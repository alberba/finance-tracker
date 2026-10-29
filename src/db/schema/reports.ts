/**
 * Propiedad de los reportes web (#340).
 *
 * GitHub sigue siendo la fuente de verdad del estado; esta tabla solo guarda a
 * qué cuenta pertenece cada issue y hasta dónde ha leído. `wipeUserData` no la
 * toca ([D10]): no son datos financieros.
 */

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  },
  (table) => [
    uniqueIndex('issue_reports_user_issue_idx').on(table.userId, table.issueNumber),
    index('issue_reports_user_submitted_idx').on(table.userId, table.submittedAt),
  ],
)
