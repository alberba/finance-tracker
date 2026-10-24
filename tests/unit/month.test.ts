import { describe, expect, it } from 'vitest'
import { ALL_MONTHS, asMonth, atMonth, monthFromDate, monthIndex } from '../../src/lib/month'

describe('Month', () => {
  it('accepts 1 to 12 and rejects everything else', () => {
    expect(asMonth(1)).toBe(1)
    expect(asMonth(12)).toBe(12)
    for (const bad of [0, 13, -1, 1.5, Number.NaN, '3', null, undefined]) {
      expect(asMonth(bad)).toBeNull()
    }
  })

  it('lists the twelve months in order', () => {
    expect(ALL_MONTHS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('maps a month to its 0-based array slot', () => {
    expect(monthIndex(asMonth(1)!)).toBe(0)
    expect(monthIndex(asMonth(12)!)).toBe(11)
  })

  it('reads the slot of a 12-position array by month', () => {
    const slots = ALL_MONTHS.map((month) => `m${month}`)
    expect(atMonth(slots, 1)).toBe('m1')
    expect(atMonth(slots, 12)).toBe('m12')
  })

  it('reads the month of a Date as 1-12', () => {
    expect(monthFromDate(new Date(2026, 0, 15))).toBe(1)
    expect(monthFromDate(new Date(2026, 11, 31))).toBe(12)
  })
})
