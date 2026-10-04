import { describe, expect, it } from 'vitest'

import { buildGoalsViewModel, previewGoalEdit } from '../../src/domain/goals/view-model'
import type { Goal, GoalKey, State } from '../../src/scripts/types'

/** 3 October 2026: the deadlines are the end of each target year. */
const NOW = new Date(2026, 9, 3)

const GOALS: Record<GoalKey, Goal> = {
  short: { name: 'Fondo de emergencia', targetYear: 2026, targetAmount: 12000 },
  medium: { name: 'Entrada piso', targetYear: 2029, targetAmount: 40000 },
  long: { name: 'Libertad financiera', targetYear: 2036, targetAmount: 150000 },
  investmentTotal: { name: 'Cartera total', targetYear: 2028, targetAmount: 25000 },
  investmentFunds: { name: 'Fondos indexados', targetYear: 2028, targetAmount: 20000 },
  investmentCrypto: { name: 'Criptomonedas', targetYear: 2028, targetAmount: 4000 },
}

/** Net worth 31.480 €: 12.840 € in the bank plus a 18.640 € portfolio. */
function state(goals: Partial<Record<GoalKey, Goal>> = {}): State {
  return {
    year: 2026,
    accounts: [{ id: 'bank', name: 'Banco', openingBalance: 12840 }],
    investmentAssets: [
      { id: 'funds', name: 'Fondos indexados', openingBalance: 11420 },
      { id: 'crypto', name: 'Crypto', openingBalance: 1640 },
      { id: 'gold', name: 'Oro', openingBalance: 5580 },
    ],
    liabilities: [],
    transactions: [],
    snapshots: {},
    goals: { ...GOALS, ...goals },
  } as unknown as State
}

const SEPTEMBER = 8

describe('buildGoalsViewModel', () => {
  it('measures the three term goals against net worth and the rest against the portfolio', () => {
    const vm = buildGoalsViewModel(state(), SEPTEMBER, NOW)

    expect(vm.net.rows.map((row) => [row.key, row.current])).toEqual([
      ['short', 31480],
      ['medium', 31480],
      ['long', 31480],
    ])
    expect(vm.investment.rows.map((row) => [row.key, row.current, row.child])).toEqual([
      ['investmentTotal', 18640, false],
      ['investmentFunds', 11420, true],
      ['investmentCrypto', 1640, true],
    ])
  })

  it('works out what is left and the monthly amount until December of the target year', () => {
    const [short, medium] = buildGoalsViewModel(state(), SEPTEMBER, NOW).net.rows

    expect(medium).toMatchObject({
      target: 40000,
      remaining: 8520,
      monthsLeft: 38,
      monthlyNeeded: 224.21,
      met: false,
    })
    expect(medium.progress).toBeCloseTo(78.7, 2)
    expect(short).toMatchObject({ met: true, remaining: -19480, monthlyNeeded: 0, progress: 100 })
  })

  it('draws the term goals on one scale, with net worth as the cursor', () => {
    const { net } = buildGoalsViewModel(state(), SEPTEMBER, NOW)

    expect(net.scaleMax).toBe(150000)
    expect(net.cursor).toBeCloseTo(20.99, 2)
    expect(net.rows.map((row) => Number(row.track.toFixed(2)))).toEqual([8, 26.67, 100])
  })

  it('stretches the scale to net worth when it is past every goal', () => {
    const { net } = buildGoalsViewModel(
      state({
        medium: { ...GOALS.medium, targetAmount: 30000 },
        long: { ...GOALS.long, targetAmount: 20000 },
      }),
      SEPTEMBER,
      NOW,
    )

    expect(net.scaleMax).toBe(31480)
    expect(net.cursor).toBe(100)
  })

  it('takes the highest monthly amount as the pace that meets every term goal', () => {
    const { pace } = buildGoalsViewModel(state(), SEPTEMBER, NOW)

    expect(pace.net).toEqual({ rate: 971.48, by: ['long'] })
  })

  it('sets the portfolio pace by its parts when funds and crypto need more than the total', () => {
    const { pace } = buildGoalsViewModel(state(), SEPTEMBER, NOW)

    expect(pace.investment).toEqual({
      rate: 420.77,
      by: ['investmentFunds', 'investmentCrypto'],
    })
  })

  it('sets the portfolio pace by the total when it needs more than its parts', () => {
    const { pace } = buildGoalsViewModel(
      state({ investmentTotal: { ...GOALS.investmentTotal, targetAmount: 40000 } }),
      SEPTEMBER,
      NOW,
    )

    expect(pace.investment).toEqual({ rate: 821.54, by: ['investmentTotal'] })
  })

  it('counts the goals met and finds the next pending deadline', () => {
    const vm = buildGoalsViewModel(state(), SEPTEMBER, NOW)

    expect(vm.met).toEqual({ count: 1, total: 6 })
    expect(vm.next).toEqual({ targetYear: 2028 })
  })

  it('splits the portfolio goal between funds, crypto and the rest', () => {
    const { allocation } = buildGoalsViewModel(state(), SEPTEMBER, NOW).investment

    expect(allocation).toEqual({ funds: 20000, crypto: 4000, total: 25000, rest: 1000 })
  })

  it('leaves a goal without amount undefined, out of the counts, pace and scale', () => {
    const vm = buildGoalsViewModel(
      state({ long: { name: '', targetYear: 2036, targetAmount: 0 } }),
      SEPTEMBER,
      NOW,
    )
    const long = vm.net.rows[2]

    expect(long).toMatchObject({ defined: false, met: false, monthlyNeeded: 0, track: 0 })
    expect(long.name).toBe('Largo plazo')
    expect(vm.net.scaleMax).toBe(40000)
    expect(vm.pace.net).toEqual({ rate: 224.21, by: ['medium'] })
    expect(vm.met).toEqual({ count: 1, total: 5 })
  })

  it('names a goal by its slot title when it has none, telling the portfolio parts apart', () => {
    const vm = buildGoalsViewModel(
      state({ medium: { ...GOALS.medium, name: '  ' } }),
      SEPTEMBER,
      NOW,
    )

    expect(vm.net.rows[1].name).toBe('Medio plazo')

    const parts = buildGoalsViewModel(
      state({
        investmentFunds: { ...GOALS.investmentFunds, name: '' },
        investmentCrypto: { ...GOALS.investmentCrypto, name: '' },
      }),
      SEPTEMBER,
      NOW,
    ).investment.rows
    expect(parts.map((row) => row.name)).toEqual([
      'Cartera total',
      'Fondos indexados',
      'Criptomonedas',
    ])
  })
})

describe('previewGoalEdit', () => {
  it('measures the draft and the pace of its group before and after', () => {
    const preview = previewGoalEdit(
      state(),
      SEPTEMBER,
      'long',
      { name: 'Libertad', targetYear: 2040, targetAmount: 150000 },
      NOW,
    )

    expect(preview.row).toMatchObject({ name: 'Libertad', monthsLeft: 170, monthlyNeeded: 697.18 })
    expect(preview.group).toBe('net')
    expect(preview.before).toEqual({ rate: 971.48, by: ['long'] })
    expect(preview.after).toEqual({ rate: 697.18, by: ['long'] })
    expect(preview.names.long).toBe('Libertad')
  })

  it('reads the portfolio pace for a portfolio goal', () => {
    const preview = previewGoalEdit(
      state(),
      SEPTEMBER,
      'investmentCrypto',
      { ...GOALS.investmentCrypto, targetAmount: 1000 },
      NOW,
    )

    expect(preview.group).toBe('investment')
    expect(preview.row.met).toBe(true)
    expect(preview.after).toEqual({ rate: 330, by: ['investmentFunds'] })
  })
})
