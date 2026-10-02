import type { Instrument, Quote, State, Transaction } from '../../scripts/types'
import { round2 } from '../../lib/number'
import { symbolsMatchInstrument } from './symbol-matching'

export interface InstrumentValuation {
  instrument: Instrument
  quote: Quote | null
  units: number
  value: number
  dailyChangePercent: number | null
  isStale: boolean
  status: 'fresh' | 'stale' | 'unavailable'
}

export interface PortfolioValuation {
  baseCurrency: string
  totalValue: number
  dailyChangePercent: number | null
  instruments: InstrumentValuation[]
  byAsset: Record<string, number>
}

export interface ValuationOptions {
  now?: Date
  maxAgeMinutes?: number
  fxRates?: Record<string, number>
}

export function calculateInstrumentUnits(
  instrument: Instrument,
  transactions: Transaction[],
): number {
  const hasCurrentSnapshot = hasCurrentHoldingsSnapshot(instrument, transactions)
  const startingUnits = hasCurrentSnapshot
    ? Number(instrument.holdingUnits)
    : Number(instrument.openingUnits || 0)
  return round8(
    startingUnits + transactions.reduce((total, transaction) => {
      if (
        !isTransactionForInstrument(transaction, instrument, transactions) ||
        !isTransactionAfterHoldingsCutoff(transaction, instrument, hasCurrentSnapshot)
      ) return total
      const units = Number(transaction.units || 0)
      if (!Number.isFinite(units) || units <= 0) return total
      return total + (transaction.side === 'sell' ? -units : units)
    }, 0),
  )
}

function hasCurrentHoldingsSnapshot(instrument: Instrument, transactions: Transaction[]): boolean {
  if (instrument.holdingUnits === undefined || !instrument.holdingsUpdatedAt) return false
  if (instrument.holdingsSource === 'manual') return true
  // Snapshots without source are legacy data. If movements already exist for
  // the instrument, prefer those movements to avoid double counting them.
  return !transactions.some(
    (transaction) =>
      transaction.type === 'investment' &&
      (transaction.instrumentId === instrument.id ||
        (symbolsMatchInstrument(transaction.symbol, instrument) && !transaction.instrumentId)),
  )
}

function isTransactionAfterHoldingsCutoff(
  transaction: Transaction,
  instrument: Instrument,
  hasCurrentSnapshot: boolean,
): boolean {
  if (!hasCurrentSnapshot) return true
  if (
    transaction.createdAt &&
    instrument.holdingsUpdatedAt &&
    Date.parse(transaction.createdAt) <= Date.parse(instrument.holdingsUpdatedAt)
  ) return false
  if (transaction.createdAt && instrument.holdingsUpdatedAt) return true
  return Boolean(instrument.holdingsAsOf && transaction.date > instrument.holdingsAsOf)
}

function isTransactionForInstrument(
  transaction: Transaction,
  instrument: Instrument,
  transactions: Transaction[],
): boolean {
  if (transaction.type !== 'investment') return false
  const hasExplicitLinks = transactions.some(
    (candidate) => candidate.type === 'investment' && candidate.instrumentId === instrument.id,
  )
  if (hasExplicitLinks) return transaction.instrumentId === instrument.id
  return symbolsMatchInstrument(transaction.symbol, instrument) && !transaction.instrumentId
}

export function buildPortfolioValuation(
  state: Pick<State, 'currency' | 'instruments' | 'quotes' | 'transactions'>,
  options: ValuationOptions = {},
): PortfolioValuation {
  const baseCurrency = String(state.currency || 'EUR').toUpperCase()
  const now = options.now || new Date()
  const maxAgeMinutes = options.maxAgeMinutes ?? 15
  const valuations = state.instruments
    .filter((instrument) => instrument.active)
    .map((instrument) => buildInstrumentValuation(state, instrument, baseCurrency, now, maxAgeMinutes, options.fxRates || {}))

  const byAsset: Record<string, number> = {}
  valuations.forEach((valuation) => {
    byAsset[valuation.instrument.investmentAssetId] = round2(
      (byAsset[valuation.instrument.investmentAssetId] || 0) + valuation.value,
    )
  })

  const totalValue = round2(valuations.reduce((total, valuation) => total + valuation.value, 0))
  const dailyChangePercent = calculateWeightedChange(valuations)
  return { baseCurrency, totalValue, dailyChangePercent, instruments: valuations, byAsset }
}

function buildInstrumentValuation(
  state: Pick<State, 'quotes' | 'transactions'>,
  instrument: Instrument,
  baseCurrency: string,
  now: Date,
  maxAgeMinutes: number,
  fxRates: Record<string, number>,
): InstrumentValuation {
  const quote = state.quotes[instrument.id] || null
  const units = calculateInstrumentUnits(instrument, state.transactions)
  const quoteCurrency = quote?.currency || instrument.currency || baseCurrency
  const exchangeRate = getExchangeRate(quoteCurrency, baseCurrency, fxRates)
  const value = quote && quote.status !== 'unavailable' ? round2(units * quote.price * exchangeRate) : 0
  const staleByAge = quote ? isQuoteStale(quote, now, maxAgeMinutes) : true
  const status = !quote || quote.status === 'unavailable'
    ? 'unavailable'
    : staleByAge || quote.isStale
      ? 'stale'
      : 'fresh'

  return {
    instrument,
    quote,
    units,
    value,
    dailyChangePercent: quote?.changePercent ?? null,
    isStale: status !== 'fresh',
    status,
  }
}

export function isQuoteStale(quote: Quote, now = new Date(), maxAgeMinutes = 15): boolean {
  const timestamp = Date.parse(quote.timestamp)
  if (!Number.isFinite(timestamp)) return true
  return now.getTime() - timestamp > maxAgeMinutes * 60_000
}

function getExchangeRate(fromCurrency: string, toCurrency: string, fxRates: Record<string, number>): number {
  if (fromCurrency === toCurrency) return 1
  const rate = Number(fxRates[`${fromCurrency}/${toCurrency}`] || fxRates[fromCurrency])
  return Number.isFinite(rate) && rate > 0 ? rate : 1
}

function calculateWeightedChange(valuations: InstrumentValuation[]): number | null {
  const priced = valuations.filter((valuation) => valuation.value > 0 && valuation.dailyChangePercent !== null)
  const denominator = priced.reduce((total, valuation) => total + valuation.value, 0)
  if (!denominator) return null
  return round2(
    priced.reduce(
      (total, valuation) => total + valuation.value * Number(valuation.dailyChangePercent || 0),
      0,
    ) / denominator,
  )
}

function round8(value: number): number {
  return Math.round((Number(value) || 0) * 100_000_000) / 100_000_000
}
