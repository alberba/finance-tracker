/**
 * Market data. `marketInstruments` and `marketQuotes` are shared reference
 * data (a single AAPL row/quote series serves every user), so — unlike
 * every other table in this schema — they intentionally have NO `user_id`
 * column. `userInstruments` is the per-user join table that carries the
 * `user_id` FK and links a user to the instruments they track.
 */

import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
  idColumn,
  createdAtColumn,
  updatedAtColumn,
  versionColumn,
  moneyMinorColumn,
  currencyColumn,
} from './_helpers'
import { users } from './users'
import { categories } from './accounts'
import type { InstrumentQuoteConfig } from '../../scripts/types'

/** Global catalog of tradable instruments (stocks, ETFs, crypto). */
export const marketInstruments = sqliteTable(
  'market_instruments',
  {
    id: idColumn(),
    legacyId: text('legacy_id'),
    symbol: text('symbol').notNull(),
    /** Uppercased/trimmed `symbol`, used for provider lookups and the index below. */
    normalizedSymbol: text('normalized_symbol').notNull(),
    provider: text('provider').notNull(),
    name: text('name'),
    assetClass: text('asset_class'),
    currency: currencyColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('market_instruments_provider_symbol_idx').on(
      table.provider,
      table.normalizedSymbol,
    ),
  ],
)

/** A user's tracked instrument, optionally tagged with a portfolio category. */
export const userInstruments = sqliteTable(
  'user_instruments',
  {
    id: idColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => marketInstruments.id),
    categoryId: text('category_id').references(() => categories.id),
    alias: text('alias'),
    quoteConfig: text('quote_config', { mode: 'json' }).$type<InstrumentQuoteConfig>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    index('user_instruments_user_id_idx').on(table.userId),
    uniqueIndex('user_instruments_user_id_instrument_id_idx').on(table.userId, table.instrumentId),
  ],
)

/** Global quote history for an instrument (shared across users). */
export const marketQuotes = sqliteTable(
  'market_quotes',
  {
    id: idColumn(),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => marketInstruments.id),
    priceMinor: moneyMinorColumn('price_minor'),
    currency: currencyColumn(),
    quotedAt: text('quoted_at').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('market_quotes_instrument_id_quoted_at_idx').on(table.instrumentId, table.quotedAt),
  ],
)
