/**
 * Identity tables (WP1 schema; provisioning logic lives in WP3).
 *
 * `users` and `user_settings` are the only tables in this file without a
 * `userId` FK column pointing at *another* table — `users.id` IS the user
 * identity, and `userSettings` FKs to it 1:1. Every other v2 table carries
 * an explicit `user_id` FK, per WP1's design decision.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { idColumn, createdAtColumn, updatedAtColumn, versionColumn } from './_helpers'

/** A financial account holder. */
export const users = sqliteTable('users', {
  id: idColumn(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
})

/**
 * External identity linked to a `users` row. First use by an unseen
 * `(provider, subject)` pair creates both rows transactionally.
 */
export const userIdentities = sqliteTable(
  'user_identities',
  {
    id: idColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    email: text('email'),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('user_identities_user_id_idx').on(table.userId),
    uniqueIndex('user_identities_provider_subject_idx').on(table.provider, table.subject),
  ],
)

/** Per-user preferences (currency, locale, theme). One row per user. */
export const userSettings = sqliteTable(
  'user_settings',
  {
    id: idColumn(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id),
    currency: text('currency').notNull().default('EUR'),
    locale: text('locale'),
    theme: text('theme'),
    stockeventsEnabled: integer('stockevents_enabled').notNull().default(0),
    stockeventsTradesToCash: integer('stockevents_trades_to_cash').notNull().default(0),
    onboardingPresented: integer('onboarding_presented').notNull().default(0),
    onboardingDismissed: integer('onboarding_dismissed').notNull().default(0),
    onboardingAccountCompleted: integer('onboarding_account_completed').notNull().default(0),
    onboardingMovementCompleted: integer('onboarding_movement_completed').notNull().default(0),
    onboardingCompleted: integer('onboarding_completed').notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [index('user_settings_user_id_idx').on(table.userId)],
)
