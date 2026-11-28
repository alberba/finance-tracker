import { INSTRUMENT_TYPE_LABEL } from '../../../domain/investment/instrument-labels'
import {
  accountOfMovement,
  instrumentOfMovement,
  type AccountPosition,
} from '../../../domain/investment/positions'
import type { InvestmentDashboardViewModel } from '../../../domain/investment/view-model'
import { formatDecimal, formatMoney, formatSignedMoney } from '../../../lib/format'
import type { State, Transaction } from '../../../scripts/types'
import { groupByYear, isOperation, newestFirst, type AssetYear } from './asset-view-model'
import { signedPct, toneOf, type Tone } from './view-model'

// The detail of an instrument in Inversión (#561, ADR 0011): what it is (its
// symbol and type), what is held of it in each account, and its buys and sells.
// Its quote is the existing `NeonInvestmentQuote`, which reads the instrument
// by id; everything here is words and figures already formatted. The route is
// `/inversion?instrumento=<id>` (`instrumentHref`).

/** What is held of the instrument in one account. */
export interface InstrumentPositionLine {
  accountId: string
  accountName: string
  /** «4», units held. */
  units: string
  value: string
  invested: string
  /** «+120,00 €». */
  gain: string
  /** «+25,0 %». */
  ret: string
  tone: Tone
  /** The value is an estimate: the instrument has no quote. */
  estimated: boolean
}

/** The same figures summed over every account. */
export interface InstrumentTotal {
  units: string
  value: string
  invested: string
  gain: string
  ret: string
  tone: Tone
}

export interface InstrumentDetail {
  id: string
  symbol: string
  /** «Cripto», «ETF»… */
  typeLabel: string
  /** By value, one line per account that holds it. */
  positions: InstrumentPositionLine[]
  /** Null when no account holds it (sold out, or never bought). */
  total: InstrumentTotal | null
  /** Some position has no quote: its value is its share of the account's. */
  unpricedNote: string | null
  /** «4 operaciones». */
  count: string
  years: AssetYear[]
}

const round2 = (value: number) => Math.round(value * 100) / 100

function figures(gain: number, invested: number) {
  return {
    gain: formatSignedMoney(gain),
    ret: invested > 0 ? signedPct((gain / invested) * 100) : '',
    tone: toneOf(gain),
  }
}

function positionLine(position: AccountPosition, accountName: string): InstrumentPositionLine {
  return {
    accountId: position.accountId,
    accountName,
    units: formatDecimal(position.units),
    value: formatMoney(position.value),
    invested: formatMoney(position.invested),
    ...figures(position.gain, position.invested),
    estimated: !position.priced,
  }
}

function totalOf(positions: readonly AccountPosition[]): InstrumentTotal | null {
  if (!positions.length) return null
  const sum = (pick: (position: AccountPosition) => number) =>
    positions.reduce((total, position) => total + pick(position), 0)
  const invested = sum((position) => position.invested)
  const value = sum((position) => position.value)
  return {
    units: formatDecimal(sum((position) => position.units)),
    value: formatMoney(round2(value)),
    invested: formatMoney(round2(invested)),
    ...figures(round2(value - invested), invested),
  }
}

/** The buys and sells of an instrument, whichever account they landed in. */
function instrumentOperations(state: State, instrumentId: string): Transaction[] {
  return state.transactions
    .filter(
      (tx): tx is Transaction =>
        tx.type === 'investment' &&
        isOperation(tx) &&
        instrumentOfMovement(state, tx, accountOfMovement(state, tx) ?? '')?.id === instrumentId,
    )
    .sort(newestFirst)
}

/** What an instrument's detail shows. Null when the instrument does not exist. */
export function instrumentDetail(
  state: State,
  vm: InvestmentDashboardViewModel,
  instrumentId: string,
): InstrumentDetail | null {
  const instrument = state.instruments.find((item) => item.id === instrumentId)
  if (!instrument) return null
  const held = vm.positions
    .filter((position) => position.instrumentId === instrumentId)
    .toSorted((a, b) => b.value - a.value)
  const operations = instrumentOperations(state, instrumentId)

  return {
    id: instrument.id,
    symbol: instrument.symbol,
    typeLabel: INSTRUMENT_TYPE_LABEL[instrument.type],
    positions: held.map((position) =>
      positionLine(
        position,
        state.investmentAssets.find((account) => account.id === position.accountId)?.name ??
          position.accountId,
      ),
    ),
    total: totalOf(held),
    unpricedNote: held.some((position) => !position.priced)
      ? 'Sin cotización: el valor es la parte que le toca del valor de la cuenta.'
      : null,
    count: `${operations.length} ${operations.length === 1 ? 'operación' : 'operaciones'}`,
    years: groupByYear(operations),
  }
}
