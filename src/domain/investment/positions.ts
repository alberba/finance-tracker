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
  /** Only this account: the others are not computed. */
  accountId?: string
}

/** What an account holds with no instrument: capital and the part of its value that goes with it. */
export interface UninstrumentedHolding {
  accountId: string
  invested: number
  value: number
}

/** Below this many currency units a leftover is rounding dust, not a holding to show. */
const NEGLIGIBLE_AMOUNT = 0.5

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

interface AccountMovements {
  holdings: Holding[]
  /** Opening balance plus every investment movement up to the month, by account. */
  invested: Map<string, number>
}

/** One pass over the movements up to the month: what each account holds and what went into it. */
function collectMovements(state: State, month: MonthOrStart): AccountMovements {
  const invested = new Map<string, number>(
    state.investmentAssets.map((asset) => [asset.id, Number(asset.openingBalance || 0)]),
  )
  const owned = state.transactions
    .filter((tx) => tx.type === 'investment' && Number(tx.month) <= month)
    .map((tx) => ({ tx, accountId: accountOfMovement(state, tx) }))
  for (const { tx, accountId } of owned) {
    if (accountId) invested.set(accountId, (invested.get(accountId) ?? 0) + (Number(tx.amount) || 0))
  }

  const holdings = new Map<string, Holding>()
  const byDate = owned.toSorted((a, b) => String(a.tx.date).localeCompare(String(b.tx.date)))
  for (const { tx, accountId } of byDate) {
    const units = Number(tx.units)
    if (!tx.side || !Number.isFinite(units) || units <= 0) continue
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
  return {
    holdings: [...holdings.values()].filter((holding) => round8(holding.units) > 0),
    invested,
  }
}

function toReturnPct(gain: number, invested: number): number {
  return invested <= 0 ? 0 : (gain / invested) * 100
}

interface AccountBreakdown {
  positions: AccountPosition[]
  other: UninstrumentedHolding
}

/**
 * Splits each investment account's value between its positions and what no
 * position explains. A position with a quote is worth units × price; the rest
 * share what the quoted ones leave of the account's value in proportion to what
 * they cost, and the capital of movements that are no position keeps its own
 * share.
 */
function breakdownAccounts(
  state: State,
  month: MonthOrStart,
  options: PositionOptions,
): AccountBreakdown[] {
  const baseCurrency = String(state.currency || 'EUR').toUpperCase()
  const { holdings, invested } = collectMovements(state, month)
  const breakdowns: AccountBreakdown[] = []

  for (const account of state.investmentAssets) {
    if (options.accountId !== undefined && account.id !== options.accountId) continue
    const own = holdings.filter((holding) => holding.accountId === account.id)

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
    const otherInvested = (invested.get(account.id) ?? 0) - positionalInvested
    const unquotedInvested = own.reduce(
      (sum, holding, index) =>
        unitPrices[index] === null ? sum + Math.max(0, holding.invested) : sum,
      0,
    )
    const accountValue = computeInvestmentValue(state, account.id, month)
    const estimate = Math.max(0, accountValue - quotedValue)
    const estimateBase = unquotedInvested + Math.max(0, otherInvested)
    const estimated = (capital: number) =>
      estimateBase > 0 ? (estimate * Math.max(0, capital)) / estimateBase : 0

    const rows = own.map((holding, index) => {
      const price = unitPrices[index]
      const priced = price !== null
      const value = priced ? holding.units * price : estimated(holding.invested)
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
    breakdowns.push({
      positions: rows.toSorted((a, b) => b.value - a.value),
      other: {
        accountId: account.id,
        invested: round2(otherInvested),
        value: round2(estimated(otherInvested)),
      },
    })
  }
  return breakdowns
}

/**
 * The positions of every investment account at the end of a month, by account
 * in the state's order and by value within it, and what the accounts hold that
 * no position explains.
 *
 * Movements without an instrument or without units add to the account's value
 * and capital but make no position: they come back as `uninstrumented`, for the
 * accounts where it is not negligible (the opening balance counts with them).
 * A position left with no units is not listed.
 */
export function buildAccountHoldings(
  state: State,
  month: MonthOrStart,
  options: PositionOptions = {},
): { positions: AccountPosition[]; uninstrumented: UninstrumentedHolding[] } {
  const breakdowns = breakdownAccounts(state, month, options)
  return {
    positions: breakdowns.flatMap(({ positions }) => positions),
    uninstrumented: breakdowns
      .map(({ other }) => other)
      .filter(
        (other) =>
          Math.abs(other.invested) >= NEGLIGIBLE_AMOUNT ||
          Math.abs(other.value) >= NEGLIGIBLE_AMOUNT,
      ),
  }
}

/** The positions alone (see `buildAccountHoldings`). */
export function buildAccountPositions(
  state: State,
  month: MonthOrStart,
  options: PositionOptions = {},
): AccountPosition[] {
  return buildAccountHoldings(state, month, options).positions
}

/** What accounts hold with no instrument alone (see `buildAccountHoldings`). */
export function buildUninstrumentedHoldings(
  state: State,
  month: MonthOrStart,
  options: PositionOptions = {},
): UninstrumentedHolding[] {
  return buildAccountHoldings(state, month, options).uninstrumented
}
