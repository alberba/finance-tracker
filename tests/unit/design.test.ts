import { describe, expect, it, vi } from 'vitest'

import { currentDesign, switchDesign } from '../../src/lib/client/design'
import {
  DEFAULT_DESIGN,
  DESIGN_COOKIE,
  parseDesign,
  serializeDesignCookie,
} from '../../src/lib/design'

describe('design cookie', () => {
  it('shows the new design without a cookie or with an unknown value', () => {
    expect(DEFAULT_DESIGN).toBe('neon')
    expect(parseDesign(undefined)).toBe('neon')
    expect(parseDesign(null)).toBe('neon')
    expect(parseDesign('')).toBe('neon')
    expect(parseDesign('rainbow')).toBe('neon')
  })

  it('reads the two known values', () => {
    expect(parseDesign('neon')).toBe('neon')
    expect(parseDesign('legacy')).toBe('legacy')
  })

  it('serializes a year-long, same-site cookie readable from the whole site', () => {
    expect(serializeDesignCookie('legacy', false)).toBe(
      `${DESIGN_COOKIE}=legacy; Path=/; Max-Age=31536000; SameSite=Lax`,
    )
    expect(serializeDesignCookie('neon', true)).toBe(
      `${DESIGN_COOKIE}=neon; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    )
  })
})

describe('switchDesign', () => {
  function env(current: 'neon' | 'legacy', protocol = 'http:') {
    return {
      document: { cookie: '' },
      location: { protocol, reload: vi.fn() },
      current,
    }
  }

  it('writes the cookie and reloads when the design changes', () => {
    const target = env('neon')
    switchDesign('legacy', target)
    expect(target.document.cookie).toContain(`${DESIGN_COOKIE}=legacy`)
    expect(target.location.reload).toHaveBeenCalledOnce()
  })

  it('marks the cookie Secure over https', () => {
    const target = env('legacy', 'https:')
    switchDesign('neon', target)
    expect(target.document.cookie).toMatch(/; Secure$/)
  })

  it('does nothing when the design is already the current one', () => {
    const target = env('legacy')
    switchDesign('legacy', target)
    expect(target.document.cookie).toBe('')
    expect(target.location.reload).not.toHaveBeenCalled()
  })

  it('reads the current design from <html data-ui>', () => {
    expect(currentDesign({ dataset: { ui: 'legacy' } })).toBe('legacy')
    expect(currentDesign({ dataset: {} })).toBe('neon')
  })
})
