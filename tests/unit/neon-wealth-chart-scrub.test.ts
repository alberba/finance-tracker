import { describe, expect, it } from 'vitest'

import { nearestPoint } from '../../src/neon/sections/wealth/chart-scrub'

describe('nearestPoint', () => {
  const positions = [0, 25, 50, 97]

  it('picks the point closest to where the finger is, in percent of the plot', () => {
    expect(nearestPoint(positions, 10)).toBe(0)
    expect(nearestPoint(positions, 20)).toBe(1)
    expect(nearestPoint(positions, 60)).toBe(2)
    expect(nearestPoint(positions, 80)).toBe(3)
  })

  it('stays on the first and last points when the finger leaves the plot', () => {
    expect(nearestPoint(positions, -40)).toBe(0)
    expect(nearestPoint(positions, 180)).toBe(3)
  })

  it('has no point when there is nothing to read', () => {
    expect(nearestPoint([], 50)).toBe(-1)
  })
})
