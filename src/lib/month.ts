/** Calendar month, 1 (January) to 12 (December), as in D1 and sync commands. */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** Validates a value at the edge (user input, ISO date, D1 row); null when it is no month. */
export function asMonth(value: unknown): Month | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12
    ? (value as Month)
    : null
}

export const ALL_MONTHS: readonly Month[] = Array.from({ length: 12 }, (_, i) => (i + 1) as Month)

/** Slot of a month in a 12-position array. The only place a month is turned into a 0-based index. */
export function monthIndex(month: Month): number {
  return month - 1
}

/** The month of a `Date`, the other 0-based edge besides arrays. */
export function monthFromDate(date: Date): Month {
  return (date.getMonth() + 1) as Month
}

/** The element of a 12-position array (budget plan, monthly totals) that belongs to a month. */
export function atMonth<T>(slots: readonly T[], month: Month): T {
  return slots[monthIndex(month)]
}

/** Before January: the balance of a year's opening figures, ahead of any movement or snapshot. */
export const YEAR_START = 0

/** A month, or `YEAR_START` for the opening figures the year starts with. */
export type MonthOrStart = Month | typeof YEAR_START
