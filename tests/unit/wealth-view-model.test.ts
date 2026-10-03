import { describe, expect, it } from 'vitest'

import {
  buildWealthViewModel,
  parseSnapshotInput,
  snapshotTotals,
  type SnapshotGroupViewModel,
} from '../../src/domain/wealth/view-model'
import type { State } from '../../src/scripts/types'

/** The slice of the state the wealth view reads. */
function state(): State {
  return {
    year: 2020,
    accounts: [
      { id: 'bank', name: 'Banco', openingBalance: 1000 },
      { id: 'cash', name: 'Efectivo', openingBalance: 50 },
    ],
    investmentAssets: [{ id: 'fund', name: 'Fondo', openingBalance: 2000 }],
    liabilities: [{ id: 'car', name: 'Coche', openingBalance: 500 }],
    transactions: [],
    snapshots: {
      '1': { month: 1, accounts: { bank: 1200 }, investments: {}, liabilities: {} },
    },
  } as unknown as State
}

describe('parseSnapshotInput', () => {
  it('reads an empty field as "use the calculated balance"', () => {
    expect(parseSnapshotInput('')).toBeNull()
    expect(parseSnapshotInput('  ')).toBeNull()
  })

  it('reads Spanish decimals, with or without thousands dots', () => {
    expect(parseSnapshotInput('999,99')).toBe(999.99)
    expect(parseSnapshotInput('1.234,5')).toBe(1234.5)
    expect(parseSnapshotInput('1300 €')).toBe(1300)
  })

  it('still reads a plain dot decimal', () => {
    expect(parseSnapshotInput('1250.40')).toBe(1250.4)
  })

  it('rounds to cents and flags what is not a number', () => {
    expect(parseSnapshotInput('10,005')).toBe(10.01)
    expect(Number.isNaN(parseSnapshotInput('abc'))).toBe(true)
  })
})

describe('buildWealthViewModel', () => {
  it('groups the snapshot rows into liquidity, investment and debt', () => {
    const vm = buildWealthViewModel(state(), 1)

    expect(vm.groups.map((group) => [group.kind, group.title, group.rows.length])).toEqual([
      ['accounts', 'Liquidez', 2],
      ['investments', 'Inversión', 1],
      ['liabilities', 'Deuda', 1],
    ])
    expect(vm.groups[0].rows[0]).toMatchObject({
      id: 'bank',
      opening: 1000,
      calculated: 1200,
      snapshot: 1200,
    })
    expect(vm.groups[0].rows[1].snapshot).toBeNull()
  })

  it('marks the months with a saved snapshot and the ones still to come', () => {
    const vm = buildWealthViewModel(state(), 1)

    expect(vm.months).toHaveLength(12)
    expect(vm.months[1]).toMatchObject({ label: 'Feb', name: 'febrero', saved: true })
    expect(vm.months[0].saved).toBe(false)
    // A past year shows every month.
    expect(vm.months.every((month) => month.available)).toBe(true)
  })

  it('keeps future months of the current year out of reach', () => {
    const current = state()
    current.year = new Date().getFullYear()
    const vm = buildWealthViewModel(current, 0)
    const thisMonth = new Date().getMonth()

    expect(vm.months[thisMonth].available).toBe(true)
    expect(vm.months.filter((month) => month.available)).toHaveLength(thisMonth + 1)
    expect(vm.history.months).toEqual(Array.from({ length: thisMonth + 1 }, (_, i) => i))
  })

  it('builds the history matrix with group subtotals, items and a total', () => {
    const vm = buildWealthViewModel(state(), 1)
    const rows = vm.history.rows

    expect(rows.map((row) => [row.kind, row.label])).toEqual([
      ['group', 'Liquidez'],
      ['item', 'Banco'],
      ['item', 'Efectivo'],
      ['group', 'Inversión'],
      ['item', 'Fondo'],
      ['group', 'Deuda'],
      ['item', 'Coche'],
      ['total', 'Total'],
    ])
    const february = vm.history.months.indexOf(1)
    expect(rows[1].values[february]).toBe(1200)
    expect(rows[0].values[february]).toBe(1250)
    // Debt reads negative so the column adds up to the total.
    expect(rows[6].values[february]).toBe(-500)
    expect(rows[7].values[february]).toBe(1250 + 2000 - 500)
  })
})

describe('snapshotTotals', () => {
  const groups: SnapshotGroupViewModel[] = buildWealthViewModel(state(), 1).groups

  it('uses the typed value and falls back to the calculated one', () => {
    const totals = snapshotTotals(groups, { 'accounts:cash': '70', 'accounts:bank': '' })

    expect(totals.accounts).toBe(1200 + 70)
    expect(totals.investments).toBe(2000)
    expect(totals.liabilities).toBe(500)
    expect(totals.net).toBe(1270 + 2000 - 500)
  })

  it('ignores an invalid value', () => {
    expect(snapshotTotals(groups, { 'accounts:cash': 'x' }).accounts).toBe(1250)
  })
})
