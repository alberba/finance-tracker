import { describe, expect, it } from 'vitest'

import type { Month } from '../../src/lib/month'
import {
  freeSaving,
  goalColumns,
  goalPlans,
  monthlySaving,
  newGoalFit,
  parseAmount,
  selectedGoal,
  splitView,
} from '../../src/neon/sections/goals/view-model'
import type { SavingGoal, State, Transaction } from '../../src/scripts/types'

/** 9 October 2026, the day the artboard is drawn on. */
const NOW = new Date(2026, 9, 9)

function saving(date: string, category: string, amount: number): Transaction {
  return {
    id: `${date}-${category}-${amount}`,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'saving',
    accountId: 'nomina',
    destinationAccountId: 'hucha',
    category,
    description: category,
    amount,
  }
}

function goal(id: string, targetAmount: number, plan: Partial<SavingGoal> = {}): SavingGoal {
  return { id, name: id, category: id, targetAmount, ...plan }
}

function state(goals: SavingGoal[], transactions: Transaction[]): State {
  return { savingGoals: goals, transactions } as unknown as State
}

// The four goals of the artboard, each with what it has saved so far.
const ARTBOARD = state(
  [
    goal('Fondo de emergencia', 20000, { targetYear: 2026, targetMonth: 12, monthlyAmount: 400 }),
    goal('Viaje a Japón', 4500, { targetYear: 2027, targetMonth: 3, monthlyAmount: 250 }),
    goal('Coche', 6000, { targetYear: 2028, targetMonth: 12, monthlyAmount: 150 }),
    goal('Entrada del piso', 60000, { targetYear: 2034, targetMonth: 12, monthlyAmount: 400 }),
  ],
  [
    saving('2024-01-05', 'Fondo de emergencia', 18000),
    saving('2026-01-05', 'Viaje a Japón', 2150),
    saving('2025-06-05', 'Coche', 1800),
    saving('2024-01-05', 'Entrada del piso', 24300),
  ],
)

describe('goal columns', () => {
  it('says when each goal arrives at its monthly amount and how late, the latest first', () => {
    const columns = goalColumns(goalPlans(ARTBOARD), NOW)

    expect(
      columns.map(({ name, percent, arrival, verdict, late }) => ({
        name,
        percent,
        arrival,
        verdict,
        late,
      })),
    ).toEqual([
      {
        name: 'Viaje a Japón',
        percent: '48\u00a0%',
        arrival: 'ago 2027',
        verdict: '5 meses tarde',
        late: true,
      },
      {
        name: 'Fondo de emergencia',
        percent: '90\u00a0%',
        arrival: 'mar 2027',
        verdict: '3 meses tarde',
        late: true,
      },
      {
        name: 'Coche',
        percent: '30\u00a0%',
        arrival: 'feb 2029',
        verdict: '2 meses tarde',
        late: true,
      },
      {
        name: 'Entrada del piso',
        percent: '41\u00a0%',
        arrival: 'abr 2034',
        verdict: 'A tiempo',
        late: false,
      },
    ])
  })
})

describe('goal tube', () => {
  it('fills what is saved, what the monthly amount adds by the deadline and the gap left', () => {
    const japan = goalColumns(goalPlans(ARTBOARD), NOW).find((c) => c.name === 'Viaje a Japón')!

    // 2.150 of 4.500 saved; 250 € a month for the 5 months to March add 1.250.
    expect(japan.tube.saved).toBeCloseTo(47.78, 2)
    expect(japan.tube.projected).toBeCloseTo(75.56, 2)
    expect(japan.tube.short).toBeCloseTo(24.44, 2)
    // First saving in January 2026, due March 2027: 9 of 14 months gone.
    expect(japan.tube.today).toBeCloseTo(64.29, 2)
  })

  it('has no deadline marks for a goal without a deadline', () => {
    const [column] = goalColumns(
      goalPlans(state([goal('Bici', 1000, { monthlyAmount: 100 })], [])),
      NOW,
    )
    expect(column).toMatchObject({ arrival: 'ago 2027', verdict: 'Sin fecha límite', late: false })
    expect(column.tube).toEqual({ saved: 0, projected: 0, short: 0, today: null })
  })
})

describe('goal verdicts', () => {
  const plans = goalPlans(
    state(
      [
        goal('Quieto', 1000, { targetYear: 2027, targetMonth: 1 }),
        goal('Hecho', 500, { targetYear: 2027, targetMonth: 1, monthlyAmount: 50 }),
        goal('Justo', 300, { targetYear: 2027, targetMonth: 1, monthlyAmount: 100 }),
      ],
      [saving('2026-02-01', 'Hecho', 600)],
    ),
  )

  it('reads a goal with no monthly amount as not advancing, and shows it first', () => {
    expect(goalColumns(plans, NOW)[0]).toMatchObject({
      name: 'Quieto',
      arrival: 'Sin fecha',
      verdict: 'No avanza',
      late: true,
    })
  })

  it('reads a goal that arrives on its deadline month as just in time', () => {
    expect(goalColumns(plans, NOW)[1]).toMatchObject({
      name: 'Justo',
      arrival: 'ene 2027',
      verdict: 'Justo a tiempo',
      late: false,
    })
  })

  it('reads a met goal as done, full, and shows it last', () => {
    expect(goalColumns(plans, NOW)[2]).toMatchObject({
      name: 'Hecho',
      percent: '100 %',
      arrival: 'Conseguido',
      verdict: 'Meta alcanzada',
      late: false,
    })
  })
})

describe('selected goal', () => {
  const plans = goalPlans(ARTBOARD)
  const japan = plans.find((plan) => plan.name === 'Viaje a Japón')!

  it('reads the arrival at the amount on the slider and offers the amount that arrives on time', () => {
    // 2.350 left over the 5 months to March: 470 € a month.
    expect(selectedGoal(japan, 250, NOW)).toMatchObject({
      arrival: 'ago 2027',
      verdict: '5 meses tarde',
      late: true,
      monthly: '250\u00a0€',
      max: 950,
      action: { label: 'Subir a 470\u00a0€', amount: 470 },
    })
    expect(selectedGoal(japan, 470, NOW)).toMatchObject({
      arrival: 'mar 2027',
      verdict: 'Justo a tiempo',
      action: null,
    })
  })

  it('offers to lower an amount above what the deadline needs', () => {
    expect(selectedGoal(japan, 600, NOW)).toMatchObject({
      verdict: 'A tiempo',
      action: { label: 'Bajar a 470\u00a0€', amount: 470 },
    })
  })

  it('has no amount to offer without a deadline', () => {
    const [bike] = goalPlans(state([goal('Bici', 1000)], []))
    expect(selectedGoal(bike, 0, NOW)).toMatchObject({
      verdict: 'No avanza',
      action: null,
      max: 100,
    })
  })
})

describe('split of the monthly saving', () => {
  const plans = goalPlans(ARTBOARD)
  const ids = Object.fromEntries(plans.map((plan) => [plan.name, plan.id]))

  it('says where each goal arrives with its share and what is left to assign', () => {
    const view = splitView(
      plans,
      { [ids['Fondo de emergencia']]: 400, [ids['Viaje a Japón']]: 470, [ids.Coche]: 150 },
      1200,
      NOW,
    )

    expect(view.rows.map(({ name, line, late }) => ({ name, line, late }))).toEqual([
      { name: 'Fondo de emergencia', line: 'Llegas en mar 2027 · 3 meses tarde', late: true },
      { name: 'Viaje a Japón', line: 'Llegas en mar 2027 · justo a tiempo', late: false },
      { name: 'Coche', line: 'Llegas en feb 2029 · 2 meses tarde', late: true },
      { name: 'Entrada del piso', line: 'No avanza', late: true },
    ])
    expect(view.rest).toEqual({ label: 'Sin asignar', amount: '180\u00a0€', over: false })
    expect(view.segments.map((segment) => segment.width)).toEqual([
      (400 / 1200) * 100,
      (470 / 1200) * 100,
      (150 / 1200) * 100,
      0,
    ])
  })

  it('warns when the shares add up to more than is saved', () => {
    const view = splitView(plans, { [ids.Coche]: 1300 }, 1200, NOW)
    expect(view.rest).toEqual({
      label: 'Repartes más de lo que ahorras',
      amount: '100\u00a0€',
      over: true,
    })
    // The bar is measured against the larger of the two, so it never overflows.
    expect(view.segments.find((segment) => segment.name === 'Coche')!.width).toBe(100)
  })
})

describe('monthly saving and a new goal', () => {
  const budget = {
    saving: {
      Hucha: Array(12)
        .fill(0)
        .map((_, i) => (i === 9 ? 1200 : 900)),
      Coche: Array(12).fill(150),
    },
  }

  it('takes what the budget sets aside for saving this month', () => {
    expect(monthlySaving({ budget } as unknown as State, 2026, NOW)).toBe(1350)
    expect(monthlySaving({ budget } as unknown as State, 2025, NOW)).toBe(0)
  })

  it('leaves free what the goals do not already take', () => {
    expect(freeSaving(1350, goalPlans(ARTBOARD))).toBe(150)
    expect(freeSaving(1000, goalPlans(ARTBOARD))).toBe(0)
  })

  it('says what a new goal needs a month and whether it fits', () => {
    expect(newGoalFit(3800, 18, 300)).toEqual({
      needed: 212,
      text: 'Te cabe: tu presupuesto deja 300\u00a0€ libres al mes.',
      fits: true,
    })
    expect(newGoalFit(3800, 18, 150)).toEqual({
      needed: 212,
      text: 'No te cabe: tu presupuesto deja 150\u00a0€ libres al mes y faltan 62\u00a0€.',
      fits: false,
    })
    expect(newGoalFit(0, 18, 150)).toEqual({ needed: 0, text: 'Pon cuánto necesitas.', fits: true })
  })

  it('does not judge the fit when the budget sets nothing aside for saving', () => {
    expect(newGoalFit(3800, 18, null)).toEqual({
      needed: 212,
      text: 'Tu presupuesto no reserva ahorro este mes.',
      fits: true,
    })
  })
})

describe('amounts typed in the goals', () => {
  it('reads a dot before three digits as thousands, as the figures are written', () => {
    expect(parseAmount('3.600')).toBe(3600)
    expect(parseAmount('1.250.000')).toBe(1250000)
    expect(parseAmount('1.250,5')).toBe(1250.5)
    expect(parseAmount('64,32')).toBe(64.32)
    expect(parseAmount('12.5')).toBe(12.5)
    expect(parseAmount('')).toBeNaN()
  })
})
