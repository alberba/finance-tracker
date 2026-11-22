import { describe, expect, it } from 'vitest'

import { unseenBadge } from '../../src/domain/reports/unseen-badge'

describe('unseenBadge', () => {
  it('shows nothing while no report has news', () => {
    expect(unseenBadge(0)).toBeNull()
  })

  it('writes the count and says it in words for assistive technology', () => {
    expect(unseenBadge(1)).toEqual({ text: '1', spoken: '1 reporte con novedades' })
    expect(unseenBadge(4)).toEqual({ text: '4', spoken: '4 reportes con novedades' })
  })

  it('caps the visible count at 9+ but keeps the exact one spoken', () => {
    expect(unseenBadge(9)?.text).toBe('9')
    expect(unseenBadge(12)).toEqual({ text: '9+', spoken: '12 reportes con novedades' })
  })
})
