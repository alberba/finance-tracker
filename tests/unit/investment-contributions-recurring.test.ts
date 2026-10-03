import { describe, expect, it } from 'vitest'

import {
  buildContributionLedger,
  ruleMonthlyEquivalent,
  summarizeContributions,
  summarizeRecurringPlan,
} from '../../src/domain/investment/view-model'
import type { ContributionMetricRow, RecurringRule } from '../../src/scripts/types'

function rule(id: string, overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id,
    type: 'investment',
    accountId: 'broker',
    category: 'Fondos',
    description: id,
    amount: 100,
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    lastExecutionDate: null,
    nextOccurrenceDate: '2026-11-01',
    ...overrides,
  }
}

function metric(date: string, flow: number, overrides: Partial<ContributionMetricRow> = {}) {
  return {
    id: `c-${date}`,
    date,
    amount: flow,
    portfolioValue: 1000,
    flow,
    nav: 100,
    unitsBefore: 10,
    unitsAfter: 10,
    periodReturn: 0,
    cumulativeReturn: 0,
    ...overrides,
  }
}

describe('ruleMonthlyEquivalent', () => {
  it('keeps a monthly amount as it is', () => {
    expect(ruleMonthlyEquivalent(rule('m', { amount: 300 }))).toBe(300)
  })

  it('spreads a weekly amount over the 52 weeks of the year', () => {
    expect(ruleMonthlyEquivalent(rule('w', { amount: 25, frequency: 'weekly' }))).toBe(108.33)
  })

  it('divides by the interval: every 3 months is a third a month', () => {
    expect(ruleMonthlyEquivalent(rule('q', { amount: 150, interval: 3 }))).toBe(50)
  })

  it('turns a yearly amount into a twelfth', () => {
    expect(ruleMonthlyEquivalent(rule('y', { amount: 1200, frequency: 'yearly' }))).toBe(100)
  })

  it('counts a daily amount for every day of the year', () => {
    expect(ruleMonthlyEquivalent(rule('d', { amount: 12, frequency: 'daily' }))).toBe(365)
  })
})

describe('summarizeRecurringPlan', () => {
  const rules = [
    rule('vwce', { amount: 300, nextOccurrenceDate: '2026-11-01' }),
    rule('sgln', { amount: 150, interval: 3, nextOccurrenceDate: '2026-12-15' }),
    rule('btc', {
      amount: 25,
      frequency: 'weekly',
      active: false,
      nextOccurrenceDate: '2026-10-05',
    }),
  ]

  it('commits only the active rules each month', () => {
    expect(summarizeRecurringPlan(rules).monthly).toBe(350)
  })

  it('counts active rules out of all of them', () => {
    expect(summarizeRecurringPlan(rules)).toMatchObject({ active: 2, total: 3 })
  })

  it('points at the earliest due date among active rules', () => {
    expect(summarizeRecurringPlan(rules).next?.rule.id).toBe('vwce')
  })

  it('has no next purchase when every rule is paused', () => {
    expect(summarizeRecurringPlan([rule('a', { active: false })]).next).toBeNull()
  })
})

describe('buildContributionLedger', () => {
  const rows = [metric('2026-01-01', 0), metric('2026-01-31', 300), metric('2026-02-14', 150)]
  const manual = new Set(['2026-02-14'])

  it('lists the closes newest first', () => {
    expect(buildContributionLedger(rows, (date) => manual.has(date)).map((r) => r.date)).toEqual([
      '2026-02-14',
      '2026-01-31',
      '2026-01-01',
    ])
  })

  it('marks the first close as the base, manual dates as manual and the rest as month ends', () => {
    expect(buildContributionLedger(rows, (date) => manual.has(date)).map((r) => r.origin)).toEqual([
      'manual',
      'monthEnd',
      'base',
    ])
  })
})

describe('buildContributionLedger with a manual first close', () => {
  it('keeps a manual first close manual, so it can still be deleted', () => {
    const rows = [metric('2026-01-28', 200), metric('2026-01-31', 0)]

    expect(
      buildContributionLedger(rows, (date) => date === '2026-01-28').map((r) => r.origin),
    ).toEqual(['monthEnd', 'manual'])
  })
})

describe('summarizeContributions', () => {
  const rows = [
    metric('2025-12-31', 500),
    metric('2026-01-31', 300),
    metric('2026-02-28', 200, { nav: 104.0053, unitsAfter: 106.3665, cumulativeReturn: 0.0401 }),
  ]

  it('adds what was contributed in the year only', () => {
    expect(summarizeContributions(rows, 2026).contributed).toBe(500)
  })

  it('takes the value, units and return of the latest close', () => {
    expect(summarizeContributions(rows, 2026)).toMatchObject({
      nav: 104.0053,
      units: 106.3665,
      cumulativeReturn: 0.0401,
    })
  })

  it('has no latest figures without closes', () => {
    expect(summarizeContributions([], 2026)).toEqual({
      contributed: 0,
      nav: null,
      units: null,
      cumulativeReturn: null,
    })
  })
})
