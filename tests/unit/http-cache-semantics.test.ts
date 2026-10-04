import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const requireFromAstro = createRequire(require.resolve('astro/package.json'))
const CachePolicy = requireFromAstro('http-cache-semantics')
const request = { url: 'https://example.test/image.png', method: 'GET', headers: {} }
const staleRequest = { ...request, headers: { 'cache-control': 'max-stale=3600' } }

describe('http-cache-semantics security patch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    {
      name: 'shared cookies',
      headers: { 'cache-control': 'max-age=60', 'set-cookie': 'session=private' },
    },
    { name: 'proxy revalidation', headers: { 'cache-control': 'max-age=60, proxy-revalidate' } },
    { name: 'no-cache', headers: { 'cache-control': 'no-cache' } },
    { name: 'private response', headers: { 'cache-control': 'private, max-age=60' } },
  ])('does not let max-stale override $name', ({ headers }) => {
    const policy = new CachePolicy(request, { status: 200, headers })

    expect(policy.satisfiesWithoutRevalidation(staleRequest)).toBe(false)
  })

  it('still serves an ordinary expired public response when max-stale permits it', () => {
    const policy = new CachePolicy(request, {
      status: 200,
      headers: { 'cache-control': 'public, max-age=60' },
    })
    vi.advanceTimersByTime(120_000)

    expect(policy.satisfiesWithoutRevalidation(staleRequest)).toBe(true)
  })
})
