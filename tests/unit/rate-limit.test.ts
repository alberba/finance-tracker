import { describe, expect, it } from 'vitest'

import { createRateLimiter } from '../../src/lib/server/rate-limit'

describe('createRateLimiter', () => {
  it('aplica una ventana fija por clave y la reinicia al caducar', () => {
    let now = 0
    const limiter = createRateLimiter({ windowMs: 1_000, max: 2, now: () => now })

    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(false)
    expect(limiter.consume('b')).toBe(true)

    now = 1_001
    expect(limiter.consume('a')).toBe(true)
  })

  it('purga las claves caducadas para que el mapa no crezca sin límite', () => {
    let now = 0
    const limiter = createRateLimiter({ windowMs: 1_000, max: 5, now: () => now })

    for (let index = 0; index < 1_500; index += 1) limiter.consume(`key-${index}`)
    expect(limiter.size()).toBe(1_500)

    now = 2_000
    expect(limiter.consume('fresh')).toBe(true)
    expect(limiter.size()).toBe(1)
  })
})
