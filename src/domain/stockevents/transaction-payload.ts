import type {
  StockEventsSettings,
  StockEventsSymbolMapping,
  Transaction,
} from '../../scripts/types'

export interface StockEventsTransactionPayload {
  watchlistId: string
  symbol: string
  date: string
  change: number
  price: number
  priceCurrency: string
  feesAmount?: number
  feesCurrency?: string
  notes?: string
  toCash?: boolean
  type: 'buy' | 'sell' | 'DEFAULT'
}

export interface StockEventsCashTransactionInput {
  watchlistId: string
  date: string
  amount: number
  currency: string
  accountName?: string
}

export function findSyncedMapping(
  settings: StockEventsSettings,
  symbol: string | undefined,
): StockEventsSymbolMapping | null {
  if (!settings.enabled || !settings.apiKey || !symbol) {
    return null
  }
  const normalized = symbol.trim().toUpperCase()
  const mapping = settings.symbolMappings.find((item) => item.symbol === normalized)
  return mapping && mapping.sync && mapping.watchlistId ? mapping : null
}

export function buildStockEventsTransactionPayload(
  tx: Transaction,
  watchlistId: string,
  targetSymbol = '',
  toCash = false,
): StockEventsTransactionPayload | null {
  if (tx.type !== 'investment' || !tx.symbol || !watchlistId) {
    return null
  }
  const units = Number(tx.units)
  const price = Number(tx.unitPrice)
  if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price <= 0) {
    return null
  }
  const side: 'buy' | 'sell' = tx.side === 'sell' ? 'sell' : 'buy'
  const currency = (tx.movementCurrency || 'EUR').toUpperCase().slice(0, 3)
  const fee = Number(tx.fee)
  return {
    watchlistId,
    symbol: (targetSymbol.trim() || tx.symbol).trim().toUpperCase(),
    date: buildIsoDate(tx.date, tx.time),
    change: side === 'sell' ? -units : units,
    price,
    priceCurrency: currency,
    ...(Number.isFinite(fee) && fee > 0 ? { feesAmount: fee, feesCurrency: currency } : {}),
    notes: 'Sincronizado desde finance-tracker',
    ...(toCash ? { toCash: true } : {}),
    type: side,
  }
}

export function buildStockEventsCashTransactionPayload(
  input: StockEventsCashTransactionInput,
): StockEventsTransactionPayload | null {
  const watchlistId = input.watchlistId.trim()
  const amount = Math.round(Number(input.amount) * 100) / 100
  const currency = input.currency.trim().toUpperCase().slice(0, 3)
  if (!watchlistId || !Number.isFinite(amount) || amount <= 0 || currency.length !== 3) {
    return null
  }
  const accountName = input.accountName?.trim()
  return {
    watchlistId,
    symbol: `CASH_${currency}`,
    date: buildIsoDate(input.date, undefined),
    change: 1,
    price: amount,
    priceCurrency: currency,
    toCash: true,
    ...(accountName ? { notes: `Aporte desde finance-tracker · ${accountName}` } : {}),
    type: 'DEFAULT',
  }
}

function buildIsoDate(date: string, time: string | undefined): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : date.slice(0, 10)
  const safeTime = time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00'
  return `${safeDate}T${safeTime}:00Z`
}
