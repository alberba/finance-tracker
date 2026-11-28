import { INSTRUMENT_TYPE_LABEL } from '../../../domain/investment/instrument-labels'
import { groupByInstrument } from '../../../domain/investment/grouping'
import {
  accountOfMovement,
  instrumentOfMovement,
  type AccountPosition,
} from '../../../domain/investment/positions'
import type { InvestmentDashboardViewModel } from '../../../domain/investment/view-model'
import { formatDecimal, formatMoney } from '../../../lib/format'
import type { State, Transaction } from '../../../scripts/types'
import { groupByYear, isOperation, newestFirst, type AssetYear } from './movements'
import { resultFigures, UNPRICED_NOTE, type Tone } from './view-model'

// The detail of an instrument in Inversión (#561, ADR 0011): what it is (its
// symbol and type), what is held of it in each account, and its buys and sells.
// Its quote is the existing `NeonInvestmentQuote`, which reads the instrument
// by id; everything here is words and figures already formatted. The route is
// `/inversion?instrumento=<id>` (`instrumentHref`).

/** The figures of a holding of an instrument: one account's, or all of them summed. */
export interface InstrumentTotal {
  /** «4», units held. */
  units: string
  value: string
  invested: string
  /** «+120,00 €». */
  gain: string
  /** «+25,0 %». */
  ret: string
  tone: Tone
}

/** What one account holds of the instrument. */
export interface InstrumentPositionLine extends InstrumentTotal {
  accountId: string
  accountName: string
  /** The value is an estimate: the instrument has no quote. */
  estimated: boolean
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

function positionLine(position: AccountPosition, accountName: string): InstrumentPositionLine {
  return {
    accountId: position.accountId,
    accountName,
    units: formatDecimal(position.units),
    value: formatMoney(position.value),
    invested: formatMoney(position.invested),
    ...resultFigures(position),
    estimated: !position.priced,
  }
}

/** The instrument's positions summed over every account, as `groupByInstrument` does. */
function totalOf(positions: readonly AccountPosition[]): InstrumentTotal | null {
  const [group] = groupByInstrument(positions)
  if (!group) return null
  return {
    units: formatDecimal(group.units),
    value: formatMoney(group.value),
    invested: formatMoney(group.invested),
    ...resultFigures(group),
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
    unpricedNote: held.some((position) => !position.priced) ? UNPRICED_NOTE : null,
    count: `${operations.length} ${operations.length === 1 ? 'operación' : 'operaciones'}`,
    years: groupByYear(operations),
  }
}
