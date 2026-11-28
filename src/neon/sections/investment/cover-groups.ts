import { INSTRUMENT_TYPE_LABEL } from '../../../domain/investment/instrument-labels'
import {
  groupByInstrument,
  groupByType,
  type InstrumentGroup,
} from '../../../domain/investment/grouping'
import type { InvestmentDashboardViewModel } from '../../../domain/investment/view-model'
import { formatMoney, formatPercent, formatSignedMoney } from '../../../lib/format'
import type { InvestmentGrouping } from '../../../lib/investment-grouping'
import { signedPct, toneOf, type SortDirection, type SortKey, type Tone } from './view-model'

// The cover of Inversión grouped by instrument or by type (#562). By account
// is `accountRows`. A row here is an instrument summed over its accounts and
// opens the instrument's detail; a type has no detail of its own, so it is a
// section that heads its instruments. Weights are shares of what all the
// positions are worth, the same figure the instruments are summed from.

export interface InstrumentRow {
  /** The instrument's id: the row opens its detail. */
  id: string
  /** Its symbol. */
  name: string
  /** «Cripto», «ETF»… */
  typeLabel: string
  /** «2 cuentas»: where it is held. */
  holdings: string
  weight: string
  weightPct: number
  value: string
  gain: string
  ret: string
  tone: Tone
  /** The value is an estimate: some position has no quote. */
  estimated: boolean
  openLabel: string
  gainValue: number
}

export interface TypeSummary {
  weight: string
  weightPct: number
  value: string
  gain: string
  ret: string
  tone: Tone
  gainValue: number
}

export interface TypeSection {
  id: string
  /** «Cripto», «ETF»… */
  title: string
  summary: TypeSummary
  rows: InstrumentRow[]
}

const GROUPING_LABEL: Record<InvestmentGrouping, string> = {
  account: 'Cuenta',
  instrument: 'Instrumento',
  type: 'Tipo',
}

/** What the grouping menu offers, in order. */
export function groupingOptions(): { value: InvestmentGrouping; label: string }[] {
  return (Object.keys(GROUPING_LABEL) as InvestmentGrouping[]).map((value) => ({
    value,
    label: GROUPING_LABEL[value],
  }))
}

const TITLE: Record<InvestmentGrouping, string> = {
  account: 'Cuentas',
  instrument: 'Instrumentos',
  type: 'Tipos de instrumento',
}

/** The heading of the list for a grouping. */
export const groupingTitle = (grouping: InvestmentGrouping): string => TITLE[grouping]

function toRow(group: InstrumentGroup): InstrumentRow {
  return {
    id: group.instrumentId,
    name: group.symbol,
    typeLabel: INSTRUMENT_TYPE_LABEL[group.instrumentType],
    holdings: `${group.accounts} ${group.accounts === 1 ? 'cuenta' : 'cuentas'}`,
    weight: formatPercent(group.weight, { digits: 1 }),
    weightPct: group.weight,
    value: formatMoney(group.value),
    gain: formatSignedMoney(group.gain),
    ret: signedPct(group.returnPct),
    tone: toneOf(group.gain),
    estimated: !group.priced,
    openLabel: `Ver ${group.symbol}`,
    gainValue: group.gain,
  }
}

/** One row per instrument held, by value; one in several accounts is summed. */
export function instrumentRows(vm: InvestmentDashboardViewModel): InstrumentRow[] {
  return groupByInstrument(vm.positions).map(toRow)
}

/** One section per instrument type, by value, each with its instruments. */
export function typeSections(vm: InvestmentDashboardViewModel): TypeSection[] {
  return groupByType(vm.positions).map((group) => ({
    id: group.type,
    title: INSTRUMENT_TYPE_LABEL[group.type],
    summary: {
      weight: formatPercent(group.weight, { digits: 1 }),
      weightPct: group.weight,
      value: formatMoney(group.value),
      gain: formatSignedMoney(group.gain),
      ret: signedPct(group.returnPct),
      tone: toneOf(group.gain),
      gainValue: group.gain,
    },
    rows: group.instruments.map(toRow),
  }))
}

type Measured = { weightPct: number; gainValue: number }

/** Sorts by weight or by gain; the period's change belongs to accounts only. */
export function sortByKey<T>(
  items: readonly T[],
  key: SortKey,
  direction: SortDirection,
  measured: (item: T) => Measured,
): T[] {
  const sign = direction === 'asc' ? 1 : -1
  const measure = (item: T) =>
    key === 'gain' ? measured(item).gainValue : measured(item).weightPct
  return items.toSorted((a, b) => sign * (measure(a) - measure(b)))
}

/** The sections and the rows inside each, sorted. */
export function sortCover(
  sections: readonly TypeSection[],
  key: SortKey,
  direction: SortDirection,
): TypeSection[] {
  return sortByKey(sections, key, direction, (section) => section.summary).map((section) => ({
    ...section,
    rows: sortByKey(section.rows, key, direction, (row) => row),
  }))
}
