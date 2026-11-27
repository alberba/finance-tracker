import { describe, expect, it } from 'vitest'

import type { Month } from '../../src/lib/month'
import type { State } from '../../src/scripts/types'
import {
  availableRanges,
  rangeWindow,
  wealthTimeline,
  type TimelinePoint,
} from '../../src/neon/sections/wealth/evolution-range'

/** `count` months ending in November 2026, worth 100 more each month. */
function timeline(count: number): TimelinePoint[] {
  return Array.from({ length: count }, (_, index) => {
    const back = count - 1 - index
    const absolute = 2026 * 12 + 10 - back
    return {
      year: Math.floor(absolute / 12),
      month: ((absolute % 12) + 1) as Month,
      value: 1000 + index * 100,
      open: false,
    }
  })
}

describe('rangeWindow', () => {
  it('ends at the newest month and keeps the month before as its base', () => {
    const { points, base } = rangeWindow(timeline(30), '6m', 2026)
    expect(points.map((p) => p.month)).toEqual([6, 7, 8, 9, 10, 11])
    expect(base).toMatchObject({ year: 2026, month: 5 })
  })

  it('draws the year so far for «ytd», based on last December', () => {
    const { points, base } = rangeWindow(timeline(30), 'ytd', 2026)
    expect(points).toHaveLength(11)
    expect(points[0]).toMatchObject({ year: 2026, month: 1 })
    expect(base).toMatchObject({ year: 2025, month: 12 })
  })

  it('draws what there is when the range goes back further, with no base', () => {
    const { points, base } = rangeWindow(timeline(30), '5y', 2026)
    expect(points).toHaveLength(30)
    expect(base).toBeNull()
  })
})

describe('availableRanges', () => {
  it('offers only the ranges that draw more months than a shorter one', () => {
    expect([...availableRanges(timeline(11), 2026)]).toEqual(['3m', '6m', 'ytd'])
    expect([...availableRanges(timeline(30), 2026)]).toEqual(['3m', '6m', 'ytd', '1y', '2y', '3y'])
  })
})

describe('wealthTimeline', () => {
  it('is the current year alone when there is nothing earlier', () => {
    const state = {
      transactions: [],
      historicalSnapshots: {},
      accounts: [],
      investmentAssets: [],
      liabilities: [],
    } as unknown as State
    const current = [
      { month: 1 as Month, value: 10, open: false, monthChange: null, yearChange: 0 },
      { month: 2 as Month, value: 20, open: true, monthChange: 10, yearChange: 10 },
    ]
    expect(wealthTimeline(state, current, 2026)).toEqual([
      { year: 2026, month: 1, value: 10, open: false },
      { year: 2026, month: 2, value: 20, open: true },
    ])
  })
})
