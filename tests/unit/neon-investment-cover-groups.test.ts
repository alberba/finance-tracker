import { describe, expect, it } from 'vitest'

import { buildInvestmentDashboardViewModel } from '../../src/domain/investment/view-model'
import {
  groupingOptions,
  instrumentRows,
  sortCover,
  typeSections,
} from '../../src/neon/sections/investment/cover-groups'
import { accountRows } from '../../src/neon/sections/investment/view-model'
import type { Month } from '../../src/lib/month'
import { normalizeState } from '../../src/scripts/state'

const NBSP = ' '

function instrument(id: string, accountId: string, symbol: string, type: string) {
  return {
    id,
    investmentAssetId: accountId,
    type,
    symbol,
    market: 'X',
    currency: 'EUR',
    provider: 'yahoo',
    active: true,
  }
}

function buy(
  id: string,
  date: string,
  units: number,
  unitPrice: number,
  accountId: string,
  instrumentId: string,
) {
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'investment',
    accountId: 'cash',
    category: 'Inversión',
    description: `buy ${units}`,
    amount: units * unitPrice,
    side: 'buy',
    units,
    unitPrice,
    instrumentId,
    destinationAccountId: accountId,
  }
}

function quote(instrumentId: string, price: number) {
  return {
    instrumentId,
    price,
    currency: 'EUR',
    timestamp: '2026-03-10T10:00:00.000Z',
    fetchedAt: '2026-03-10T10:00:00.000Z',
    dataType: 'live',
    source: 'test',
    status: 'fresh',
    isStale: false,
    previousClose: null,
    changePercent: null,
  }
}

// ETH está en Bitvavo (2) y en Trade Republic (3); BTC en Bitvavo; XDWH, un ETF,
// en Trade Republic. Todo cotiza.
function state() {
  return normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [
      { id: 'bitvavo', name: 'Bitvavo', openingBalance: 0 },
      { id: 'tr', name: 'Trade Republic', openingBalance: 0 },
    ],
    liabilities: [],
    instruments: [
      instrument('i-btc', 'bitvavo', 'BTC', 'crypto'),
      instrument('i-eth', 'bitvavo', 'ETH', 'crypto'),
      instrument('i-xdwh', 'tr', 'XDWH', 'etf'),
    ],
    quotes: {
      'i-btc': quote('i-btc', 3000),
      'i-eth': quote('i-eth', 200),
      'i-xdwh': quote('i-xdwh', 120),
    },
    transactions: [
      buy('t1', '2026-01-10', 1, 1000, 'bitvavo', 'i-btc'),
      buy('t2', '2026-01-11', 2, 100, 'bitvavo', 'i-eth'),
      buy('t3', '2026-01-12', 3, 100, 'tr', 'i-eth'),
      buy('t4', '2026-02-01', 10, 100, 'tr', 'i-xdwh'),
    ],
    snapshots: {},
    contributions: [],
  })
}

const model = () => {
  const current = state()
  return {
    current,
    vm: buildInvestmentDashboardViewModel(current, 3, 'simple', { quotes: true }),
  }
}

describe('portada agrupada por cuenta', () => {
  it('lista las cuentas con sus posiciones, valor, peso y resultado', () => {
    const { current, vm } = model()
    const rows = accountRows(current, vm, 3)

    expect(rows.map((row) => [row.id, row.holdings, row.value])).toEqual([
      ['tr', '2 posiciones', `1.300,00${NBSP}€`],
      ['bitvavo', '2 posiciones', `1.200,00${NBSP}€`],
    ])
  })
})

describe('portada agrupada por instrumento', () => {
  it('suma entre cuentas un instrumento que está en varias y dice en cuántas está', () => {
    const { vm } = model()
    const rows = instrumentRows(vm)

    expect(rows.map((row) => row.id)).toEqual(['i-btc', 'i-xdwh', 'i-eth'])
    expect(rows.find((row) => row.id === 'i-eth')).toMatchObject({
      name: 'ETH',
      typeLabel: 'Cripto',
      holdings: '2 cuentas',
      value: `1.000,00${NBSP}€`,
      gain: `+500,00${NBSP}€`,
      ret: `+100,0${NBSP}%`,
      tone: 'gain',
      openLabel: 'Ver ETH',
    })
    expect(rows.find((row) => row.id === 'i-btc')?.holdings).toBe('1 cuenta')
  })

  it('el peso de cada fila es su parte del total y todas suman 100', () => {
    const { vm } = model()
    const rows = instrumentRows(vm)

    expect(rows.reduce((sum, row) => sum + row.weightPct, 0)).toBeCloseTo(100)
    expect(rows[0].weightPct).toBeCloseTo((3000 / 5200) * 100)
  })
})

describe('portada agrupada por tipo', () => {
  it('una sección por tipo del instrumento, con sus cifras sumadas y sus instrumentos dentro', () => {
    const { vm } = model()
    const sections = typeSections(vm)

    expect(sections.map((section) => section.title)).toEqual(['Cripto', 'ETF'])
    const [crypto, etf] = sections
    expect(crypto).toMatchObject({
      id: 'crypto',
      summary: {
        value: `4.000,00${NBSP}€`,
        gain: `+2.500,00${NBSP}€`,
        ret: `+166,7${NBSP}%`,
        tone: 'gain',
      },
    })
    expect(crypto.rows.map((row) => row.name)).toEqual(['BTC', 'ETH'])
    expect(etf.rows.map((row) => row.name)).toEqual(['XDWH'])
    expect(crypto.summary.weightPct + etf.summary.weightPct).toBeCloseTo(100)
  })
})

describe('ordenar la portada agrupada', () => {
  it('por ganancia, en los dos sentidos, tanto las secciones como sus filas', () => {
    const { vm } = model()
    const sections = typeSections(vm)

    const asc = sortCover(sections, 'gain', 'asc')
    expect(asc.map((section) => section.id)).toEqual(['etf', 'crypto'])
    expect(asc[1].rows.map((row) => row.name)).toEqual(['ETH', 'BTC'])
  })
})

describe('opciones de agrupación', () => {
  it('ofrece cuenta, instrumento y tipo, y marca la elegida', () => {
    expect(groupingOptions()).toEqual([
      { value: 'account', label: 'Cuenta' },
      { value: 'instrument', label: 'Instrumento' },
      { value: 'type', label: 'Tipo' },
    ])
  })
})
