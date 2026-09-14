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
 * The movement template ("plantilla de movimiento", CONTEXT.md) plus a
 * calendar: what movement to create (type, amount, category, description,
 * account and, when it is an investment, the operation) and when.
 *
 * The operation columns mirror `investment_trade_details`: `units` is TEXT
 * so a fractional share survives verbatim, price and fee are INTEGER minor
 * units.
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
    interval: integer("interval").notNull().default(1),
    startDate: text("start_date"),
    endDate: text("end_date"),
    lastExecutionDate: text("last_execution_date"),
    nextRunDate: text("next_run_date"),
    symbol: text("symbol"),
    side: text("side"),
    units: text("units"),
    unitPriceMinor: integer("unit_price_minor"),
    feeMinor: integer("fee_minor"),
    time: text("time"),
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

/**
 * A single generated (not-yet-confirmed) occurrence of a recurring rule:
 * the same movement template as its rule, plus a date. It carries its own
 * copy because the user may edit the occurrence without touching the rule,
 * and `transaction_id` records the movement a confirmation produced — by
 * the client's own movement id, the one `transactions.legacy_id` carries —
 * so confirming twice cannot produce it twice.
 */
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
    type: text("type"),
    description: text("description"),
    symbol: text("symbol"),
    side: text("side"),
    units: text("units"),
    unitPriceMinor: integer("unit_price_minor"),
    feeMinor: integer("fee_minor"),
    time: text("time"),
    transactionId: text("transaction_id"),
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
