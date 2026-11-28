import { Schema } from 'effect'

// How the cover of Inversión groups its positions (#562): by account (the
// default), by instrument or by instrument type. It is a synced preference.
export const INVESTMENT_GROUPINGS = ['account', 'instrument', 'type'] as const

export const investmentGroupingSchema = Schema.Literals(INVESTMENT_GROUPINGS)

export type InvestmentGrouping = Schema.Schema.Type<typeof investmentGroupingSchema>

export const DEFAULT_INVESTMENT_GROUPING: InvestmentGrouping = 'account'

/** The stored grouping, or null when it is missing or not one of the three (the default applies). */
export function parseInvestmentGrouping(value: unknown): InvestmentGrouping | null {
  return INVESTMENT_GROUPINGS.find((grouping) => grouping === value) ?? null
}
