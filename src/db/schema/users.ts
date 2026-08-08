/**
 * Identity tables (WP1 schema; provisioning logic lives in WP3).
 *
 * `users` and `user_settings` are the only tables in this file without a
 * `userId` FK column pointing at *another* table — `users.id` IS the user
 * identity, and `userSettings` FKs to it 1:1. Every other v2 table carries
 * an explicit `user_id` FK, per WP1's design decision.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { idColumn, createdAtColumn, updatedAtColumn, versionColumn } from "./_helpers";

/** A v2 account holder. Reserved "legacy owner" row is created by WP9. */
export const users = sqliteTable("users", {
  id: idColumn(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  /** Marks the single reserved user that legacy (pre-auth) data migrates to. */
  isLegacyOwner: integer("is_legacy_owner").notNull().default(0),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

/**
 * External identity (Cf-Access JWT `sub`, or future providers) linked to a
 * `users` row. First successful auth for an unseen `(provider, subject)`
 * pair creates both rows transactionally (WP3).
 */
export const userIdentities = sqliteTable(
  "user_identities",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("user_identities_user_id_idx").on(table.userId),
    index("user_identities_provider_subject_idx").on(table.provider, table.subject),
  ],
);

/** Per-user preferences (currency, locale, theme). One row per user. */
export const userSettings = sqliteTable(
  "user_settings",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    currency: text("currency").notNull().default("EUR"),
    locale: text("locale"),
    theme: text("theme"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [index("user_settings_user_id_idx").on(table.userId)],
);
