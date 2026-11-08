import { describe, expect, it } from 'vitest'

import {
  accountingYear,
  buildMonthGroups,
  categoryBreakdown,
  foldMonthGroups,
  hasTypeRestriction,
  monthTotals,
  registryYears,
  type MonthGroup,
  type RegistryFilters,
} from '../../src/domain/transactions/registry'
import type { Month } from '../../src/lib/month'
import type { Transaction, TransactionType } from '../../src/scripts/types'

function tx(
  id: string,
  date: string,
  type: TransactionType,
  amount: number,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type,
    accountId: 'bbva',
    category: 'Varios',
    description: id,
    amount,
    ...overrides,
  }
}

describe('accountingYear', () => {
  it('is the year of the date when the movement counts in the month of its date', () => {
    expect(accountingYear({ date: '2026-09-27', month: 9 })).toBe(2026)
  })

  it('moves to the next year when a late-December movement counts in January', () => {
    expect(accountingYear({ date: '2025-12-28', month: 1 })).toBe(2026)
  })

  it('moves to the previous year when an early-January movement counts in December', () => {
    expect(accountingYear({ date: '2026-01-02', month: 12 })).toBe(2025)
  })
})

describe('monthTotals', () => {
  it('adds each type and nets income minus expenses and investment, not saving', () => {
    const transactions = [
      tx('nomina', '2026-09-01', 'income', 2450),
      tx('alquiler', '2026-09-01', 'expense', 850),
      tx('luz', '2026-09-15', 'expense', 48.17),
      tx('vwce', '2026-09-25', 'investment', 300),
      tx('hucha', '2026-09-26', 'saving', 120, { destinationAccountId: 'ahorro' }),
      tx('agosto', '2026-08-30', 'expense', 71.9),
      tx('otro-ano', '2025-09-10', 'income', 999),
    ]

    expect(monthTotals(transactions, 2026, 9)).toEqual({
      income: 2450,
      expense: 898.17,
      saving: 120,
      investment: 300,
      net: 1251.83,
    })
  })
})

const NO_FILTERS: RegistryFilters = {
  search: '',
  types: [],
  accountIds: [],
}
const NEWEST_FIRST = { column: 'date', direction: 'desc' } as const

describe('buildMonthGroups', () => {
  const transactions = [
    tx('alquiler-ago', '2026-08-01', 'expense', 850),
    tx('nomina-sep', '2026-09-01', 'income', 2450),
    tx('mercadona', '2026-09-27', 'expense', 64.32, { category: 'Supermercado' }),
    tx('nomina-ago', '2026-08-28', 'income', 2450),
    tx('vwce', '2026-09-25', 'investment', 300, { accountId: 'revolut' }),
    tx('otro-ano', '2025-09-10', 'income', 999),
  ]

  it('groups the year by month, newest month and newest movement first, with count and net', () => {
    const groups = buildMonthGroups(transactions, 2026, NO_FILTERS, NEWEST_FIRST)

    expect(groups.map((group) => [group.month, group.count, group.net])).toEqual([
      [9, 3, 2085.68],
      [8, 2, 1600],
    ])
    expect(groups[0].rows.map((row) => row.id)).toEqual(['mercadona', 'vwce', 'nomina-sep'])
  })

  it('keeps only the movements that match the search, type and account', () => {
    const byType = buildMonthGroups(
      transactions,
      2026,
      { ...NO_FILTERS, types: ['income'] },
      NEWEST_FIRST,
    )
    const bySearch = buildMonthGroups(
      transactions,
      2026,
      { ...NO_FILTERS, search: 'super' },
      NEWEST_FIRST,
    )
    const byAccount = buildMonthGroups(
      transactions,
      2026,
      { ...NO_FILTERS, accountIds: ['revolut'] },
      NEWEST_FIRST,
    )

    expect(byType.flatMap((group) => group.rows.map((row) => row.id))).toEqual([
      'nomina-sep',
      'nomina-ago',
    ])
    expect(bySearch.flatMap((group) => group.rows.map((row) => row.id))).toEqual(['mercadona'])
    expect(byAccount.flatMap((group) => group.rows.map((row) => row.id))).toEqual(['vwce'])
  })

  it('shows the same movements for every type as for no type at all', () => {
    const everyType = buildMonthGroups(
      transactions,
      2026,
      { ...NO_FILTERS, types: ['income', 'expense', 'saving', 'investment'] },
      NEWEST_FIRST,
    )
    const noFilter = buildMonthGroups(transactions, 2026, NO_FILTERS, NEWEST_FIRST)

    expect(everyType).toEqual(noFilter)
    expect(everyType.flatMap((group) => group.rows.map((row) => row.type))).toEqual([
      'expense',
      'investment',
      'income',
      'income',
      'expense',
    ])
  })

  it('sorts the movements of each month by amount when asked', () => {
    const groups = buildMonthGroups(transactions, 2026, NO_FILTERS, {
      column: 'amount',
      direction: 'desc',
    })

    expect(groups[0].rows.map((row) => row.id)).toEqual(['nomina-sep', 'vwce', 'mercadona'])
  })
})

function monthGroups(...months: Month[]): MonthGroup[] {
  return buildMonthGroups(
    months.map((month) =>
      tx(`tx-${month}`, `2026-${String(month).padStart(2, '0')}-01`, 'expense', 10),
    ),
    2026,
    NO_FILTERS,
    NEWEST_FIRST,
  )
}

describe('foldMonthGroups', () => {
  it('has nothing to show or fold when the year has no movements', () => {
    expect(foldMonthGroups([], 10)).toEqual({ shown: [], hidden: [] })
  })

  it('shows the only month and folds nothing', () => {
    const [october] = monthGroups(10)

    expect(foldMonthGroups([october], 10)).toEqual({ shown: [october], hidden: [] })
  })

  it('folds the months older than the selected one', () => {
    const [october, september, august] = monthGroups(10, 9, 8)

    expect(foldMonthGroups([october, september, august], 10)).toEqual({
      shown: [october],
      hidden: [september, august],
    })
  })

  it('opens the latest month with movements when the selected month is empty', () => {
    const [september, august] = monthGroups(9, 8)

    expect(foldMonthGroups([september, august], 10)).toEqual({
      shown: [september],
      hidden: [august],
    })
  })

  it('shows every month once asked to reveal the older ones', () => {
    const groups = monthGroups(10, 9, 8)

    expect(foldMonthGroups(groups, 10, true)).toEqual({ shown: groups, hidden: [] })
  })

  it('keeps the newer months in view when the selected month goes back', () => {
    const [october, september, august, july] = monthGroups(10, 9, 8, 7)

    expect(foldMonthGroups([october, september, august, july], 8)).toEqual({
      shown: [october, september, august],
      hidden: [july],
    })
  })
})

describe('registryYears', () => {
  it('lists every year with movements plus the current one, newest first', () => {
    const transactions = [
      tx('a', '2024-03-01', 'expense', 10),
      tx('b', '2025-12-28', 'income', 10, { month: 1 }),
      tx('c', '2024-05-01', 'expense', 10),
    ]

    expect(registryYears(transactions, 2027)).toEqual([2027, 2026, 2024])
  })
})

describe('hasTypeRestriction', () => {
  it('is false when no type or every type is chosen, since both show them all', () => {
    expect(hasTypeRestriction([])).toBe(false)
    expect(hasTypeRestriction(['income', 'expense', 'saving', 'investment'])).toBe(false)
  })

  it('is true when the chosen types leave any type out', () => {
    expect(hasTypeRestriction(['expense'])).toBe(true)
    expect(hasTypeRestriction(['expense', 'investment'])).toBe(true)
  })
})

describe('categoryBreakdown', () => {
  it('adds one type of the month by category, largest first, with its share', () => {
    const transactions = [
      tx('alquiler', '2026-09-01', 'expense', 850, { category: 'Hogar' }),
      tx('luz', '2026-09-15', 'expense', 50, { category: 'Hogar' }),
      tx('super', '2026-09-27', 'expense', 100, { category: 'Supermercado' }),
      tx('nomina', '2026-09-01', 'income', 2450, { category: 'Nómina' }),
      tx('agosto', '2026-08-02', 'expense', 70, { category: 'Supermercado' }),
    ]

    expect(categoryBreakdown(transactions, 2026, 9, 'expense')).toEqual([
      { category: 'Hogar', amount: 900, share: 90 },
      { category: 'Supermercado', amount: 100, share: 10 },
    ])
  })
})
