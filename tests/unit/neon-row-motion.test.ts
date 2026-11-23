import { describe, expect, it } from 'vitest'

import { barDelay, rowDelay } from '../../src/neon/ui/row-motion'

describe('row motion', () => {
  it('brings the first rows in one after another and the rest with the last of them', () => {
    expect(rowDelay(1) - rowDelay(0)).toBe(35)
    expect(rowDelay(8)).toBe(rowDelay(30))
  })

  it('starts a row’s bar once the row is in', () => {
    expect(barDelay(2)).toBeGreaterThan(rowDelay(2))
  })
})
