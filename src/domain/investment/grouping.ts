import { round2 } from '../../lib/number'
import type { InstrumentType } from '../../scripts/types'
import type { AccountPosition } from './positions'

// Agrupar posiciones (ADR 0011): la portada de Inversión puede mostrar la
// cartera por cuenta, por instrumento o por tipo de instrumento. Por cuenta ya
// es la vista de las cuentas; aquí están las otras dos, que suman las
// posiciones de un mismo instrumento entre cuentas y las de un mismo tipo.
// El tipo es el del instrumento, no el de la cuenta.
//
// El peso es la parte del valor de todas las posiciones, 0–100: una cuenta con
// capital sin instrumento (apertura, aportaciones por importe) no entra aquí,
// porque ese capital no es de ningún instrumento.

/** What is held of one instrument, summed over every account that holds it. */
export interface InstrumentGroup {
  instrumentId: string
  symbol: string
  instrumentType: InstrumentType
  units: number
  invested: number
  value: number
  gain: number
  returnPct: number
  /** Share of the value of all positions, 0–100. */
  weight: number
  /** How many accounts hold it. */
  accounts: number
  /** Every position has a quote; otherwise the value is an estimate. */
  priced: boolean
}

/** The instruments of one type, with their figures summed. */
export interface TypeGroup {
  type: InstrumentType
  invested: number
  value: number
  gain: number
  returnPct: number
  weight: number
  /** By value. */
  instruments: InstrumentGroup[]
}

const returnOf = (gain: number, invested: number): number =>
  invested <= 0 ? 0 : (gain / invested) * 100

/** One row per instrument, by value; the positions of an instrument in several accounts add up. */
export function groupByInstrument(positions: readonly AccountPosition[]): InstrumentGroup[] {
  const byInstrument = new Map<string, AccountPosition[]>()
  for (const position of positions) {
    const own = byInstrument.get(position.instrumentId)
    if (own) own.push(position)
    else byInstrument.set(position.instrumentId, [position])
  }
  const total = positions.reduce((sum, position) => sum + position.value, 0)
  return [...byInstrument.values()]
    .map((own) => {
      const sum = (pick: (position: AccountPosition) => number) =>
        own.reduce((acc, position) => acc + pick(position), 0)
      const invested = round2(sum((position) => position.invested))
      const value = round2(sum((position) => position.value))
      const gain = round2(value - invested)
      return {
        instrumentId: own[0].instrumentId,
        symbol: own[0].symbol,
        instrumentType: own[0].instrumentType,
        units: sum((position) => position.units),
        invested,
        value,
        gain,
        returnPct: returnOf(gain, invested),
        weight: total > 0 ? (value / total) * 100 : 0,
        accounts: own.length,
        priced: own.every((position) => position.priced),
      }
    })
    .toSorted((a, b) => b.value - a.value)
}

/** One group per instrument type, by value, each with its instruments. */
export function groupByType(positions: readonly AccountPosition[]): TypeGroup[] {
  const byType = new Map<InstrumentType, InstrumentGroup[]>()
  for (const group of groupByInstrument(positions)) {
    const own = byType.get(group.instrumentType)
    if (own) own.push(group)
    else byType.set(group.instrumentType, [group])
  }
  return [...byType.entries()]
    .map(([type, instruments]) => {
      const invested = round2(instruments.reduce((sum, item) => sum + item.invested, 0))
      const value = round2(instruments.reduce((sum, item) => sum + item.value, 0))
      const gain = round2(value - invested)
      return {
        type,
        invested,
        value,
        gain,
        returnPct: returnOf(gain, invested),
        weight: instruments.reduce((sum, item) => sum + item.weight, 0),
        instruments,
      }
    })
    .toSorted((a, b) => b.value - a.value)
}
