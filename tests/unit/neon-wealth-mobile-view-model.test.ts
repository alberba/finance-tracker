import { describe, expect, it } from 'vitest'

import { buildWealthViewModel } from '../../src/domain/wealth/view-model'
import type { Month } from '../../src/lib/month'
import type { State } from '../../src/scripts/types'
import {
  mobileAccountGroups,
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

describe('mobileAccountGroups', () => {
  it('gives every group with its total and its accounts as tiles', () => {
    const groups = mobileAccountGroups(vm(), 3, 'all')

    expect(groups.map((group) => [group.title, group.total])).toEqual([
      ['Efectivo', '1.650\u00a0€'],
      ['Inversión', '2.000\u00a0€'],
      ['Pasivos', '−500\u00a0€'],
    ])
    expect(groups[0].tiles.map((tile) => [tile.name, tile.value])).toEqual([
      ['Banco', '1.600\u00a0€'],
      ['Efectivo en mano', '50\u00a0€'],
    ])
    expect(groups[0].tiles[0]).toMatchObject({ id: 'bank', kind: 'accounts' })
  })

  it('tells what each account moved since the month before, coloured only when it is big', () => {
    const [cash, investment] = mobileAccountGroups(vm(), 3, 'all')
    // The bank went from 1.200 to 1.600: big enough to take colour.
    expect(cash.tiles[0].change).toEqual({ text: '+400\u00a0€', tone: 'gain' })
    expect(cash.tiles[1].change).toEqual({ text: 'Sin cambios', tone: 'muted' })
    expect(investment.tiles[0].change?.tone).toBe('muted')
    expect(cash.tiles[0].aria).toBe('Banco: 1.600\u00a0€, +400\u00a0€ este mes. Ver mes a mes')
  })

  it('leaves out a group without accounts', () => {
    const empty = state()
    empty.liabilities = []
    const view = buildWealthViewModel(empty, 3)
    expect(mobileAccountGroups(view, 3, 'all').map((group) => group.kind)).toEqual([
      'accounts',
      'investments',
    ])
    expect(mobileAccountGroups(view, 3, 'liabilities')).toEqual([])
  })

  it('has no month before in January', () => {
    const [cash] = mobileAccountGroups(vm(1), 1, 'all')
    expect(cash.tiles[0].change).toBeNull()
  })

  it('keeps only the group that was picked', () => {
    expect(mobileAccountGroups(vm(), 3, 'investments').map((group) => group.title)).toEqual([
      'Inversión',
    ])
    expect(mobileAccountGroups(vm(), 3, 'liabilities')[0].tiles[0].value).toBe('−500\u00a0€')
  })
})

describe('monthHistory', () => {
  it('reads the latest month first, with its net, whether it is closed and its groups', () => {
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
