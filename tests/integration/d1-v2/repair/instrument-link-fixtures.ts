import type Database from 'better-sqlite3'

export const USER = 'links-user'
const STAMP = '2026-11-28T00:00:00.000Z'
export const MOVES = [{ symbol: 'ETH', accountName: 'Bitvavo' }]

/** Rows with the shape of production: BTC/ETH linked to nothing since August, three old ETH buys on BTC. */
export function seedProductionShape(sqlite: Database.Database) {
  sqlite
    .prepare(
      `INSERT INTO users (id, email, created_at, updated_at) VALUES (?, 'links@example.com', ?, ?)`,
    )
    .run(USER, STAMP, STAMP)
  for (const [id, name] of [
    ['acc-bitvavo', 'Bitvavo'],
    ['acc-checking', 'Cuenta corriente'],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO accounts (id, user_id, name, kind, currency, opening_balance_minor, created_at, updated_at) VALUES (?, ?, ?, 'cash', 'EUR', 0, ?, ?)`,
      )
      .run(id, USER, name, STAMP, STAMP)
  }
  for (const [id, symbol] of [
    ['inst-btc', 'BTC'],
    ['inst-eth', 'ETH'],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO market_instruments (id, symbol, normalized_symbol, provider, currency, created_at, updated_at) VALUES (?, ?, ?, 'coingecko', 'EUR', ?, ?)`,
      )
      .run(id, symbol, symbol, STAMP, STAMP)
    sqlite
      .prepare(
        `INSERT INTO user_instruments (id, user_id, instrument_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(`user-${id}`, USER, id, STAMP, STAMP)
  }

  const buy = (
    id: string,
    date: string,
    accountId: string,
    symbol: string,
    instrumentId: string | null,
    quantity: string,
  ) => {
    sqlite
      .prepare(
        `INSERT INTO transactions (id, user_id, account_id, type, date, description, amount_minor, currency, created_at, updated_at) VALUES (?, ?, ?, 'investment', ?, ?, 100000, 'EUR', ?, ?)`,
      )
      .run(id, USER, accountId, date, `Compra ${symbol}`, STAMP, STAMP)
    sqlite
      .prepare(
        `INSERT INTO investment_trade_details (id, user_id, transaction_id, instrument_id, symbol, side, quantity, price_minor, fee_minor, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'buy', ?, 100000, 0, 'EUR', ?, ?)`,
      )
      .run(`detail-${id}`, USER, id, instrumentId, symbol, quantity, STAMP, STAMP)
  }
  buy('btc-linked', '2026-01-05', 'acc-bitvavo', 'BTC', 'inst-btc', '0.5')
  buy('btc-august', '2026-08-10', 'acc-bitvavo', 'BTC', null, '0.25')
  buy('eth-january-9', '2026-01-09', 'acc-checking', 'ETH', 'inst-btc', '1')
  buy('eth-january-23', '2026-01-23', 'acc-checking', 'ETH', 'inst-btc', '2')
  buy('eth-february-6', '2026-02-06', 'acc-bitvavo', 'ETH', 'inst-btc', '3')
  buy('eth-august', '2026-08-15', 'acc-checking', 'ETH', null, '4')
  buy('eth-ok', '2026-09-01', 'acc-bitvavo', 'ETH', 'inst-eth', '5')
  buy('mystery', '2026-09-02', 'acc-bitvavo', 'XYZ', null, '9')
}
