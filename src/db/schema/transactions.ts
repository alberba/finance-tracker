/** Transactions and their optional investment-trade extension. */

import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
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
import { marketInstruments } from "./market";

/**
 * A single ledger movement (income/expense/investment/transfer). Query
 * patterns from the v1 UI (monthly views, per-account statements) drive the
 * two composite indexes below.
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    categoryId: text("category_id").references(() => categories.id),
    type: text("type").notNull(),
    date: text("date").notNull(),
    description: text("description"),
    amountMinor: moneyMinorColumn("amount_minor"),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("transactions_user_id_idx").on(table.userId),
    // Dashboard/monthly views: newest-first scan per user.
    index("transactions_user_id_date_idx").on(table.userId, table.date),
    // Per-account statement view.
    index("transactions_user_id_account_id_date_idx").on(table.userId, table.accountId, table.date),
  ],
);

/**
 * 1:1 extension of an investment-type transaction with trade-specific
 * fields. `quantity` is stored as a decimal string (not `REAL`/`INTEGER`)
 * since fractional share/crypto units are not minimal-unit money amounts —
 * `src/domain/investment/valuation.ts`'s `round8` remains the float-based
 * display concern for these, per WP2's scope note.
 */
export const investmentTradeDetails = sqliteTable(
  "investment_trade_details",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    transactionId: text("transaction_id")
      .notNull()
      .unique()
      .references(() => transactions.id),
    instrumentId: text("instrument_id").references(() => marketInstruments.id),
    side: text("side").notNull(),
    quantity: text("quantity").notNull(),
    priceMinor: moneyMinorColumn("price_minor"),
    feeMinor: moneyMinorColumn("fee_minor"),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index("investment_trade_details_user_id_idx").on(table.userId)],
);
