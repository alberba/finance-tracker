import { describe, expect, it } from 'vitest'

import { buildDemoSeed } from '../../src/data/demo-seed'
import { normalizeState } from '../../src/scripts/state'

describe('demo seed', () => {
  const now = new Date('2026-07-17T10:00:00.000Z')
  const seed = buildDemoSeed(now)

  it('is deterministic for a given date', () => {
    expect(buildDemoSeed(now)).toEqual(buildDemoSeed(now))
  })

  it('marks itself as demo data and never reuses the real seed source', () => {
    expect(seed.meta.source).toBe('demo')
    expect(seed.stockEvents).toEqual({ enabled: false, apiKey: '', symbolMappings: [] })
  })

  it('survives normalizeState without losing movements', () => {
    const normalized = normalizeState(JSON.parse(JSON.stringify(seed)))
    expect(normalized.transactions.length).toBe(seed.transactions.length)
    expect(normalized.accounts.map((a) => a.id)).toEqual(
      seed.accounts.map((a) => a.id),
    )
    expect(normalized.contributions.length).toBe(seed.contributions.length)
    expect(Object.keys(normalized.quotes)).toEqual(Object.keys(seed.quotes))
    expect(normalized.subscriptions.length).toBe(seed.subscriptions.length)
    expect(normalized.recurringRules.length).toBe(seed.recurringRules.length)
  })

  it('never emits movements dated after "today"', () => {
    const today = '2026-07-17'
    for (const tx of seed.transactions) {
      expect(tx.date <= today).toBe(true)
    }
    for (const contribution of seed.contributions) {
      expect(contribution.date <= today).toBe(true)
    }
  })

  it('keeps subscriptions with future charge dates so hydration stays quiet', () => {
    const today = '2026-07-17'
    for (const subscription of seed.subscriptions) {
      expect(subscription.nextChargeDate > today).toBe(true)
    }
  })

  it('references only declared accounts and instruments', () => {
    const accountIds = new Set(seed.accounts.map((account) => account.id))
    const instrumentIds = new Set(seed.instruments.map((item) => item.id))
    for (const tx of seed.transactions) {
      expect(accountIds.has(tx.accountId)).toBe(true)
      if (tx.instrumentId) {
        expect(instrumentIds.has(tx.instrumentId)).toBe(true)
      }
    }
  })
})
