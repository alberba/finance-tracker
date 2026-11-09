import { describe, expect, it } from 'vitest'

import type { MonthGroup } from '../../src/domain/transactions/registry'
import type { Month } from '../../src/lib/month'
import {
  buildLedgerMonths,
  bulkCategoryType,
  categoryBreakdown,
  dayLabel,
  extraMatcher,
  filterSummary,
  moreFiltersLabel,
  movementDetail,
  narrowMonthGroups,
  NO_EXTRA_FILTERS,
  olderMonthsLabel,
  selectionSummary,
  shownIds,
  toggleTypeChip,
} from '../../src/neon/sections/transactions/registry-view-model'
import {
  subscriptionRows,
  subscriptionsSummary,
} from '../../src/neon/sections/transactions/subscriptions-view-model'
import type { Subscription, Transaction, TransactionType } from '../../src/scripts/types'

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
    accountId: 'nomina',
    category: 'Súper',
    description: id,
    amount,
    ...overrides,
  }
}

function group(month: Month, rows: Transaction[], net: number): MonthGroup {
  return { month, rows, count: rows.length, net }
}

const ACCOUNTS: Record<string, string> = { nomina: 'Cuenta nómina', tarjeta: 'Tarjeta' }
const accountName = (id: string) => ACCOUNTS[id] ?? id
const LEDGER = { year: 2026, today: '2026-10-09', currency: 'EUR', accountName }

describe('extra filters', () => {
  it('keeps the exact day and the amount range, inclusive, by the absolute amount', () => {
    const matches = extraMatcher({ date: '', min: '10', max: '64,32' })
    expect(matches(tx('a', '2026-10-01', 'expense', 64.32))).toBe(true)
    expect(matches(tx('b', '2026-10-01', 'expense', 9.99))).toBe(false)
    expect(matches(tx('c', '2026-10-01', 'investment', -70))).toBe(false)
    expect(
      extraMatcher({ ...NO_EXTRA_FILTERS, date: '2026-10-02' })(
        tx('d', '2026-10-01', 'expense', 1),
      ),
    ).toBe(false)
  })

  it('recounts the net of a month it narrows and drops the months left empty', () => {
    const october = group(
      10,
      [tx('nomina', '2026-10-03', 'income', 3420), tx('cena', '2026-10-07', 'expense', 48.6)],
      3371.4,
    )
    const september = group(9, [tx('renfe', '2026-09-05', 'expense', 22.8)], -22.8)

    const narrowed = narrowMonthGroups([october, september], { date: '', min: '40', max: '' })

    expect(narrowed).toEqual([{ ...october, rows: october.rows, count: 2, net: 3371.4 }])
    expect(narrowMonthGroups([october], { date: '', min: '', max: '100' })[0]).toMatchObject({
      count: 1,
      net: -48.6,
    })
  })

  it('counts the active filters of «Más filtros»', () => {
    expect(moreFiltersLabel([], NO_EXTRA_FILTERS)).toBe('Más filtros')
    expect(moreFiltersLabel(['tarjeta'], { date: '2026-10-01', min: ' ', max: '5' })).toBe(
      'Más filtros · 3',
    )
  })
})

describe('type chips', () => {
  it('pick one type and go back to every type when the chosen one is pressed again', () => {
    expect(toggleTypeChip([], 'income')).toEqual(['income'])
    expect(toggleTypeChip(['income'], 'expense')).toEqual(['expense'])
    expect(toggleTypeChip(['income'], 'income')).toEqual([])
    expect(toggleTypeChip(['income', 'expense'], 'income')).toEqual(['income'])
  })
})

describe('ledger', () => {
  it('names today and yesterday, and any other day by its date', () => {
    expect(dayLabel('2026-10-09', '2026-10-09')).toBe('Hoy')
    expect(dayLabel('2026-10-08', '2026-10-09')).toBe('Ayer')
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('Ayer')
    expect(dayLabel('2026-10-05', '2026-10-09')).toBe('5 oct')
  })

  it('splits a month by day in its order, with each day net and the month summary', () => {
    const rows = [
      tx('Mercadona', '2026-10-09', 'expense', 64.32),
      tx('MSCI', '2026-10-08', 'investment', 300, { category: 'Inversión' }),
      tx('Nómina', '2026-10-08', 'income', 3420, { category: 'Nómina' }),
      tx('Hucha', '2026-10-08', 'saving', 50, { destinationAccountId: 'tarjeta' }),
    ]
    const [month] = buildLedgerMonths([group(10, rows, 3055.68)], LEDGER)

    expect(month.title).toBe('Octubre 2026')
    expect(month.summary).toBe('4 movimientos · neto +3.055,68 €')
    expect(month.days.map((day) => [day.label, day.net, day.rows.length])).toEqual([
      ['Hoy', 'Neto −64,32 €', 1],
      ['Ayer', 'Neto +3.120,00 €', 3],
    ])
    expect(month.days[1].rows.map((row) => [row.amount, row.tone])).toEqual([
      ['−300,00 €', 'lilac'],
      ['+3.420,00 €', 'gain'],
      ['50,00 €', 'text'],
    ])
    expect(month.days[1].rows[2].meta).toBe('Cuenta nómina → Tarjeta')
    expect(month.days[0].rows[0].label).toBe('Mercadona, hoy, −64,32 €')
  })

  it('names the first folded month and how many movements the button unfolds', () => {
    expect(olderMonthsLabel([])).toBe('')
    expect(
      olderMonthsLabel([
        group(9, [tx('a', '2026-09-01', 'expense', 1)], -1),
        group(8, [tx('b', '2026-08-01', 'expense', 1), tx('c', '2026-08-02', 'expense', 1)], -2),
      ]),
    ).toBe('Ver septiembre y anteriores · 3 movimientos')
  })
})

describe('filter summary', () => {
  const rows = [
    tx('nomina', '2026-10-03', 'income', 3420),
    tx('alquiler', '2026-10-01', 'expense', 650, { category: 'Casa' }),
    tx('vwce', '2026-10-06', 'investment', 300),
  ]

  it('is the net of every type when no type is chosen', () => {
    expect(filterSummary(rows, [])).toEqual({
      label: 'Neto del filtro',
      total: '+2.470,00 €',
      count: '3 movimientos · todos los tipos',
    })
  })

  it('is the plain total of the chosen type', () => {
    expect(filterSummary(rows.slice(1, 2), ['expense'])).toEqual({
      label: 'Total filtrado',
      total: '650,00 €',
      count: '1 movimiento · gastos',
    })
  })
})

describe('category breakdown', () => {
  const rows = [
    tx('a', '2026-10-01', 'expense', 650, { category: 'Casa' }),
    tx('b', '2026-10-02', 'expense', 150, { category: 'Súper' }),
    tx('c', '2026-10-03', 'expense', 200, { category: 'Súper' }),
    tx('d', '2026-10-03', 'income', 3420, { category: 'Nómina' }),
  ]

  it('splits expenses by default, largest first, with each share', () => {
    expect(categoryBreakdown(rows, [])).toEqual({
      title: 'Gastos por categoría',
      rows: [
        { name: 'Casa', amount: '650,00 €', share: '65,0 %', width: 65 },
        { name: 'Súper', amount: '350,00 €', share: '35,0 %', width: 35 },
      ],
    })
  })

  it('splits the chosen type', () => {
    expect(categoryBreakdown(rows, ['income'])).toMatchObject({
      title: 'Ingresos por categoría',
      rows: [{ name: 'Nómina', share: '100,0 %' }],
    })
  })
})

describe('movement detail', () => {
  const context = { currency: 'EUR', accountName, plannedFor: () => 400 }

  it('shows the budget its category used that month and the latest movements alike', () => {
    const movement = tx('m3', '2026-10-09', 'expense', 64.32, { description: 'Mercadona' })
    const all = [
      movement,
      tx('m2', '2026-10-02', 'expense', 89.15, { description: 'Mercadona' }),
      tx('m1', '2026-09-28', 'expense', 97.4, { description: 'Mercadona' }),
      tx('lidl', '2026-10-04', 'expense', 300, { description: 'Lidl' }),
      tx('other-year', '2025-10-04', 'expense', 999, { description: 'Lidl' }),
    ]

    const detail = movementDetail(movement, all, context)

    expect(detail).toMatchObject({
      title: 'Mercadona',
      kicker: 'Gasto',
      amount: '−64,32 €',
      budget: { title: 'Súper · octubre', text: '453,47 € de 400,00 €', width: 100, over: true },
      sameTitle: 'Más de Mercadona',
      same: [
        { label: '2 de octubre de 2026', value: '−89,15 €' },
        { label: '28 de septiembre de 2026', value: '−97,40 €' },
      ],
    })
    expect(detail.fields.map((field) => field.label)).toEqual([
      'Fecha',
      'Cuenta',
      'Categoría',
      'Tipo',
    ])
  })

  it('names both accounts of a saving and the month it counts in when it is not its date’s', () => {
    const saving = tx('s', '2026-09-28', 'saving', 100, {
      month: 10,
      destinationAccountId: 'tarjeta',
      description: '',
    })

    const detail = movementDetail(saving, [saving], context)

    expect(detail.title).toBe('Súper')
    expect(detail.budget).toBeNull()
    expect(detail.same).toEqual([])
    expect(detail.fields).toEqual([
      { label: 'Fecha', value: '28 de septiembre de 2026' },
      { label: 'Cuenta origen', value: 'Cuenta nómina' },
      { label: 'Cuenta destino', value: 'Tarjeta' },
      { label: 'Categoría', value: 'Súper' },
      { label: 'Tipo', value: 'Ahorro' },
      { label: 'Cuenta en el mes', value: 'Octubre' },
    ])
  })
})

describe('selection', () => {
  const rows = [
    tx('cena', '2026-10-09', 'expense', 48.6),
    tx('nomina', '2026-10-08', 'income', 3420, { category: 'Nómina' }),
  ]

  it('selects every row the ledger shows, in its order', () => {
    const months = buildLedgerMonths([group(10, rows, 3371.4)], LEDGER)
    expect(shownIds(months)).toEqual(['cena', 'nomina'])
  })

  it('counts the selection and signs its sum', () => {
    expect(selectionSummary(rows, 'EUR')).toEqual({
      count: '2 seleccionados',
      sum: '+3.371,40\u00a0€',
    })
    expect(selectionSummary(rows.slice(0, 1), 'EUR').count).toBe('1 seleccionado')
  })

  it('offers the categories of the new type, or of the type every row shares', () => {
    expect(bulkCategoryType(rows, '')).toBeNull()
    expect(bulkCategoryType(rows, 'investment')).toBe('investment')
    expect(bulkCategoryType(rows.slice(0, 1), '')).toBe('expense')
  })
})

describe('subscriptions', () => {
  function subscription(overrides: Partial<Subscription>): Subscription {
    return {
      id: overrides.name ?? 'sub',
      name: 'Netflix',
      amount: 13.99,
      accountId: 'tarjeta',
      category: 'Ocio',
      frequency: 'monthly',
      startDate: '2026-01-01',
      nextChargeDate: '2026-11-01',
      active: true,
      ...overrides,
    }
  }

  const list = [
    subscription({ name: 'Revista', amount: 4.5, active: false }),
    subscription({ name: 'Netflix' }),
    subscription({
      name: 'Seguro',
      amount: 120,
      frequency: 'yearly',
      nextChargeDate: '2027-03-01',
    }),
  ]

  it('lists active subscriptions first, with their state and next charge', () => {
    expect(subscriptionRows(list, accountName).map((row) => [row.name, row.status])).toEqual([
      ['Netflix', 'Activa · próximo 1 nov'],
      ['Seguro', 'Activa · próximo 1 mar'],
      ['Revista', 'Pausada'],
    ])
    expect(subscriptionRows(list, accountName)[0].meta).toBe('Ocio · Tarjeta · Mensual')
  })

  it('sums what the active ones commit each month and the next 30 days of charges', () => {
    expect(subscriptionsSummary(list, '2026-10-09')).toEqual({
      monthly: '23,99 €',
      line: 'Proyección anual 287,88 € · 2 activas',
      next30: '1 cobro · 13,99 €',
      upcoming: [
        {
          id: 'Netflix:2026-11-01',
          date: '1 nov',
          name: 'Netflix',
          when: 'en 23 días',
          amount: '13,99 €',
        },
      ],
    })
  })
})
