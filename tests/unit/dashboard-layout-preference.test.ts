import { describe, expect, it } from 'vitest'

import { parseDashboardLayout } from '../../src/lib/dashboard-layout'

describe('dashboard layout preference', () => {
  it('keeps the side of a widget chart and rejects an unknown one', () => {
    const item = { id: 'wealth', col: 0, row: 0, w: 4, h: 2 }
    expect(
      parseDashboardLayout({ version: 1, items: [{ ...item, chart: 'end' }] })?.items[0],
    ).toEqual({ ...item, chart: 'end' })
    expect(parseDashboardLayout({ version: 1, items: [item] })?.items[0]).toEqual(item)
    expect(parseDashboardLayout({ version: 1, items: [{ ...item, chart: 'up' }] })).toBeNull()
  })
})
