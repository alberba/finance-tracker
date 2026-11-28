import { describe, expect, it } from 'vitest'

import { ruleMonthlyEquivalent } from '../../src/domain/investment/view-model'
import type { RecurringRule } from '../../src/scripts/types'

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
