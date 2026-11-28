import { round2 } from '../../lib/number'
import { movementBelongsToInvestmentAsset, type Entity } from '../../lib/finance-core'
import type { MonthOrStart } from '../../lib/month'
import type { Instrument, InstrumentType, State, Transaction } from '../../scripts/types'
import { computeInvestmentValue } from './calculations'
import { symbolsMatchInstrument } from './symbol-matching'
import { quoteUnitPrice } from './valuation'

// Posiciones (ADR 0011): lo que se tiene de un instrumento en una cuenta de
// inversión. Una cuenta no es un activo y no lleva símbolo; sus posiciones sí.
//
// La clave es (cuenta, instrumento). Este módulo es la base de las vistas por
// cuenta, por instrumento y por tipo: devuelve la lista plana y cada vista
// agrupa o filtra sobre ella. «Cuenta de inversión» es hoy una entrada de
// `state.investmentAssets`.

export interface AccountPosition {
  accountId: string
  instrumentId: string
  /** Visible ticker of the instrument. */
  symbol: string
  instrumentType: InstrumentType
  /** Units held at the end of the month, from buys and sells. Always above zero. */
  units: number
  /** Average buy price per unit; null when the position has no buys. */
  averagePrice: number | null
  /** What went in net of sales, from the movements that make the position. */
  invested: number
  /** Units × quote when the instrument has one; otherwise its share of the account's value. */
  value: number
  /** The value comes from a quote. Without it the value is an estimate. */
  priced: boolean
  gain: number
  returnPct: number
  /** Share of the value of the account's positions, 0–100. */
  weight: number
  /** ISO date of the latest movement up to the month. */
  lastMovementDate: string
}

export interface PositionOptions {
  /** Value positions with the instruments' quotes. Quotes are today's: leave it off for a past month. */
  quotes?: boolean
  fxRates?: Record<string, number>
  /**
   * What one unit of an instrument was worth, in the base currency, by
   * instrument id. It takes the place of the quote, for the instruments it names,
   * so a past month can be valued at its own close.
   */
  unitPrices?: Record<string, number>
}

interface Holding {
  accountId: string
  instrument: Instrument
  units: number
  boughtUnits: number
  boughtCost: number
  invested: number
  lastMovementDate: string
}

const round8 = (value: number): number => Math.round(value * 1e8) / 1e8

/**
 * The investment account a movement belongs to: its explicit destination
 * account, then its instrument's account, then its category (legacy). The rule
 * lives in `movementBelongsToInvestmentAsset`, shared with the account's value.
 */
export function accountOfMovement(state: State, tx: Transaction): string | null {
  const assets = state.investmentAssets as Entity[]
  const account = assets.find((asset) =>
    movementBelongsToInvestmentAsset(tx, asset, assets, state.instruments),
  )
  return account?.id ?? null
}

/**
 * The instrument a movement trades: the linked one or, for a movement that
 * carries only a symbol, the instrument with that symbol (the one in the
 * movement's own account first).
 */
export function instrumentOfMovement(
  state: State,
  tx: Transaction,
  accountId: string,
): Instrument | null {
  if (tx.instrumentId) {
    const linked = state.instruments.find((item) => item.id === tx.instrumentId)
    if (linked) return linked
  }
  if (!tx.symbol) return null
  const matches = state.instruments.filter((item) => symbolsMatchInstrument(tx.symbol, item))
  return (
    matches.find((item) => item.investmentAssetId === accountId && item.active) ??
    matches.find((item) => item.investmentAssetId === accountId) ??
    matches.find((item) => item.active) ??
    matches[0] ??
    null
  )
}

function collectHoldings(state: State, month: MonthOrStart): Holding[] {
  const holdings = new Map<string, Holding>()
  const movements = state.transactions
    .filter((tx) => tx.type === 'investment' && Number(tx.month) <= month)
    .toSorted((a, b) => String(a.date).localeCompare(String(b.date)))
  for (const tx of movements) {
    const units = Number(tx.units)
    if (!tx.side || !Number.isFinite(units) || units <= 0) continue
    const accountId = accountOfMovement(state, tx)
    if (!accountId) continue
    const instrument = instrumentOfMovement(state, tx, accountId)
    if (!instrument) continue
    const key = `${accountId}\u0000${instrument.id}`
    const holding = holdings.get(key) ?? {
      accountId,
      instrument,
      units: 0,
      boughtUnits: 0,
      boughtCost: 0,
      invested: 0,
      lastMovementDate: '',
    }
    holdings.set(key, holding)
    holding.invested += Number(tx.amount) || 0
    holding.lastMovementDate = tx.date
    if (tx.side === 'sell') {
      holding.units -= units
    } else {
      holding.units += units
      holding.boughtUnits += units
      holding.boughtCost += units * Number(tx.unitPrice || 0)
    }
  }
  return [...holdings.values()].filter((holding) => round8(holding.units) > 0)
}

function toReturnPct(gain: number, invested: number): number {
  return invested <= 0 ? 0 : (gain / invested) * 100
}

/**
 * The positions of every investment account at the end of a month, by account
 * in the state's order and by value within it.
 *
 * Movements without an instrument or without units add to the account's value
 * and capital but make no position; a position left with no units is not listed.
 * A position with a quote is worth units × price; the rest share what the
 * quoted ones leave of the account's value in proportion to what they cost
 * (the capital of movements that are no position keeps its own share).
 */
export function buildAccountPositions(
  state: State,
  month: MonthOrStart,
  options: PositionOptions = {},
): AccountPosition[] {
  const baseCurrency = String(state.currency || 'EUR').toUpperCase()
  const holdings = collectHoldings(state, month)
  const positions: AccountPosition[] = []

  for (const account of state.investmentAssets) {
    const own = holdings.filter((holding) => holding.accountId === account.id)
    if (!own.length) continue

    const unitPrices = own.map((holding) => {
      const given = options.unitPrices?.[holding.instrument.id]
      if (given !== undefined) return given
      return options.quotes
        ? quoteUnitPrice(
            state.quotes[holding.instrument.id],
            holding.instrument,
            baseCurrency,
            options.fxRates,
          )
        : null
    })
    const quotedValue = own.reduce(
      (sum, holding, index) => sum + holding.units * (unitPrices[index] ?? 0),
      0,
    )
    const positionalInvested = own.reduce((sum, holding) => sum + holding.invested, 0)
    // Capital the account carries that no position explains: the opening balance
    // and the movements without instrument or units.
    const accountInvested = state.transactions.reduce(
      (sum, tx) =>
        tx.type === 'investment' &&
        Number(tx.month) <= month &&
        accountOfMovement(state, tx) === account.id
          ? sum + (Number(tx.amount) || 0)
          : sum,
      Number(account.openingBalance || 0),
    )
    const otherInvested = accountInvested - positionalInvested
    const unquotedInvested = own.reduce(
      (sum, holding, index) =>
        unitPrices[index] === null ? sum + Math.max(0, holding.invested) : sum,
      0,
    )
    const accountValue = computeInvestmentValue(state, account.id, month)
    const estimate = Math.max(0, accountValue - quotedValue)
    const estimateBase = unquotedInvested + Math.max(0, otherInvested)

    const rows = own.map((holding, index) => {
      const price = unitPrices[index]
      const priced = price !== null
      const value = priced
        ? holding.units * price
        : estimateBase > 0
          ? (estimate * Math.max(0, holding.invested)) / estimateBase
          : 0
      const gain = round2(value - holding.invested)
      return {
        accountId: account.id,
        instrumentId: holding.instrument.id,
        symbol: holding.instrument.symbol,
        instrumentType: holding.instrument.type,
        units: round8(holding.units),
        averagePrice: holding.boughtUnits > 0 ? holding.boughtCost / holding.boughtUnits : null,
        invested: round2(holding.invested),
        value: round2(value),
        priced,
        gain,
        returnPct: toReturnPct(gain, holding.invested),
        weight: 0,
        lastMovementDate: holding.lastMovementDate,
      }
    })
    const total = rows.reduce((sum, row) => sum + row.value, 0)
    for (const row of rows) row.weight = total > 0 ? (row.value / total) * 100 : 0
    positions.push(...rows.toSorted((a, b) => b.value - a.value))
  }
  return positions
}
