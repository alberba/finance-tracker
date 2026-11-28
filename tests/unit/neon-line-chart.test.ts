import { describe, expect, it } from 'vitest'

import { buildLineChart, chartPaths, frameMap, reframe } from '../../src/neon/ui/line-chart'

describe('buildLineChart', () => {
  it('gives every point its place as a share of the width and of the height', () => {
    const { points } = buildLineChart([100, 150, 200])
    expect(points.map((point) => point.x)).toEqual([0, 50, 100])
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

describe('reframe', () => {
  const year = buildLineChart([100, 200, 300, 400, 500])
  const lastThree = buildLineChart([300, 400, 500])

  it('reads a height of the old frame in the new one through the points both share', () => {
    const map = frameMap(year.points, lastThree.points)!
    // 300 sits low in the year and at the bottom of the three months.
    expect(year.points[2].top * map.scale + map.shift).toBeCloseTo(lastThree.points[0].top)
    expect(year.points[4].top * map.scale + map.shift).toBeCloseTo(lastThree.points[2].top)
  })

  it('starts at the old line and ends at the new one, today fixed on the right', () => {
    const path = reframe(year.points, lastThree.points)!
    expect(chartPaths(path(0)).line).toBe(year.line)
    const end = path(1)
    // The months only the year has leave by the left.
    expect(end.map((point) => point.x)).toEqual([-100, -50, 0, 50, 100])
    expect(chartPaths(end.slice(2)).line).toBe(lastThree.line)
    expect(path(0.5).at(-1)?.x).toBe(100)
  })

  it('brings in by the left the months only the new frame has', () => {
    const start = reframe(lastThree.points, year.points)!(0)
    expect(start.map((point) => point.x)).toEqual([-100, -50, 0, 50, 100])
  })

  it('has nothing to travel with a flat line or a single shared point', () => {
    expect(reframe(buildLineChart([5, 5, 5]).points, buildLineChart([5, 5]).points)).toBeNull()
    expect(reframe(year.points, [year.points[4]])).toBeNull()
  })
})
