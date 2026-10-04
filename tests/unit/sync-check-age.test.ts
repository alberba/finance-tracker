import { describe, expect, it } from 'vitest'

import { describeCheckAge } from '../../src/lib/client/sync-connection'

describe('describeCheckAge', () => {
  it.each([
    [0, 'hace 0 s'],
    [4_900, 'hace 4 s'],
    [59_999, 'hace 59 s'],
    [60_000, 'hace 1 min'],
    [3_600_000, 'hace 1 h'],
    [-500, 'hace 0 s'],
  ])('%i ms → %s', (ms, label) => {
    expect(describeCheckAge(ms)).toBe(label)
  })
})
