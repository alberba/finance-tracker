import { describe, expect, it } from 'vitest'

import { chartTween, pathTween, restFrame } from '../../src/neon/sections/investment/chart-tween'
import type { PortfolioChart } from '../../src/neon/sections/investment/view-model'

const chart = (overrides: Partial<PortfolioChart> = {}): PortfolioChart => ({
  viewBox: '0 0 1400 400',
  lines: [{ key: 'value', d: 'M70 300 L700 200 L1250 100', dashed: false }],
  grid: [
    { value: 0, top: 75, text: '0 €' },
    { value: 100, top: 25, text: '100 €' },
  ],
  zero: null,
  months: [],
  ends: [{ name: 'Tu cartera', figure: '100 €', top: 25, tone: 'value' }],
  gap: null,
  dot: { x: 1250, y: 100 },
  drop: null,
  label: '',
  ...overrides,
})

describe('pathTween', () => {
  it('moves every number of a path with the same commands', () => {
    const tween = pathTween('M0 0 L10 -10', 'M0 10 L20 10')
    expect(tween?.(0.5)).toBe('M0 5 L15 0')
    expect(tween?.(1)).toBe('M0 10 L20 10')
  })

  it('has nothing to travel between paths of different lengths', () => {
    expect(pathTween('M0 0 L10 10', 'M0 0 L10 10 L20 20')).toBeNull()
  })
})

describe('chartTween', () => {
  it('reframes the same months on a new scale, gridlines gliding and fading', () => {
    const to = chart({
      lines: [{ key: 'value', d: 'M70 340 L700 300 L1250 260', dashed: false }],
      grid: [
        { value: 0, top: 85, text: '0 €' },
        { value: 200, top: 5, text: '200 €' },
      ],
      dot: { x: 1250, y: 260 },
    })
    const tween = chartTween(chart(), to)
    expect(tween).not.toBeNull()
    const half = tween!(0.5)
    expect(half.chart.lines[0].d).toBe('M70 320 L700 250 L1250 180')
    expect(half.chart.dot.y).toBe(180)
    // 200 € was at −25 % on the old scale: it comes in from there, fading in.
    expect(half.grid.find((tick) => tick.value === 200)).toMatchObject({ top: -10, opacity: 0.5 })
    // 100 € leaves to where it sits on the new scale, fading out.
    expect(half.grid.find((tick) => tick.value === 100)).toMatchObject({ top: 35, opacity: 0.5 })
    expect(tween!(1).chart).toMatchObject({ lines: to.lines, dot: to.dot })
  })

  it('swaps a chart with other months', () => {
    const to = chart({ lines: [{ key: 'value', d: 'M70 300 L1250 100', dashed: false }] })
    expect(chartTween(chart(), to)).toBeNull()
  })

  it('swaps between euros and TWR', () => {
    expect(chartTween(chart(), chart({ zero: 'M70 200 H1250' }))).toBeNull()
  })

  it('rests on the chart it is given', () => {
    expect(restFrame(chart()).grid.every((tick) => tick.opacity === 1)).toBe(true)
  })
})
