/**
 * Third-party integration credentials and symbol mappings. `ciphertext` is
 * a plain `TEXT` column here — WP12 adds the AES-GCM encrypt/decrypt layer
 * on top; this WP only declares the shape.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { idColumn, createdAtColumn, updatedAtColumn, versionColumn } from "./_helpers";
import { users } from "./users";
import { categories } from "./accounts";

/** A user's credential for an external integration (e.g. "stockevents"). */
export const integrationCredentials = sqliteTable(
  "integration_credentials",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("integration_credentials_user_id_idx").on(table.userId),
    uniqueIndex("integration_credentials_user_id_provider_idx").on(table.userId, table.provider),
  ],
);

/** Maps a user's internal category to a Stock Events transaction symbol. */
export const stockeventsSymbolMappings = sqliteTable(
  "stockevents_symbol_mappings",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    categoryId: text("category_id").references(() => categories.id),
    stockeventsSymbol: text("stockevents_symbol").notNull(),
    sync: integer("sync").notNull().default(0),
    watchlistId: text("watchlist_id"),
    hidden: integer("hidden").notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("stockevents_symbol_mappings_user_id_idx").on(table.userId),
    uniqueIndex("stockevents_symbol_mappings_user_id_symbol_idx").on(
      table.userId,
      table.stockeventsSymbol,
    ),
    uniqueIndex("stockevents_symbol_mappings_user_id_legacy_id_idx").on(
      table.userId,
      table.legacyId,
    ),
  ],
);

/** Per-account Stock Events watchlist for contribution-cash sync. */
export const stockeventsCashMappings = sqliteTable(
  "stockevents_cash_mappings",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    accountId: text("account_id"),
    watchlistId: text("watchlist_id").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("stockevents_cash_mappings_user_id_idx").on(table.userId),
    uniqueIndex("stockevents_cash_mappings_user_id_account_idx").on(
      table.userId,
      table.accountId,
    ),
  ],
);

/** Already-synced contribution-cash amounts, to compute deltas without double-send. */
export const stockeventsCashSyncEntries = sqliteTable(
  "stockevents_cash_sync_entries",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    contributionDate: text("contribution_date").notNull(),
    accountId: text("account_id"),
    watchlistId: text("watchlist_id").notNull(),
    syncedAmountMinor: integer("synced_amount_minor").notNull(),
    currency: text("currency").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("stockevents_cash_sync_entries_user_id_idx").on(table.userId),
    uniqueIndex("stockevents_cash_sync_entries_user_id_date_account_watchlist_idx").on(
      table.userId,
      table.contributionDate,
      table.accountId,
      table.watchlistId,
    ),
  ],
);
