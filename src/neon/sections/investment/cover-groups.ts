import { INSTRUMENT_TYPE_LABEL } from '../../../domain/investment/instrument-labels'
import {
  groupByInstrument,
  groupByType,
  type InstrumentGroup,
} from '../../../domain/investment/grouping'
import type { InvestmentDashboardViewModel } from '../../../domain/investment/view-model'
import { formatMoney, formatPercent } from '../../../lib/format'
import type { InvestmentGrouping } from '../../../lib/investment-grouping'
import type { Month } from '../../../lib/month'
import type { State } from '../../../scripts/types'
import type { ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import {
  accountRows,
  resultFigures,
  sortByKey,
  sortKeyFor,
  type AccountRow,
  type HoldingFigures,
  type SortDirection,
  type SortKey,
} from './view-model'

// The cover of Inversión grouped by instrument or by type (#562). By account
// is `accountRows`. A row here is an instrument summed over its accounts and
// opens the instrument's detail; a type has no detail of its own, so it is a
// section that heads its instruments. Weights are shares of what all the
// positions are worth, the same figure the instruments are summed from.

export interface InstrumentRow extends HoldingFigures {
  /** The instrument's id: the row opens its detail. */
  id: string
  /** Its symbol. */
  name: string
  /** «Cripto», «ETF»… */
  typeLabel: string
  /** «2 cuentas»: where it is held. */
  holdings: string
  /** The value is an estimate: some position has no quote. */
  estimated: boolean
  openLabel: string
}

export interface TypeSection {
  id: string
  /** «Cripto», «ETF»… */
  title: string
  summary: HoldingFigures
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

/** The grouping menu of the cover: its button's text («Por cuenta») and its options. */
export function groupingMenu(grouping: InvestmentGrouping): {
  text: string
  groups: ChoiceGroup<InvestmentGrouping>[]
} {
  const options = groupingOptions()
  const current = options.find((option) => option.value === grouping)
  return {
    text: `Por ${current?.label.toLowerCase()}`,
    groups: [{ key: 'grouping', options, value: grouping }],
  }
}

const TITLE: Record<InvestmentGrouping, string> = {
  account: 'Cuentas',
  instrument: 'Instrumentos',
  type: 'Tipos de instrumento',
}

/** The heading of the list for a grouping. */
export const groupingTitle = (grouping: InvestmentGrouping): string => TITLE[grouping]

/** The figures a row and a section of a type share: weight, value and result. */
function groupFigures(
  group: Pick<InstrumentGroup, 'weight' | 'value' | 'gain' | 'invested' | 'returnPct'>,
): HoldingFigures {
  return {
    weight: formatPercent(group.weight, { digits: 1 }),
    weightPct: group.weight,
    value: formatMoney(group.value),
    ...resultFigures(group),
    gainValue: group.gain,
  }
}

function toRow(group: InstrumentGroup): InstrumentRow {
  return {
    id: group.instrumentId,
    name: group.symbol,
    typeLabel: INSTRUMENT_TYPE_LABEL[group.instrumentType],
    holdings: `${group.accounts} ${group.accounts === 1 ? 'cuenta' : 'cuentas'}`,
    ...groupFigures(group),
    estimated: !group.priced,
    openLabel: `Ver ${group.symbol}`,
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
    summary: groupFigures(group),
    rows: group.instruments.map(toRow),
  }))
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

/**
 * The rows of the cover for the grouping the user chose, sorted: the one list
 * every layout shows. A union, so a layout reads `rows` or `sections` by
 * `grouping` and nothing else.
 */
export type CoverList =
  | { grouping: 'account'; rows: AccountRow[] }
  | { grouping: 'instrument'; rows: InstrumentRow[] }
  | { grouping: 'type'; sections: TypeSection[] }

export function coverList(
  grouping: InvestmentGrouping,
  source: { state: State; vm: InvestmentDashboardViewModel; month: Month },
  sort: { key: SortKey; direction: SortDirection },
): CoverList {
  const key = sortKeyFor(grouping, sort.key)
  const { direction } = sort
  switch (grouping) {
    case 'account':
      return {
        grouping,
        rows: sortByKey(
          accountRows(source.state, source.vm, source.month),
          key,
          direction,
          (row) => row,
        ),
      }
    case 'instrument':
      return {
        grouping,
        rows: sortByKey(instrumentRows(source.vm), key, direction, (row) => row),
      }
    case 'type':
      return { grouping, sections: sortCover(typeSections(source.vm), key, direction) }
  }
}
