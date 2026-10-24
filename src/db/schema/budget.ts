/** Monthly budget entries and long-term goals. */

import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  idColumn,
  createdAtColumn,
  updatedAtColumn,
  versionColumn,
  moneyMinorColumn,
  currencyColumn,
} from "./_helpers";
import { users } from "./users";
import { categories } from "./accounts";

/** One category's planned amount for a given (year, month). */
export const budgetEntries = sqliteTable(
  "budget_entries",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    amountMinor: moneyMinorColumn("amount_minor"),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("budget_entries_user_id_idx").on(table.userId),
    index("budget_entries_user_id_year_month_idx").on(table.userId, table.year, table.month),
    uniqueIndex("budget_entries_user_id_legacy_id_idx").on(table.userId, table.legacyId),
    uniqueIndex("budget_entries_user_id_category_year_month_idx").on(
      table.userId,
      table.categoryId,
      table.year,
      table.month,
    ),
  ],
);

/** A savings/investment target (e.g. "short", "investmentTotal" in v1). */
export const goals = sqliteTable(
  "goals",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    key: text("key").notNull(),
    // A savings goal (objetivo de ahorro) is tied to a saving category; the three wealth
    // goals and the investment ones leave it null.
    categoryId: text("category_id").references(() => categories.id),
    name: text("name").notNull(),
    targetYear: integer("target_year"),
    targetAmountMinor: moneyMinorColumn("target_amount_minor"),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("goals_user_id_idx").on(table.userId),
    uniqueIndex("goals_user_id_legacy_id_idx").on(table.userId, table.legacyId),
    uniqueIndex("goals_user_id_key_idx").on(table.userId, table.key),
  ],
);
