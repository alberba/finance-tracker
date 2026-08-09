/**
 * Third-party integration credentials and symbol mappings. `ciphertext` is
 * a plain `TEXT` column here — WP12 adds the AES-GCM encrypt/decrypt layer
 * on top; this WP only declares the shape (fixes Contradiction #7: the
 * Stock Events key must land in a real column, not the `app_state.payload`
 * JSON blob).
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
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
    index("integration_credentials_user_id_provider_idx").on(table.userId, table.provider),
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
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("stockevents_symbol_mappings_user_id_idx").on(table.userId),
    index("stockevents_symbol_mappings_user_id_symbol_idx").on(
      table.userId,
      table.stockeventsSymbol,
    ),
  ],
);
