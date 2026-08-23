import { describe, expect, it } from 'vitest'

import { analyzeSubscriptions } from '../../src/domain/subscriptions/analysis'
import type { Subscription, SubscriptionFrequency } from '../../src/scripts/types'

function subscription(
  id: string,
  amount: number,
  frequency: SubscriptionFrequency,
  active = true,
): Subscription {
  return {
    id,
    name: id,
    amount,
    accountId: 'main',
    category: 'Suscripciones',
    frequency,
    startDate: '2026-01-01',
    nextChargeDate: '2026-08-01',
    active,
  }
}

describe('análisis de suscripciones', () => {
  it('compara todas las frecuencias mediante su coste mensual y anual equivalente', () => {
    const result = analyzeSubscriptions([
      subscription('weekly', 10, 'weekly'),
      subscription('monthly', 20, 'monthly'),
      subscription('quarterly', 30, 'quarterly'),
      subscription('yearly', 120, 'yearly'),
      subscription('paused', 999, 'monthly', false),
    ])

    expect(result.activeCount).toBe(4)
    expect(result.monthlyEquivalent).toBe(83.33)
    expect(result.annualTotal).toBe(1000)
    expect(result.byFrequency).toEqual([
      {
        frequency: 'weekly',
        label: 'Semanal',
        activeCount: 1,
        monthlyEquivalent: 43.33,
        annualTotal: 520,
      },
      {
        frequency: 'monthly',
        label: 'Mensual',
        activeCount: 1,
        monthlyEquivalent: 20,
        annualTotal: 240,
      },
      {
        frequency: 'quarterly',
        label: 'Trimestral',
        activeCount: 1,
        monthlyEquivalent: 10,
        annualTotal: 120,
      },
      {
        frequency: 'yearly',
        label: 'Anual',
        activeCount: 1,
        monthlyEquivalent: 10,
        annualTotal: 120,
      },
    ])
  })

  it('devuelve un resumen vacío cuando no hay suscripciones activas', () => {
    const result = analyzeSubscriptions([subscription('paused', 20, 'monthly', false)])

    expect(result).toEqual({
      activeCount: 0,
      monthlyEquivalent: 0,
      annualTotal: 0,
      byFrequency: [],
    })
  })
})
