/** Transactions and their optional investment-trade extension. */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
  idColumn,
  createdAtColumn,
  updatedAtColumn,
  versionColumn,
  moneyMinorColumn,
  currencyColumn,
} from './_helpers'
import { users } from './users'
import { accounts, categories } from './accounts'
import { marketInstruments } from './market'
import type { RemoteOperation } from '../../lib/bitvavo-types'

/**
 * A single ledger movement (income/expense/investment/transfer). Query
 * patterns from the v1 UI (monthly views, per-account statements) drive the
 * two composite indexes below.
 */
export const transactions = sqliteTable(
  'transactions',
  {
    id: idColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    legacyId: text('legacy_id'),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    categoryId: text('category_id').references(() => categories.id),
    type: text('type').notNull(),
    date: text('date').notNull(),
    description: text('description'),
    amountMinor: moneyMinorColumn('amount_minor'),
    currency: currencyColumn(),
    // Both belong to the movement, not to the operation: a gasto can also be
    // stamped with an hour, and "declarado" is a flag the user sets on any
    // movement (ADR 0002).
    time: text('time'),
    declared: integer('declared', { mode: 'boolean' }).notNull().default(false),
    // 1-12. The month the movement counts in when the user chose one other than
    // its date's; `null` derives it from `date`.
    accountingMonth: integer('accounting_month'),
    externalId: text('external_id'),
    remoteOperation: text('remote_operation', { mode: 'json' }).$type<RemoteOperation>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index('transactions_user_id_idx').on(table.userId),
    // Dashboard/monthly views: newest-first scan per user.
    index('transactions_user_id_date_idx').on(table.userId, table.date),
    // Per-account statement view.
    index('transactions_user_id_account_id_date_idx').on(table.userId, table.accountId, table.date),
    uniqueIndex('transactions_user_id_legacy_id_idx').on(table.userId, table.legacyId),
    uniqueIndex('transactions_user_external_idx').on(table.userId, table.externalId),
  ],
)

/**
 * 1:1 extension of an investment-type transaction with trade-specific
 * fields. `quantity` is stored as a decimal string (not `REAL`/`INTEGER`)
 * since fractional share/crypto units are not minimal-unit money amounts —
 * `src/domain/investment/valuation.ts`'s `round8` remains the float-based
 * display concern for these, per WP2's scope note.
 */
export const investmentTradeDetails = sqliteTable(
  'investment_trade_details',
  {
    id: idColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    transactionId: text('transaction_id')
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    instrumentId: text('instrument_id').references(() => marketInstruments.id),
    // The ticker the user typed. `instrument_id` only resolves once the symbol
    // matches a known instrument, so without this column the symbol of every
    // movement on an untracked ticker is lost (audit §4.3).
    symbol: text('symbol'),
    side: text('side').notNull(),
    quantity: text('quantity').notNull(),
    priceMinor: moneyMinorColumn('price_minor'),
    feeMinor: moneyMinorColumn('fee_minor'),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index('investment_trade_details_user_id_idx').on(table.userId)],
)
