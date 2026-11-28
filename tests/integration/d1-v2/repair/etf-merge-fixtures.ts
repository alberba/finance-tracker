import type Database from 'better-sqlite3'

export const USER = 'etf-user'
const STAMP = '2026-11-28T00:00:00.000Z'

export const ETF_MERGES = [
  { accountName: 'ETF XDWH', brokerName: 'Trade Republic' },
  { accountName: 'ETF IQQI', brokerName: 'Trade Republic' },
  { accountName: 'ETF AGED', brokerName: 'Trade Republic' },
  { accountName: 'ETF SXRS', brokerName: 'Trade Republic' },
  { accountName: 'ETF Plata', brokerName: 'Trade Republic' },
]

/** Legacy ETF account → [account id, symbol, opening balance in minor units]. */
const ETFS: Array<[string, string, string, number]> = [
  ['acc-xdwh', 'ETF XDWH', 'XDWH', 0],
  ['acc-iqqi', 'ETF IQQI', 'IQQI', 0],
  ['acc-aged', 'ETF AGED', 'AGED', 0],
  ['acc-sxrs', 'ETF SXRS', 'SXRS', 0],
  ['acc-plata', 'ETF Plata', 'PLATA', 50000],
]

function insertAccount(
  sqlite: Database.Database,
  id: string,
  name: string,
  kind: string,
  openingMinor = 0,
  archived = 0,
) {
  sqlite
    .prepare(
      `INSERT INTO accounts (id, user_id, legacy_id, name, kind, currency, opening_balance_minor, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?)`,
    )
    .run(id, USER, id.replace('acc-', ''), name, kind, openingMinor, archived, STAMP, STAMP)
}

/**
 * Rows with the shape of production: five legacy accounts-ETF that are really instruments
 * held at Trade Republic, plus «Acciones» that must not be touched. Months with gaps (SXRS has
 * no close after January, AGED none in January) exercise the carried-forward balances.
 */
export function seedEtfAccounts(sqlite: Database.Database, options: { brokerExists?: boolean } = {}) {
  sqlite
    .prepare(`INSERT INTO users (id, email, created_at, updated_at) VALUES (?, 'etf@example.com', ?, ?)`)
    .run(USER, STAMP, STAMP)
  insertAccount(sqlite, 'acc-checking', 'Cuenta corriente', 'cash')
  insertAccount(sqlite, 'acc-acciones', 'Acciones', 'investment')
  for (const [id, name, , opening] of ETFS) insertAccount(sqlite, id, name, 'investment', opening)
  if (options.brokerExists) insertAccount(sqlite, 'acc-trade-republic', 'Trade Republic', 'investment', 10000)

  for (const [id, name] of [...ETFS.map(([i, n]) => [i, n]), ['acc-acciones', 'Acciones']]) {
    sqlite
      .prepare(
        `INSERT INTO categories (id, user_id, legacy_id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, 'investment', ?, ?)`,
      )
      .run(`cat-${id}`, USER, `cat-${id}`, name, STAMP, STAMP)
  }

  const instruments: Array<[string, string, string]> = [
    ...ETFS.map(([id, , symbol]): [string, string, string] => [`inst-${symbol.toLowerCase()}`, symbol, id]),
    ['inst-acciones', 'AAPL', 'acc-acciones'],
  ]
  for (const [instrumentId, symbol, accountId] of instruments) {
    sqlite
      .prepare(
        `INSERT INTO market_instruments (id, symbol, normalized_symbol, provider, asset_class, currency, created_at, updated_at) VALUES (?, ?, ?, 'yahoo', 'etf', 'EUR', ?, ?)`,
      )
      .run(instrumentId, symbol, symbol, STAMP, STAMP)
    sqlite
      .prepare(
        `INSERT INTO user_instruments (id, user_id, instrument_id, alias, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(`user-${instrumentId}`, USER, instrumentId, accountId, STAMP, STAMP)
  }

  const snapshot = (id: string, month: number, balances: Array<[string, number]>) => {
    sqlite
      .prepare(
        `INSERT INTO wealth_snapshots (id, user_id, snapshot_date, year, month, created_at, updated_at) VALUES (?, ?, ?, 2026, ?, ?, ?)`,
      )
      .run(id, USER, `2026-${String(month).padStart(2, '0')}-28`, month, STAMP, STAMP)
    for (const [accountId, balanceMinor] of balances) {
      sqlite
        .prepare(
          `INSERT INTO snapshot_balances (id, user_id, snapshot_id, account_id, balance_minor, currency, created_at) VALUES (?, ?, ?, ?, ?, 'EUR', ?)`,
        )
        .run(`${id}-${accountId}`, USER, id, accountId, balanceMinor, STAMP)
    }
  }
  snapshot('snap-jan', 1, [
    ['acc-checking', 200000],
    ['acc-acciones', 70000],
    ['acc-xdwh', 100000],
    ['acc-iqqi', 30000],
    ['acc-sxrs', 40000],
  ])
  snapshot('snap-feb', 2, [
    ['acc-checking', 210000],
    ['acc-acciones', 72000],
    ['acc-xdwh', 110000],
    ['acc-iqqi', 31000],
    ['acc-aged', 20000],
  ])
  snapshot('snap-mar', 3, [
    ['acc-checking', 220000],
    ['acc-acciones', 73000],
    ['acc-xdwh', 160000],
    ['acc-iqqi', 32000],
    ['acc-aged', 21000],
    ['acc-plata', 52000],
    ...(options.brokerExists ? ([['acc-trade-republic', 15000]] as Array<[string, number]>) : []),
  ])

  const buy = (
    id: string,
    date: string,
    categoryAccount: string,
    amountMinor: number,
    units: string,
    instrumentId: string | null,
    symbol: string,
  ) => {
    sqlite
      .prepare(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, date, description, amount_minor, currency, created_at, updated_at) VALUES (?, ?, 'acc-checking', ?, 'investment', ?, ?, ?, 'EUR', ?, ?)`,
      )
      .run(id, USER, `cat-${categoryAccount}`, date, `Compra ${symbol}`, amountMinor, STAMP, STAMP)
    sqlite
      .prepare(
        `INSERT INTO investment_trade_details (id, user_id, transaction_id, instrument_id, symbol, side, quantity, price_minor, fee_minor, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'buy', ?, 10000, 0, 'EUR', ?, ?)`,
      )
      .run(`detail-${id}`, USER, id, instrumentId, symbol, units, STAMP, STAMP)
  }
  buy('xdwh-1', '2026-01-10', 'acc-xdwh', 100000, '10', 'inst-xdwh', 'XDWH')
  buy('xdwh-2', '2026-03-12', 'acc-xdwh', 50000, '5', null, 'XDWH')
  buy('iqqi-1', '2026-01-15', 'acc-iqqi', 30000, '3', 'inst-iqqi', 'IQQI')
  buy('aged-1', '2026-02-20', 'acc-aged', 20000, '2', 'inst-aged', 'AGED')
  buy('sxrs-1', '2026-01-18', 'acc-sxrs', 40000, '4', 'inst-sxrs', 'SXRS')
  buy('sxrs-2', '2026-03-20', 'acc-sxrs', 10000, '1', 'inst-sxrs', 'SXRS')
  buy('plata-1', '2026-03-05', 'acc-plata', 25000, '1', 'inst-plata', 'PLATA')
  buy('acciones-1', '2026-02-02', 'acc-acciones', 70000, '7', 'inst-acciones', 'AAPL')

  sqlite
    .prepare(
      `INSERT INTO contributions (id, user_id, date, amount_minor, currency, portfolio_date, portfolio_value_minor, flow_minor, created_at, updated_at) VALUES ('contrib-1', ?, '2026-01-20', 150000, 'EUR', '2026-01-20', 400000, 150000, ?, ?)`,
    )
    .run(USER, STAMP, STAMP)
  for (const [accountId, amountMinor] of [
    ['acc-xdwh', 100000],
    ['acc-iqqi', 30000],
    ['acc-acciones', 20000],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO contribution_allocations (id, user_id, contribution_id, account_id, amount_minor, currency, created_at) VALUES (?, ?, 'contrib-1', ?, ?, 'EUR', ?)`,
      )
      .run(`alloc-${accountId}`, USER, accountId, amountMinor, STAMP)
  }
}
