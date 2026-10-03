import { describe, expect, it } from 'vitest'

import {
  annualizeSubscription,
  buildSubscriptionAnalysis,
  monthlyEquivalent,
} from '../../src/domain/subscriptions/analysis'
import type { Subscription } from '../../src/scripts/types'

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'subscription-1',
    name: 'Streaming',
    amount: 10,
    accountId: 'revolut',
    category: 'Ocio',
    frequency: 'monthly',
    startDate: '2026-01-01',
    nextChargeDate: '2026-08-20',
    active: true,
    ...overrides,
  }
}

describe('análisis de suscripciones', () => {
  it('normaliza cada frecuencia a importes mensuales y anuales', () => {
    expect(annualizeSubscription(subscription({ amount: 5, frequency: 'weekly' }))).toBe(260)
    expect(monthlyEquivalent(subscription({ amount: 120, frequency: 'yearly' }))).toBe(10)
    expect(monthlyEquivalent(subscription({ amount: 30, frequency: 'quarterly' }))).toBe(10)
  })

  it('resume compromiso, pausadas y concentración', () => {
    const analysis = buildSubscriptionAnalysis(
      [
        subscription(),
        subscription({
          id: 'subscription-2',
          name: 'Nube',
          amount: 120,
          frequency: 'yearly',
          accountId: 'santander',
          category: 'Software',
          nextChargeDate: '2026-10-01',
        }),
        subscription({ id: 'subscription-3', amount: 30, frequency: 'quarterly', active: false }),
      ],
      '2026-08-12',
    )

    expect(analysis).toMatchObject({
      activeCount: 2,
      pausedCount: 1,
      monthlyCommitment: 20,
      annualCommitment: 240,
      pausedAnnualAmount: 120,
      next30DaysAmount: 10,
    })
    expect(analysis.categoryBreakdown).toEqual([
      { label: 'Ocio', monthlyAmount: 10, annualAmount: 120, share: 0.5 },
      { label: 'Software', monthlyAmount: 10, annualAmount: 120, share: 0.5 },
    ])
  })

  it('incluye todas las ocurrencias dentro de los próximos 30 días', () => {
    const analysis = buildSubscriptionAnalysis(
      [subscription({ frequency: 'weekly', amount: 8, nextChargeDate: '2026-08-13' })],
      '2026-08-12',
    )

    expect(analysis.next30DaysAmount).toBe(40)
    expect(analysis.upcomingCharges).toHaveLength(5)
    expect(analysis.upcomingCharges.map((charge) => charge.date)).toEqual([
      '2026-08-13',
      '2026-08-20',
      '2026-08-27',
      '2026-09-03',
      '2026-09-10',
    ])
  })

  it('cuenta todos los cobros de los próximos 30 días aunque la lista se recorte', () => {
    const analysis = buildSubscriptionAnalysis(
      [
        subscription({
          id: 'semanal',
          frequency: 'weekly',
          amount: 8,
          nextChargeDate: '2026-08-13',
        }),
        subscription({
          id: 'mensual',
          frequency: 'monthly',
          amount: 10,
          nextChargeDate: '2026-08-20',
        }),
      ],
      '2026-08-12',
    )

    expect(analysis.upcomingCharges).toHaveLength(5)
    expect(analysis.next30DaysCount).toBe(6)
  })
})
