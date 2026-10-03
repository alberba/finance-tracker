import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { users } from './users'
import { accounts } from './accounts'
import type { BitvavoPreview } from '../../lib/bitvavo-types'

export const bitvavoConnections = sqliteTable('bitvavo_connections', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  startDate: text('start_date').notNull(),
  timeZone: text('time_zone').notNull(),
  cursor: integer('cursor'),
  version: integer('version').notNull().default(1),
  lockToken: text('lock_token'),
  lockUntil: integer('lock_until').notNull().default(0),
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
