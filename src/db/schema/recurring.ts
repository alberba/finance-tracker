/** Subscriptions, recurring rules, and their generated pending movements. */

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
import { accounts, categories } from "./accounts";

/** A recurring billed subscription (e.g. streaming, gym). */
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    name: text("name").notNull(),
    categoryId: text("category_id").references(() => categories.id),
    accountId: text("account_id").references(() => accounts.id),
    amountMinor: moneyMinorColumn("amount_minor"),
    currency: currencyColumn(),
    /** Kept only to recover subscriptions written before start dates existed. */
    legacyBillingDay: integer("billing_day"),
    startDate: text("start_date"),
    nextChargeDate: text("next_charge_date"),
    frequency: text("frequency").notNull(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [index("subscriptions_user_id_idx").on(table.userId)],
);

/**
 * A recurring generation rule (income/expense/investment) that produces
 * `pending_movements` rows on its schedule.
 */
export const recurringRules = sqliteTable(
  "recurring_rules",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    name: text("name").notNull(),
    type: text("type").notNull(),
    accountId: text("account_id").references(() => accounts.id),
    categoryId: text("category_id").references(() => categories.id),
    amountMinor: moneyMinorColumn("amount_minor"),
    currency: currencyColumn(),
    frequency: text("frequency").notNull(),
    nextRunDate: text("next_run_date"),
    status: text("status").notNull().default("active"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("recurring_rules_user_id_idx").on(table.userId),
    index("recurring_rules_user_id_status_next_run_date_idx").on(
      table.userId,
      table.status,
      table.nextRunDate,
    ),
  ],
);

/** A single generated (not-yet-confirmed) occurrence of a recurring rule. */
export const pendingMovements = sqliteTable(
  "pending_movements",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    recurringRuleId: text("recurring_rule_id")
      .notNull()
      .references(() => recurringRules.id),
    accountId: text("account_id").references(() => accounts.id),
    categoryId: text("category_id").references(() => categories.id),
    amountMinor: moneyMinorColumn("amount_minor"),
    currency: currencyColumn(),
    dueDate: text("due_date").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("pending_movements_user_id_idx").on(table.userId),
    index("pending_movements_user_id_status_due_date_idx").on(
      table.userId,
      table.status,
      table.dueDate,
    ),
  ],
);
