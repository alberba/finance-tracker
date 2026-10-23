import { setActivePinia } from 'pinia'
import { createTestPinia } from '../helpers/pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import { useMarketStore } from '../../src/stores/market'

describe('reloj de mercado', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'))
    setActivePinia(createTestPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hay un solo reloj aunque lo arranquen varias vistas, y se para con la última', () => {
    const market = useMarketStore()
    const stopA = market.startClock()
    const stopB = market.startClock()

    vi.advanceTimersByTime(60_000)
    expect(vi.getTimerCount()).toBe(1)

    stopA()
    stopA()
    expect(vi.getTimerCount()).toBe(1)
    stopB()
    expect(vi.getTimerCount()).toBe(0)
  })
})
