/** Accounts and categories — the core reference tables transactions hang off. */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import {
  idColumn,
  createdAtColumn,
  updatedAtColumn,
  versionColumn,
  moneyMinorColumn,
  currencyColumn,
} from "./_helpers";
import { users } from "./users";

/** A cash/bank/broker/crypto account. `legacyId` maps to v1's account slug. */
export const accounts = sqliteTable(
  "accounts",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    currency: currencyColumn(),
    openingBalanceMinor: moneyMinorColumn("opening_balance_minor"),
    isArchived: integer("is_archived").notNull().default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    index("accounts_user_id_legacy_id_idx").on(table.userId, table.legacyId),
  ],
);

/** Income/expense/investment category, per-user (v1 categories are strings). */
export const categories = sqliteTable(
  "categories",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** User-chosen emoji override; null falls back to the built-in map. */
    emoji: text("emoji"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("categories_user_id_idx").on(table.userId),
    index("categories_user_id_kind_idx").on(table.userId, table.kind),
  ],
);

/**
 * Investment liquidity "account" used by the time-weighted-return (TWR)
 * calculation to represent cash flows in/out of a portfolio without being a
 * spendable bank account.
 */
export const twrLiquidityAccounts = sqliteTable(
  "twr_liquidity_accounts",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    name: text("name").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [index("twr_liquidity_accounts_user_id_idx").on(table.userId)],
);
