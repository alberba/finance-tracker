import { describe, expect, it } from 'vitest'

import { buildNeonDashboardViewModel } from '../../src/neon/dashboard/view-model'
import type { PendingMovement, State, Transaction } from '../../src/scripts/types'

/** Thursday 9 October 2026: a month of 31 days, 9 of them gone. */
const TODAY = '2026-10-09'

let nextId = 0
function tx(
  date: string,
  type: Transaction['type'],
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  nextId += 1
  return {
    id: `tx-${nextId}`,
    date,
    month: Number(date.slice(5, 7)) as Transaction['month'],
    type,
    accountId: 'bank',
    category: type === 'expense' ? 'Súper' : type === 'income' ? 'Nómina' : 'Fondos',
    description: `${type} ${date}`,
    amount,
    ...extra,
  }
}

function state(overrides: Partial<State> = {}): State {
  return {
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'bank', name: 'Banco', openingBalance: 10000 }],
    investmentAssets: [],
    liabilities: [],
    transactions: [],
    snapshots: {},
    budget: { income: {}, expense: {}, saving: {}, investment: {} },
    goals: Object.fromEntries(
      ['short', 'medium', 'long', 'investmentTotal', 'investmentFunds', 'investmentCrypto'].map(
        (key) => [key, { name: '', targetYear: 2026, targetAmount: 0 }],
      ),
    ),
    savingGoals: [],
    contributions: [],
    instruments: [],
    quotes: {},
    expenseCategories: ['Súper', 'Casa', 'Ocio'],
    incomeCategories: ['Nómina'],
    savingCategories: [],
    investmentCategories: ['Fondos'],
    ...overrides,
  } as unknown as State
}

function pending(type: PendingMovement['type'], amount: number, description: string) {
  return {
    id: `p-${description}`,
    type,
    amount,
    description,
    occurrenceDate: '2026-10-12',
    status: 'pending',
  } as PendingMovement
}

function build(
  overrides: Partial<State> = {},
  options: Partial<Parameters<typeof buildNeonDashboardViewModel>[0]> = {},
) {
  return buildNeonDashboardViewModel({
    state: state(overrides),
    pending: [],
    range: '1a',
    recentFilter: 'all',
    today: TODAY,
    ...options,
  })
}

const OCTOBER = [
  tx('2026-10-03', 'income', 3420),
  tx('2026-10-05', 'expense', 1286.45),
  tx('2026-10-06', 'investment', 900),
  tx('2026-10-07', 'saving', 500),
]

describe('the month the dashboard shows', () => {
  it('is the current month while the configured year is this one', () => {
    const vm = build()
    expect(vm.title).toBe('Así va octubre')
    expect(vm.month.name).toBe('Octubre')
    expect(vm.month.status).toBe('día 9 de 31')
  })

  it('is December, closed, for a past year', () => {
    const vm = build({ year: 2025 })
    expect(vm.title).toBe('Así fue diciembre')
    expect(vm.month.status).toBe('Mes cerrado')
  })

  it('is January, still to start, for a coming year', () => {
    const vm = build({ year: 2027 })
    expect(vm.title).toBe('Así va enero')
    expect(vm.month.status).toBe('Mes por empezar')
  })
})

describe('«Te quedan»', () => {
  it('is named in the past once the month is closed', () => {
    expect(build().month.leftLabel).toBe('Te quedan')
    expect(build({ year: 2027 }).month.leftLabel).toBe('Te quedan')
    expect(build({ year: 2025 }).month.leftLabel).toBe('Te quedaron')
  })

  it('is what came in minus expenses and investment; a saving only moves money', () => {
    const vm = build({ transactions: OCTOBER })
    expect(vm.month.left).toEqual({ text: '1.233,55 €', tone: 'neutral' })
    expect(vm.month.income).toBe('3.420,00 €')
  })

  it('only counts the shown month of the shown year', () => {
    const vm = build({
      transactions: [...OCTOBER, tx('2025-10-04', 'expense', 100), tx('2026-09-30', 'expense', 50)],
    })
    expect(vm.month.left.text).toBe('1.233,55 €')
  })

  it('goes into loss when the month spent more than came in', () => {
    const vm = build({ transactions: [tx('2026-10-02', 'expense', 40)] })
    expect(vm.month.left).toEqual({ text: '−40,00 €', tone: 'loss' })
  })

  it('splits the income into expenses, investment and unspent', () => {
    const vm = build({ transactions: OCTOBER })
    expect(vm.month.split?.segments.map(({ key, weight }) => [key, weight])).toEqual([
      ['expense', 37.62],
      ['investment', 26.32],
      ['unspent', 36.07],
    ])
    expect(vm.month.split?.label).toBe(
      'Reparto de los ingresos: gastos 37,6 %, inversión 26,3 %, sin gastar 36,1 %',
    )
  })

  it('has no split without income', () => {
    expect(build().month.split).toBeNull()
  })

  it('tells the pending amount and count in the note and the lede', () => {
    const vm = build(
      { transactions: OCTOBER },
      { pending: [pending('expense', 17.99, 'Spotify'), pending('investment', 600, 'DCA')] },
    )
    expect(vm.month.pendingNote).toBe('−617,99 € por confirmar')
    expect(vm.lede).toBe(
      'Te quedan 1.233,55 € para el resto del mes y 2 movimientos por confirmar.',
    )
  })

  it('says when nothing is pending', () => {
    const vm = build({ transactions: OCTOBER })
    expect(vm.month.pendingNote).toBe('nada por confirmar')
    expect(vm.lede).toBe('Te quedan 1.233,55 € para el resto del mes. No queda nada por confirmar.')
  })
})

describe('the month rows', () => {
  it('give income, expenses and investment with the last six months scaled to the highest', () => {
    const vm = build({
      transactions: [
        ...OCTOBER,
        tx('2026-09-04', 'expense', 2572.9),
        tx('2026-05-04', 'expense', 643.23),
      ],
    })
    expect(vm.month.rows.map((row) => [row.kind, row.amount])).toEqual([
      ['income', '+3.420,00 €'],
      ['expense', '−1.286,45 €'],
      ['investment', '−900,00 €'],
    ])
    const expense = vm.month.rows[1]
    expect(expense.bars.map((bar) => [bar.month, bar.height])).toEqual([
      ['may', 25],
      ['jun', 0],
      ['jul', 0],
      ['ago', 0],
      ['sep', 100],
      ['oct', 50],
    ])
    expect(expense.bars.at(-1)?.current).toBe(true)
  })
})

describe('the spending pace', () => {
  it('compares with the previous month up to the same day', () => {
    const vm = build({
      transactions: [
        tx('2026-10-02', 'expense', 459),
        tx('2026-09-05', 'expense', 500),
        // After the 9th: it does not count yet.
        tx('2026-09-20', 'expense', 900),
      ],
    })
    expect(vm.month.pace).toEqual({
      lead: 'Llevas un ',
      emphasis: '8,2 % menos',
      tail: ' de gasto que a estas alturas de septiembre.',
      tone: 'gain',
    })
  })

  it('reads more spending as a loss, and compares whole months once closed', () => {
    const vm = build({
      year: 2025,
      transactions: [tx('2025-12-20', 'expense', 220), tx('2025-11-28', 'expense', 200)],
    })
    expect(vm.month.pace).toEqual({
      lead: 'Gastaste un ',
      emphasis: '10,0 % más',
      tail: ' que en noviembre.',
      tone: 'loss',
    })
  })

  it('reaches back to December of the previous year in January', () => {
    const vm = build(
      {
        year: 2027,
        transactions: [tx('2027-01-02', 'expense', 50), tx('2026-12-01', 'expense', 100)],
      },
      { today: '2027-01-05' },
    )
    expect(vm.month.pace?.tail).toBe(' de gasto que a estas alturas de diciembre.')
    expect(vm.month.pace?.emphasis).toBe('50,0 % menos')
  })

  it('is absent when the previous month spent nothing', () => {
    expect(build({ transactions: OCTOBER }).month.pace).toBeNull()
  })
})

describe('«Por confirmar»', () => {
  it('shows three, with the signed amount, and counts the rest', () => {
    const vm = build(
      {},
      {
        pending: [
          pending('expense', 17.99, 'Spotify'),
          pending('income', 100, 'Devolución'),
          pending('expense', 39.9, 'Gimnasio'),
          pending('investment', 600, 'DCA'),
        ],
      },
    )
    expect(vm.pending.count).toBe(4)
    expect(vm.pending.items.map((item) => [item.description, item.amount])).toEqual([
      ['Spotify', '−17,99 €'],
      ['Devolución', '+100,00 €'],
      ['Gimnasio', '−39,90 €'],
    ])
    expect(vm.pending.items[0].due).toBe('vence el 12 oct')
    expect(vm.pending.moreLabel).toBe('Ver los 4 pendientes')
  })

  it('has no «more» link with three or fewer', () => {
    const vm = build({}, { pending: [pending('expense', 1, 'Uno')] })
    expect(vm.pending.moreLabel).toBeNull()
  })
})

describe('Patrimonio', () => {
  const months = (values: number[]): State['snapshots'] =>
    Object.fromEntries(
      values.map((value, index) => [
        String(index + 1),
        { month: index + 1, accounts: { bank: value } } as unknown as State['snapshots'][string],
      ]),
    )

  it('gives the net worth with its change this month and this year', () => {
    const vm = build({ snapshots: months([100000, 0, 0, 0, 0, 0, 0, 0, 146180.37, 148320.57]) })
    expect(vm.wealth.value).toBe('148.320,57 €')
    expect(vm.wealth.monthChange).toEqual({ text: '+2.140,20 € (+1,5 %)', tone: 'gain' })
    expect(vm.wealth.yearChange).toEqual({ text: '+48.320,57 €', tone: 'gain' })
  })

  it('draws the range picked: two months, six or the year so far', () => {
    const snapshots = months([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => n * 1000))
    expect(build({ snapshots }, { range: '1m' }).wealth.chart.labels).toEqual(['sep', 'oct'])
    expect(build({ snapshots }, { range: '6m' }).wealth.chart.labels).toEqual([
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
    ])
    expect(build({ snapshots }, { range: '1a' }).wealth.chart.labels).toHaveLength(10)
  })

  it('names the evolution for screen readers', () => {
    const vm = build({ snapshots: months([1000, 1500]) }, { today: '2026-02-10', range: '1m' })
    expect(vm.wealth.chart.label).toBe('Evolución del patrimonio: de 1.000,00 € a 1.500,00 €')
  })
})

describe('the recent movements', () => {
  const transactions = [
    tx('2026-10-01', 'expense', 650, { description: 'Alquiler', category: 'Casa' }),
    tx('2026-10-03', 'income', 3420, { description: 'Nómina' }),
    tx('2026-10-08', 'investment', 300, { description: 'Compra IWDA' }),
    tx('2026-10-07', 'saving', 200, { description: 'Hucha' }),
    tx('2026-09-30', 'expense', 10, { description: 'Septiembre' }),
  ]

  it('lists the month, newest first, signed by effect and with a saving unsigned', () => {
    const vm = build({ transactions })
    expect(vm.recent.items.map((item) => [item.description, item.amount, item.date])).toEqual([
      ['Compra IWDA', '−300,00 €', '8 oct'],
      ['Hucha', '200,00 €', '7 oct'],
      ['Nómina', '+3.420,00 €', '3 oct'],
      ['Alquiler', '−650,00 €', '1 oct'],
    ])
  })

  it('keeps only the type of the filter', () => {
    const vm = build({ transactions }, { recentFilter: 'expense' })
    expect(vm.recent.items.map((item) => item.description)).toEqual(['Alquiler'])
  })

  it('says why the list is empty', () => {
    expect(build({ transactions }, { recentFilter: 'saving' }).recent.items).toHaveLength(1)
    expect(build({}, { recentFilter: 'saving' }).recent.empty).toBe(
      'Aún no has apartado nada este mes.',
    )
    expect(build({}, { recentFilter: 'income' }).recent.empty).toBe(
      'No hay movimientos de este tipo este mes.',
    )
  })
})

describe('Gasto por categoría', () => {
  const budget = (expense: Record<string, number>) => ({
    income: {},
    saving: {},
    investment: {},
    expense: Object.fromEntries(
      Object.entries(expense).map(([category, limit]) => [
        category,
        Array.from({ length: 12 }, (_, index) => (index === 9 ? limit : 0)),
      ]),
    ),
  })

  it('measures what each category spent against its limit, biggest first', () => {
    const vm = build({
      budget: budget({ Súper: 400, Casa: 650, Ocio: 100 }),
      transactions: [
        tx('2026-10-02', 'expense', 214.8, { category: 'Súper' }),
        tx('2026-10-01', 'expense', 650, { category: 'Casa' }),
        tx('2026-10-04', 'expense', 125, { category: 'Ocio' }),
      ],
    } as Partial<State>)
    expect(
      vm.categories.map(({ category, spent, limit, width, over }) => [
        category,
        spent,
        limit,
        width,
        over,
      ]),
    ).toEqual([
      ['Casa', '650,00 €', '650,00 €', 100, false],
      ['Súper', '214,80 €', '400,00 €', 53.7, false],
      ['Ocio', '125,00 €', '100,00 €', 100, true],
    ])
  })

  it('keeps a category without a limit, with no bar', () => {
    const vm = build({ transactions: [tx('2026-10-02', 'expense', 20, { category: 'Ocio' })] })
    expect(vm.categories).toEqual([
      { category: 'Ocio', spent: '20,00 €', limit: null, width: 0, over: false },
    ])
  })
})

describe('Objetivos', () => {
  it('lists the defined net worth goals with progress and what is left', () => {
    const vm = build({
      goals: {
        ...state().goals,
        short: { name: 'Fondo de emergencia', targetYear: 2027, targetAmount: 20000 },
        medium: { name: 'Colchón', targetYear: 2026, targetAmount: 5000 },
      },
    })
    expect(
      vm.goals.map(({ name, progress, width, detail }) => [name, progress, width, detail]),
    ).toEqual([
      ['Fondo de emergencia', '50 %', 50, '10.000,00 € de 20.000,00 € · para 2027'],
      ['Colchón', '100 %', 100, '10.000,00 € · objetivo alcanzado'],
    ])
  })

  it('leaves out the goals still to define', () => {
    expect(build().goals).toEqual([])
  })
})

describe('Inversiones', () => {
  it('is empty without a portfolio', () => {
    expect(build().investments.empty).toBe(true)
  })

  it('splits the portfolio by position, the fifth and later as «Otros»', () => {
    const assets = [5000, 2000, 1500, 1000, 300, 200].map((value, index) => ({
      id: `asset-${index}`,
      name: `Fondo ${index + 1}`,
      openingBalance: value,
    }))
    const vm = build({ investmentAssets: assets } as unknown as Partial<State>)
    expect(vm.investments.empty).toBe(false)
    expect(vm.investments.value).toBe('10.000,00 €')
    expect(vm.investments.positions.map(({ name, share }) => [name, share])).toEqual([
      ['Fondo 1', '50,0 %'],
      ['Fondo 2', '20,0 %'],
      ['Fondo 3', '15,0 %'],
      ['Fondo 4', '10,0 %'],
      ['Otros', '5,0 %'],
    ])
  })
})
