import type { PortfolioChart } from './view-model'

// The cover's chart reframes instead of jumping (DESIGN.md, «Cambio de
// periodo»): when the same months get a new vertical scale (another index to
// compare with, a quote that moves the top), every line, dot and end figure
// travels from where it was to where it goes, and the gridlines glide with
// them, the ones only one scale has fading in or out on the way. A chart with
// other months or another unit (euros against TWR) has nothing to travel: it
// is swapped.

/** A gridline as drawn at one moment of the travel. */
export interface FrameTick {
  value: number
  top: number
  text: string
  opacity: number
}

export interface ChartFrame {
  chart: PortfolioChart
  grid: FrameTick[]
}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi

export const restFrame = (chart: PortfolioChart): ChartFrame => ({
  chart,
  grid: chart.grid.map((tick) => ({ ...tick, opacity: 1 })),
})

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

/**
 * Moves every number of a path from one shape to another with the same
 * commands. Null when the two have different commands or point counts.
 */
export function pathTween(from: string, to: string): ((progress: number) => string) | null {
  if (from === to) return () => to
  const a = from.match(NUMBER) ?? []
  const b = to.match(NUMBER) ?? []
  if (a.length !== b.length || from.replace(NUMBER, '') !== to.replace(NUMBER, '')) return null
  return (progress) => {
    let index = 0
    return to.replace(NUMBER, () => {
      const value = mix(Number(a[index]), Number(b[index]), progress)
      index++
      return String(Math.round(value * 10) / 10)
    })
  }
}

/** Where a value sits on a chart's scale (share of the height), from its gridlines. */
function scaleOf(grid: PortfolioChart['grid']): ((value: number) => number) | null {
  const first = grid[0]
  const last = grid[grid.length - 1]
  if (!first || !last || first.value === last.value) return null
  const slope = (last.top - first.top) / (last.value - first.value)
  return (value) => first.top + (value - first.value) * slope
}

/**
 * The way from one chart to the next, or null when there is nothing to travel:
 * other months, another unit, or a scale that can't be read.
 */
export function chartTween(
  from: PortfolioChart,
  to: PortfolioChart,
): ((progress: number) => ChartFrame) | null {
  if (from.viewBox !== to.viewBox || (from.zero === null) !== (to.zero === null)) return null
  const fromScale = scaleOf(from.grid)
  const toScale = scaleOf(to.grid)
  const value = (chart: PortfolioChart) => chart.lines.find((line) => line.key === 'value')?.d
  const fromValue = value(from)
  const toValue = value(to)
  if (!fromScale || !toScale || !fromValue || !toValue || !pathTween(fromValue, toValue)) {
    return null
  }

  // A line that only the new chart has (an index that just loaded) draws itself.
  const lines = to.lines.map((line) => {
    const old = from.lines.find((candidate) => candidate.key === line.key)
    return { line, path: old ? pathTween(old.d, line.d) : null }
  })
  const gap =
    from.gap && to.gap
      ? {
          between: pathTween(from.gap.between, to.gap.between),
          above: pathTween(from.gap.above, to.gap.above),
          below: pathTween(from.gap.below, to.gap.below),
        }
      : null
  const zero = from.zero && to.zero ? pathTween(from.zero, to.zero) : null
  const ends = to.ends.map((end) => ({
    end,
    from: from.ends.find((candidate) => candidate.tone === end.tone)?.top ?? end.top,
  }))

  const kept = new Set(from.grid.map((tick) => tick.value))
  const coming = new Set(to.grid.map((tick) => tick.value))

  return (progress) => ({
    chart: {
      ...to,
      lines: lines.map(({ line, path }) => (path ? { ...line, d: path(progress) } : line)),
      gap:
        to.gap && gap?.between && gap.above && gap.below
          ? {
              between: gap.between(progress),
              above: gap.above(progress),
              below: gap.below(progress),
            }
          : to.gap,
      zero: zero ? zero(progress) : to.zero,
      ends: ends.map(({ end, from: top }) => ({ ...end, top: mix(top, end.top, progress) })),
      dot: {
        x: mix(from.dot.x, to.dot.x, progress),
        y: mix(from.dot.y, to.dot.y, progress),
      },
      drop:
        from.drop && to.drop
          ? {
              ...to.drop,
              x: mix(from.drop.x, to.drop.x, progress),
              y: mix(from.drop.y, to.drop.y, progress),
              left: mix(from.drop.left, to.drop.left, progress),
              top: mix(from.drop.top, to.drop.top, progress),
            }
          : to.drop,
    },
    grid: [
      ...to.grid.map((tick) => ({
        ...tick,
        top: mix(fromScale(tick.value), tick.top, progress),
        opacity: kept.has(tick.value) ? 1 : progress,
      })),
      ...from.grid
        .filter((tick) => !coming.has(tick.value))
        .map((tick) => ({
          ...tick,
          top: mix(tick.top, toScale(tick.value), progress),
          opacity: 1 - progress,
        })),
    ],
  })
}
