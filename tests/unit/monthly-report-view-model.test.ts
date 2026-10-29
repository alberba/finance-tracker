import { describe, expect, it } from 'vitest'

import {
  buildMonthlyReportViewModel,
  selectReportTransactions,
  type MonthlyReportState,
} from '../../src/domain/monthly-report/view-model'
import { periodError, previousMonthPeriod } from '../../src/domain/monthly-report/period'
import type { RegistryFilters } from '../../src/domain/transactions/registry'
import type { Month } from '../../src/lib/month'
import type { Entity, Transaction, TransactionType } from '../../src/scripts/types'

const NO_FILTERS: RegistryFilters = { search: '', types: [], accountIds: [] }
const TODAY = '2026-10-29'

function entity(id: string, name: string): Entity {
  return { id, name, openingBalance: 0 } as Entity
}

function tx(
  id: string,
  date: string,
  type: TransactionType,
  amount: number,
  extra: Partial<Transaction> = {},
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
    ...extra,
  }
}

function stateOf(transactions: Transaction[]): MonthlyReportState {
  return {
    currency: 'EUR',
    accounts: [entity('bbva', 'BBVA'), entity('ahorro', 'Ahorro')],
    investmentAssets: [],
    liabilities: [],
    snapshots: {},
    transactions,
  }
}

function build(
  transactions: Transaction[],
  period = { from: '2026-09-01', to: '2026-09-30' },
  filters: RegistryFilters = NO_FILTERS,
) {
  return buildMonthlyReportViewModel({
    state: stateOf(transactions),
    period,
    filters,
    today: TODAY,
  })
}

describe('previousMonthPeriod', () => {
  it('is the whole calendar month before today', () => {
    expect(previousMonthPeriod('2026-10-29')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('crosses the year boundary in January', () => {
    expect(previousMonthPeriod('2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('ends on the 29th in a leap-year February', () => {
    expect(previousMonthPeriod('2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('periodError', () => {
  it('accepts a past range, including a single day and a range up to today', () => {
    expect(periodError({ from: '2026-09-25', to: '2026-10-24' }, TODAY)).toBeNull()
    expect(periodError({ from: '2026-09-10', to: '2026-09-10' }, TODAY)).toBeNull()
    expect(periodError({ from: '2026-10-01', to: TODAY }, TODAY)).toBeNull()
  })

  it('asks for both dates', () => {
    expect(periodError({ from: '', to: '2026-09-30' }, TODAY)).toMatch(/dos fechas/)
    expect(periodError({ from: '2026-09-01', to: '' }, TODAY)).toMatch(/dos fechas/)
  })

  it('rejects a start after the end', () => {
    expect(periodError({ from: '2026-09-30', to: '2026-09-01' }, TODAY)).toMatch(/posterior/)
  })

  it('rejects an end in the future', () => {
    expect(periodError({ from: '2026-10-01', to: '2026-10-30' }, TODAY)).toMatch(/futura/)
  })
})

describe('buildMonthlyReportViewModel', () => {
  it('counts the movements whose date falls in the range, both ends included', () => {
    const report = build(
      [
        tx('antes', '2026-08-31', 'expense', 10),
        tx('primero', '2026-09-01', 'expense', 20),
        tx('ultimo', '2026-09-30', 'expense', 30),
        tx('despues', '2026-10-01', 'expense', 40),
      ],
      { from: '2026-09-01', to: '2026-09-30' },
    )

    expect(report.summary.expense).toBe(50)
    expect(report.movementCount).toBe(2)
  })

  it('ignores the accounting month: a movement counts by its date', () => {
    const payslip = tx('nomina', '2026-09-28', 'income', 2000, { month: 10 })

    expect(build([payslip]).summary.income).toBe(2000)
    expect(build([payslip], { from: '2026-10-01', to: '2026-10-28' }).summary.income).toBe(0)
  })

  it('works across months and years', () => {
    const report = build(
      [tx('dic', '2025-12-28', 'income', 1000), tx('ene', '2026-01-02', 'income', 500)],
      { from: '2025-12-25', to: '2026-01-24' },
    )

    expect(report.summary.income).toBe(1500)
  })

  it('totals each type and leaves saving and investment out of the net', () => {
    const report = build([
      tx('nomina', '2026-09-01', 'income', 2450),
      tx('alquiler', '2026-09-02', 'expense', 850.5),
      tx('ahorro', '2026-09-03', 'saving', 120, { destinationAccountId: 'ahorro' }),
      tx('vwce', '2026-09-04', 'investment', 300),
    ])

    expect(report.summary).toEqual({
      income: 2450,
      expense: 850.5,
      net: 1599.5,
      saving: 120,
      investment: 300,
    })
  })

  it('groups expenses by category, largest first, with count and share of the total', () => {
    const report = build([
      tx('a', '2026-09-01', 'expense', 100, { category: 'Hogar' }),
      tx('b', '2026-09-02', 'expense', 25, { category: 'Supermercado' }),
      tx('c', '2026-09-03', 'expense', 75, { category: 'Supermercado' }),
      tx('d', '2026-09-04', 'income', 900, { category: 'Nómina' }),
    ])

    expect(report.expenseCategories).toEqual([
      { category: 'Hogar', count: 1, amount: 100, share: 50 },
      { category: 'Supermercado', count: 2, amount: 100, share: 50 },
    ])
    expect(report.incomeCategories).toEqual([
      { category: 'Nómina', count: 1, amount: 900, share: 100 },
    ])
  })

  it('breaks ties by category name and files a blank category under «Sin categoría»', () => {
    const report = build([
      tx('a', '2026-09-01', 'expense', 10, { category: 'Zumos' }),
      tx('b', '2026-09-02', 'expense', 10, { category: 'Agua' }),
      tx('c', '2026-09-03', 'expense', 5, { category: '' }),
    ])

    expect(report.expenseCategories.map((row) => row.category)).toEqual([
      'Agua',
      'Zumos',
      'Sin categoría',
    ])
  })

  it('files a category of only spaces under «Sin categoría» too', () => {
    const report = build([tx('a', '2026-09-01', 'expense', 10, { category: '   ' })])

    expect(report.expenseCategories.map((row) => row.category)).toEqual(['Sin categoría'])
  })

  it('leaves out categories with no amount', () => {
    const report = build([
      tx('a', '2026-09-01', 'expense', 0, { category: 'Nada' }),
      tx('b', '2026-09-02', 'expense', 10, { category: 'Algo' }),
    ])

    expect(report.expenseCategories.map((row) => row.category)).toEqual(['Algo'])
  })

  it('lists the latest 20 movements, newest first with the id breaking ties, and says how many are left out', () => {
    const rows = Array.from({ length: 23 }, (_, index) =>
      tx(`m${String(index).padStart(2, '0')}`, '2026-09-15', 'expense', 1),
    )
    const report = build([...rows, tx('reciente', '2026-09-20', 'expense', 1)])

    expect(report.movements).toHaveLength(20)
    expect(report.movements[0].id).toBe('reciente')
    expect(report.movements[1].id).toBe('m22')
    expect(report.movementCount).toBe(24)
    expect(report.movementsNote).toBe('y 4 movimientos más no se muestran')
  })

  it('has no note when every movement fits, and says «1 movimiento» in the singular', () => {
    expect(build([tx('a', '2026-09-01', 'expense', 1)]).movementsNote).toBe('')
    const rows = Array.from({ length: 21 }, (_, index) =>
      tx(`m${index}`, '2026-09-01', 'expense', 1),
    )
    expect(build(rows).movementsNote).toBe('y 1 movimiento más no se muestra')
  })

  it('signs the movements as the app does and names a saving «origen → destino»', () => {
    const report = build([
      tx('nomina', '2026-09-04', 'income', 100),
      tx('cafe', '2026-09-03', 'expense', 5),
      tx('vwce', '2026-09-02', 'investment', 7),
      tx('hucha', '2026-09-01', 'saving', 9, { destinationAccountId: 'ahorro' }),
    ])

    expect(report.movements.map((row) => [row.id, row.direction, row.amount, row.account])).toEqual(
      [
        ['nomina', 'in', 100, 'BBVA'],
        ['cafe', 'out', 5, 'BBVA'],
        ['vwce', 'out', 7, 'BBVA'],
        ['hucha', 'none', 9, 'BBVA → Ahorro'],
      ],
    )
  })

  it('applies the type, account and search filters but not the year', () => {
    const transactions = [
      tx('a', '2026-09-01', 'expense', 10, { description: 'Super Dia' }),
      tx('b', '2026-09-02', 'expense', 20, { description: 'Gasolina' }),
      tx('c', '2026-09-03', 'income', 99, { description: 'Super premio' }),
      tx('d', '2026-09-04', 'expense', 30, { description: 'Super Dia', accountId: 'ahorro' }),
    ]
    const report = build(transactions, undefined, {
      search: 'super',
      types: ['expense'],
      accountIds: ['bbva'],
    })

    expect(report.movements.map((row) => row.id)).toEqual(['a'])
    expect(report.summary.expense).toBe(10)
    expect(report.summary.income).toBe(0)
    expect(report.appliedFilters).toEqual(['Gastos', 'Cuenta: BBVA', 'Búsqueda: «super»'])
  })

  it('shows no filters when none narrows the report, nor when every type is chosen', () => {
    expect(build([]).appliedFilters).toEqual([])
    expect(
      build([], undefined, {
        ...NO_FILTERS,
        types: ['income', 'expense', 'saving', 'investment'],
      }).appliedFilters,
    ).toEqual([])
  })

  it('reports an empty period with zeros', () => {
    const report = build([tx('fuera', '2026-01-01', 'expense', 10)])

    expect(report.hasMovements).toBe(false)
    expect(report.summary).toEqual({ income: 0, expense: 0, net: 0, saving: 0, investment: 0 })
    expect(report.expenseCategories).toEqual([])
    expect(report.movements).toEqual([])
    expect(report.movementsNote).toBe('')
  })

  it('takes the position from today, whatever the period and the filters', () => {
    const state: MonthlyReportState = {
      ...stateOf([tx('nomina', '2026-09-01', 'income', 1000)]),
      accounts: [{ ...entity('bbva', 'BBVA'), openingBalance: 500 } as Entity],
    }
    const report = buildMonthlyReportViewModel({
      state,
      period: { from: '2026-09-01', to: '2026-09-30' },
      filters: { ...NO_FILTERS, types: ['expense'] },
      today: TODAY,
    })

    expect(report.position.cash).toBe(1500)
    expect(report.position.net).toBe(1500)
    expect(report.position.asOf).toBe('2026-10-29')
  })

  it('does not change the state it reads', () => {
    const state = stateOf([tx('a', '2026-09-01', 'expense', 10)])
    const before = JSON.stringify(state)

    buildMonthlyReportViewModel({
      state,
      period: { from: '2026-09-01', to: '2026-09-30' },
      filters: NO_FILTERS,
      today: TODAY,
    })

    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('selectReportTransactions', () => {
  it('returns every movement of the period that passes the filters, with no list limit', () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      tx(`m${index}`, '2026-09-10', index % 2 ? 'income' : 'expense', 1),
    )
    const selected = selectReportTransactions({
      transactions: [...rows, tx('fuera', '2026-10-10', 'expense', 1)],
      period: { from: '2026-09-01', to: '2026-09-30' },
      filters: { ...NO_FILTERS, types: ['expense'] },
    })

    expect(selected).toHaveLength(13)
    expect(selected.every((row) => row.type === 'expense')).toBe(true)
  })
})
