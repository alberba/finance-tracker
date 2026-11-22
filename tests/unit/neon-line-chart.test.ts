import { describe, expect, it } from 'vitest'

import { buildLineChart } from '../../src/neon/ui/line-chart'

describe('buildLineChart', () => {
  it('runs the line from edge to edge, leaving room above and below', () => {
    const chart = buildLineChart([100, 200])
    // Range 80–212: 100 sits 20/132 above the bottom, 200 sits 12/132 below the top.
    expect(chart.line).toBe('M0 220.6 L1000 23.6')
    expect(chart.area).toBe('M0 220.6 L1000 23.6 L1000 260 L0 260 Z')
    expect(chart.lastTop).toBe(9.08)
  })

  it('gives every point its place as a share of the width and of the height', () => {
    const { points } = buildLineChart([100, 150, 200])
    expect(points.map((point) => point.x)).toEqual([0, 50, 100])
    expect(points[2].top).toBe(9.08)
    expect(points[0].top).toBeGreaterThan(points[1].top)
  })

  it('puts gridlines on round values inside the range', () => {
    expect(buildLineChart([100, 200]).ticks.map((tick) => tick.value)).toEqual([100, 150, 200])
  })

  it('draws a flat series in the middle band instead of dividing by zero', () => {
    const chart = buildLineChart([500, 500, 500])
    expect(chart.line).not.toContain('NaN')
    expect(chart.ticks.length).toBeGreaterThan(0)
  })

  it('draws nothing with a single point', () => {
    expect(buildLineChart([10])).toEqual({ line: '', area: '', ticks: [], lastTop: 50, points: [] })
  })
})
