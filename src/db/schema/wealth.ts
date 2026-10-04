/** Point-in-time wealth snapshots and portfolio contributions. */

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
import { accounts } from "./accounts";

/** A monthly wealth snapshot header; per-account balances live in `snapshotBalances`. */
export const wealthSnapshots = sqliteTable(
  "wealth_snapshots",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    snapshotDate: text("snapshot_date").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("wealth_snapshots_user_id_idx").on(table.userId),
    index("wealth_snapshots_user_id_snapshot_date_idx").on(table.userId, table.snapshotDate),
    uniqueIndex("wealth_snapshots_user_id_legacy_id_idx").on(table.userId, table.legacyId),
    uniqueIndex("wealth_snapshots_user_id_year_month_idx").on(
      table.userId,
      table.year,
      table.month,
    ),
  ],
);

/** One account's balance within a `wealth_snapshots` row. */
export const snapshotBalances = sqliteTable(
  "snapshot_balances",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => wealthSnapshots.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => accounts.id),
    balanceMinor: moneyMinorColumn("balance_minor"),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("snapshot_balances_user_id_idx").on(table.userId),
    index("snapshot_balances_user_id_snapshot_id_idx").on(table.userId, table.snapshotId),
  ],
);

/** A cash flow into/out of the investment portfolio, used by the TWR calc. */
export const contributions = sqliteTable(
  "contributions",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    legacyId: text("legacy_id"),
    date: text("date").notNull(),
    amountMinor: moneyMinorColumn("amount_minor"),
    currency: currencyColumn(),
    portfolioDate: text("portfolio_date"),
    portfolioValueMinor: integer("portfolio_value_minor"),
    flowMinor: integer("flow_minor"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index("contributions_user_id_idx").on(table.userId),
    index("contributions_user_id_date_idx").on(table.userId, table.date),
    uniqueIndex("contributions_user_id_legacy_id_idx").on(table.userId, table.legacyId),
  ],
);

/** How a `contributions` flow splits across one or more accounts. */
export const contributionAllocations = sqliteTable(
  "contribution_allocations",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => accounts.id),
    amountMinor: moneyMinorColumn("amount_minor"),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("contribution_allocations_user_id_idx").on(table.userId),
    index("contribution_allocations_user_id_contribution_id_idx").on(
      table.userId,
      table.contributionId,
    ),
  ],
);
