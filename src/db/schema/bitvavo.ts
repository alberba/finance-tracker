import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { users } from './users'
import { accounts } from './accounts'
import type { BitvavoPreview, BitvavoSyncCounts, BitvavoSyncStatus } from '../../lib/bitvavo-types'

export const bitvavoConnections = sqliteTable('bitvavo_connections', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  startDate: text('start_date').notNull(),
  timeZone: text('time_zone').notNull(),
  /** Greatest remote instant (ms) applied by a complete range. */
  cursor: integer('cursor'),
  version: integer('version').notNull().default(1),
  lockToken: text('lock_token'),
  lockUntil: integer('lock_until').notNull().default(0),
  lastAttemptAt: integer('last_attempt_at'),
  lastAttemptStatus: text('last_attempt_status').$type<BitvavoSyncStatus>(),
  lastError: text('last_error'),
  lastSuccessAt: integer('last_success_at'),
  lastCounts: text('last_counts', { mode: 'json' }).$type<BitvavoSyncCounts>(),
  needsAttention: integer('needs_attention', { mode: 'boolean' }).notNull().default(false),
})
export const bitvavoPreviews = sqliteTable('bitvavo_previews', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  preview: text('preview', { mode: 'json' }).notNull().$type<BitvavoPreview>(),
  status: text('status').notNull().default('pending'),
  resolutions: text('resolutions'),
  createdAt: integer('created_at').notNull(),
})
/** The minimum kept for an operation that could not be imported: no remote payload. */
export const bitvavoSkipped = sqliteTable(
  'bitvavo_skipped',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    externalId: text('external_id').notNull(),
    executedAt: text('executed_at'),
    reason: text('reason').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.externalId] })],
)
/** Who did what with an integration, without secrets or remote payloads. */
export const integrationAuditEvents = sqliteTable(
  'integration_audit_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    detail: text('detail', { mode: 'json' }).$type<Record<string, string | number | boolean>>(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('integration_audit_events_user_idx').on(table.userId, table.createdAt)],
)
