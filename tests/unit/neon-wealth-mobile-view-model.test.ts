import { describe, expect, it } from 'vitest'

import { buildWealthViewModel } from '../../src/domain/wealth/view-model'
import type { Month } from '../../src/lib/month'
import type { State } from '../../src/scripts/types'
import {
  ACCOUNT_FILTERS,
  mobileAccounts,
  monthHistory,
} from '../../src/neon/sections/wealth/mobile-view-model'

/**
 * A past year, so every month is available: January is closed in full,
 * February only stores the bank, March brings a 400 € income to the bank.
 *
 *          bank   cash   fund   car (debt)   net
 *   Jan    1000     50   2000   500          2550
 *   Feb    1200     50   2000   500          2750
 *   Mar+   1600     50   2000   500          3150
 */
function state(): State {
  return {
    year: 2020,
    accounts: [
      { id: 'bank', name: 'Banco', openingBalance: 1000 },
      { id: 'cash', name: 'Efectivo en mano', openingBalance: 50 },
    ],
    investmentAssets: [{ id: 'fund', name: 'Fondo', openingBalance: 2000 }],
    liabilities: [{ id: 'car', name: 'Coche', openingBalance: 500 }],
    transactions: [
      {
        id: 'pay',
        date: '2020-03-05',
        month: 3,
        type: 'income',
        accountId: 'bank',
        category: 'Nómina',
        description: 'Nómina',
        amount: 400,
      },
    ],
    snapshots: {
      '1': {
        month: 1,
        accounts: { bank: 1000, cash: 50 },
        investments: { fund: 2000 },
        liabilities: { car: 500 },
      },
      '2': { month: 2, accounts: { bank: 1200 }, investments: {}, liabilities: {} },
    },
  } as unknown as State
}

const vm = (month: Month = 3) => buildWealthViewModel(state(), month)

describe('mobileAccounts', () => {
  it('lists every account of every group with its group and weight in it', () => {
    const rows = mobileAccounts(vm(), 3, 'all')

    expect(rows.map((row) => [row.name, row.initial, row.note])).toEqual([
      ['Banco', 'B', 'Efectivo · 97\u00a0%'],
      ['Efectivo en mano', 'E', 'Efectivo · 3\u00a0%'],
      ['Fondo', 'F', 'Inversión · 100\u00a0%'],
      ['Coche', 'C', 'Pasivos · 100\u00a0%'],
    ])
    expect(rows[0]).toMatchObject({ id: 'bank', kind: 'accounts', value: '1.600 €' })
  })

  it('keeps only the group that was picked', () => {
    expect(mobileAccounts(vm(), 3, 'investments').map((row) => row.name)).toEqual(['Fondo'])
    expect(mobileAccounts(vm(), 3, 'liabilities').map((row) => row.value)).toEqual(['−500 €'])
  })

  it('offers the groups in the order of the cover', () => {
    expect(ACCOUNT_FILTERS.map((filter) => filter.label)).toEqual([
      'Todo',
      'Efectivo',
      'Inversión',
      'Pasivos',
    ])
  })
})

describe('monthHistory', () => {
  it('reads the latest month first, with its net, whether it is closed and its groups', () => {
    const [latest] = monthHistory(vm())
    expect(latest.month).toBe(12)

    const months = monthHistory(vm())
    const january = months.find((entry) => entry.month === 1)
    const february = months.find((entry) => entry.month === 2)
    expect(january).toMatchObject({
      label: 'Enero',
      net: '2.550,00 €',
      closed: true,
      summary: 'Cerrado · Efectivo 1.050 · Inversión 2.000 · Pasivos 500',
    })
    expect(february).toMatchObject({ net: '2.750,00 €', closed: true })
    expect(months.find((entry) => entry.month === 3)).toMatchObject({
      closed: false,
      net: '3.150,00 €',
      summary: 'Sin cerrar · Efectivo 1.650 · Inversión 2.000 · Pasivos 500',
      aria: 'Marzo, sin cerrar: 3.150,00 €',
    })
  })

  it('walks from December back to January', () => {
    expect(monthHistory(vm()).map((entry) => entry.month)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ])
  })
})
