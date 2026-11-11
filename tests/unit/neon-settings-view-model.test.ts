import { describe, expect, it } from 'vitest'

import {
  accountsTable,
  alertsLabel,
  assetsTable,
  liabilitiesTable,
  parseAmount,
  parseCurrency,
  parseYear,
  partCounts,
  rulesTable,
} from '../../src/neon/sections/settings/view-model'
import type { RecurringRule } from '../../src/scripts/types'

function rule(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: 'r1',
    type: 'expense',
    accountId: 'nomina',
    category: 'Ocio',
    description: 'Spotify',
    amount: 10,
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-10',
    endDate: null,
    active: true,
    lastExecutionDate: null,
    nextOccurrenceDate: '2026-10-10',
    ...overrides,
  } as RecurringRule
}

describe('campos escritos a mano', () => {
  it('lee importes con coma o punto y rechaza lo que no es un número', () => {
    expect(parseAmount('1.250,5')).toBe(1250.5)
    expect(parseAmount('64,32')).toBe(64.32)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })

  it('acepta solo años de 2000 a 2100', () => {
    expect(parseYear('2026')).toBe(2026)
    expect(parseYear(' 2100 ')).toBe(2100)
    expect(parseYear('1999')).toBeNull()
    expect(parseYear('20.5')).toBeNull()
  })

  it('normaliza la moneda a tres letras en mayúsculas', () => {
    expect(parseCurrency(' usd ')).toBe('USD')
    expect(parseCurrency('EU')).toBeNull()
    expect(parseCurrency('E1R')).toBeNull()
  })
})

describe('tabla de cuentas', () => {
  const accounts = [
    { id: 'a', name: 'Nómina', openingBalance: 1850, twrLiquidity: true, cashWatchlistId: 'wl' },
    { id: 'b', name: 'Fondo', openingBalance: 15000, twrLiquidity: true, cashWatchlistId: '' },
    { id: 'c', name: 'Casa', openingBalance: 100.5, twrLiquidity: false, cashWatchlistId: '' },
  ]

  it('suma el saldo inicial y cuenta las cuentas de liquidez', () => {
    const table = accountsTable(accounts, () => 'Efectivo EUR')
    expect(table.total).toBeCloseTo(16950.5)
    expect(table.liquidityNote).toBe('2 de 3 en liquidez')
  })

  it('dice qué lista de efectivo tiene cada cuenta', () => {
    const rows = accountsTable(accounts, (id) => (id === 'wl' ? 'Efectivo EUR' : '')).rows
    expect(rows.map((row) => [row.liquidity, row.list])).toEqual([
      ['Incluida', 'Efectivo EUR'],
      ['Incluida', 'Sin lista'],
      ['—', '—'],
    ])
  })
})

describe('tabla de activos', () => {
  const base = { id: 'x', name: 'VWCE', openingBalance: 1000, linked: 4, symbols: ['VWCE'] }

  it('describe la cotización del primer instrumento', () => {
    const [row] = assetsTable([
      {
        ...base,
        pending: 0,
        sync: { label: 'En la lista', tone: 'gain' },
        instruments: [
          {
            id: 'i',
            symbol: 'VWCE',
            type: 'etf',
            market: 'DE',
            currency: 'EUR',
            provider: 'yahoo',
            linked: 4,
            pending: 0,
          },
        ],
      },
    ]).rows
    expect(row).toMatchObject({
      kind: 'ETF',
      symbol: 'VWCE',
      provider: 'Yahoo Finance',
      sync: 'En la lista',
      warn: false,
    })
  })

  it('avisa de los movimientos por vincular y de los símbolos que no sincronizan', () => {
    const table = assetsTable([
      {
        ...base,
        id: 'a',
        pending: 2,
        sync: { label: 'En la lista', tone: 'gain' },
        instruments: [],
      },
      {
        ...base,
        id: 'b',
        pending: 0,
        sync: { label: 'Falta la lista', tone: 'warn' },
        instruments: [],
      },
      { ...base, id: 'c', pending: 0, sync: { label: 'Sin símbolo', tone: null }, instruments: [] },
    ])
    expect(table.rows.map((row) => row.warn)).toEqual([true, true, false])
    expect(table.rows[0].sync).toBe('Revisar 2 movimientos')
    expect(table.alerts).toBe(2)
    expect(table.total).toBe(3000)
  })

  it('escribe el aviso del encabezado en singular y plural', () => {
    expect(alertsLabel(0)).toBe('')
    expect(alertsLabel(1)).toBe('1 aviso en Activos')
    expect(alertsLabel(3)).toBe('3 avisos en Activos')
  })
})

describe('tabla de pasivos', () => {
  it('suma la deuda de partida', () => {
    const table = liabilitiesTable([
      { id: 'a', name: 'Tarjeta', openingBalance: 0 },
      { id: 'b', name: 'Préstamo', openingBalance: 1200.25 },
    ])
    expect(table.total).toBe(1200.25)
    expect(table.rows).toHaveLength(2)
  })
})

describe('tabla de reglas recurrentes', () => {
  const accounts = [{ id: 'nomina', name: 'Cuenta nómina', openingBalance: 0 }]

  it('deja fuera las compras recurrentes de inversión', () => {
    const table = rulesTable([rule({}), rule({ id: 'inv', type: 'investment' })], accounts)
    expect(table.rows.map((row) => row.id)).toEqual(['r1'])
  })

  it('suma el neto mensual de las activas, sin los ahorros ni las pausadas', () => {
    const table = rulesTable(
      [
        rule({ id: 'a', type: 'income', amount: 3000 }),
        rule({ id: 'b', amount: 100 }),
        rule({ id: 'c', type: 'saving', amount: 500 }),
        rule({ id: 'd', amount: 40, active: false }),
        rule({ id: 'e', amount: 120, frequency: 'yearly' }),
      ],
      accounts,
    )
    // 3.000 − 100 − 120 / 12.
    expect(table.net).toBeCloseTo(2890)
    expect(table.netText.startsWith('≈ +')).toBe(true)
  })

  it('firma los importes y explica una regla sin próxima fecha', () => {
    const rows = rulesTable(
      [
        rule({ id: 'a', type: 'income', amount: 50 }),
        rule({ id: 'b', amount: 20, active: false }),
        rule({ id: 'c', type: 'saving', amount: 80, nextOccurrenceDate: null }),
      ],
      accounts,
    ).rows
    expect(rows[0].amount).toMatch(/^\+50,00/)
    expect(rows[1].amount).toMatch(/^−20,00/)
    expect(rows[1].next).toBe('En pausa')
    expect(rows[2].amount).toMatch(/^80,00/)
    expect(rows[2].next).toBe('Sin vencimientos')
    expect(rows[0].detail).toBe('Ocio · Cuenta nómina')
  })
})

describe('contadores del índice', () => {
  it('cuenta cada apartado y deja sin cifra los que no son una lista', () => {
    const counts = partCounts({
      accounts: [{ id: 'a', name: 'A', openingBalance: 0 }],
      investmentAssets: [],
      liabilities: [],
      incomeCategories: ['Nómina'],
      expenseCategories: ['Súper', 'Casa'],
      savingCategories: [],
      investmentCategories: ['VWCE'],
      recurringRules: [rule({}), rule({ id: 'i', type: 'investment' })],
    })
    expect(counts).toMatchObject({
      cuentas: 1,
      activos: 0,
      categorias: 4,
      recurrentes: 1,
      preferencias: null,
      seguridad: null,
    })
  })
})
