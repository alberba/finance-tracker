/**
 * Geometry of the evolution chart (DESIGN.md, «Gráfico de evolución»): one
 * line over a fixed 1000×260 view box, stretched to its box with
 * `preserveAspectRatio="none"`, the area under it and a few round gridlines.
 * The range leaves a little room below the lowest point and above the highest
 * (8 % of the span each), so the line fills its box without touching the edges.
 */
export const CHART_WIDTH = 1000
export const CHART_HEIGHT = 260

export interface LineChartGeometry {
  /** `d` of the line. Empty with fewer than two points. */
  line: string
  /** `d` of the area: the line closed along the bottom. */
  area: string
  /** Round values inside the range; `top` is the share of the height from above (0–100). */
  ticks: Array<{ value: number; top: number }>
  /** Where the last point sits, as a share of the height from above (0–100). */
  lastTop: number
  /** Every point of the line: `x` is the share of the width (0–100), `top` of the height from above. */
  points: Array<{ x: number; top: number }>
}

/** The geometry with what to write around it: month labels, gridline values and a name. */
export interface LabelledLineChart extends LineChartGeometry {
  labels: string[]
  tickLabels: string[]
  /** What each point reads when the chart is explored: its date and its value, written out. */
  /** Per point: its date, its amount and, optionally, what a screen reader adds after them. */
  readings: Array<{ name: string; value: string; note?: string; open?: boolean }>
  /** What the chart shows, for screen readers. */
  label: string
}

/** The round step (1, 2, 2.5, 5 × 10ⁿ) nearest above `raw`, for grid lines. */
export function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw))
  const scaled = raw / power
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10
  return nice * power
}

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100

export function buildLineChart(values: readonly number[]): LineChartGeometry {
  if (values.length < 2) return { line: '', area: '', ticks: [], lastTop: 50, points: [] }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) * 0.1 || 1
  const low = min - span * 0.08
  const high = max + span * 0.08
  const x = (index: number) => round1((index / (values.length - 1)) * CHART_WIDTH)
  const y = (value: number) => round1(CHART_HEIGHT - ((value - low) / (high - low)) * CHART_HEIGHT)
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index)} ${y(value)}`).join(' ')
  // A gridline hugging the top or bottom edge would crowd the month labels or the card's title.
  const gridlines = (step: number) => {
    const found: LineChartGeometry['ticks'] = []
    for (let value = Math.ceil(low / step) * step; value <= high; value += step) {
      const top = round2((y(value) / CHART_HEIGHT) * 100)
      if (top >= 6 && top <= 94) found.push({ value: round2(value), top })
    }
    return found
  }
  // Three round values at least, so the low end of the line can be read too.
  const coarse = gridlines(niceStep((high - low) / 3))
  const ticks = coarse.length >= 3 ? coarse : gridlines(niceStep((high - low) / 5))

  return {
    line,
    area: `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z`,
    ticks,
    lastTop: round2((y(values[values.length - 1]) / CHART_HEIGHT) * 100),
    points: values.map((value, index) => ({
      x: round2((index / (values.length - 1)) * 100),
      top: round2((y(value) / CHART_HEIGHT) * 100),
    })),
  }
}

type ChartPoint = LineChartGeometry['points'][number]

/** `d` of the line and its area for points in shares of the box (x and top, 0–100). */
export function chartPaths(points: readonly ChartPoint[]): { line: string; area: string } {
  if (points.length < 2) return { line: '', area: '' }
  const line = points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'}${round1((point.x / 100) * CHART_WIDTH)} ${round1((point.top / 100) * CHART_HEIGHT)}`,
    )
    .join(' ')
  return { line, area: `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z` }
}

/**
 * How a height in the old frame reads in the new one (`top × scale + shift`),
 * for two framings of a series that end at the same point: the shared tail
 * gives it, through its pair of points furthest apart in height. Null with
 * fewer than two shared points or a flat tail.
 */
export function frameMap(
  from: readonly ChartPoint[],
  to: readonly ChartPoint[],
): { scale: number; shift: number } | null {
  const shared = Math.min(from.length, to.length)
  if (shared < 2) return null
  const tail = (points: readonly ChartPoint[]) => points.slice(points.length - shared)
  const [a, b] = [tail(from), tail(to)]
  let low = 0
  let high = 0
  a.forEach((point, index) => {
    if (point.top < a[low].top) low = index
    if (point.top > a[high].top) high = index
  })
  const rise = a[high].top - a[low].top
  if (rise < 0.01) return null
  const scale = (b[high].top - b[low].top) / rise
  return { scale, shift: b[low].top - scale * a[low].top }
}

/**
 * The way from one framing of a series to another (DESIGN.md, «Cambio de
 * periodo»): both end at the same point, today, and the shorter one is the
 * tail of the longer. Each point travels from where it sits in the old frame
 * to where it sits in the new one, so the line reframes instead of being
 * redrawn: months come in or leave by the left and the height rescales.
 * A point only one of the frames has is placed in the other through the two
 * frames' value scales, which the shared points give. Null when there is
 * nothing to travel: fewer than two shared points, or a flat line.
 */
export function reframe(
  from: readonly ChartPoint[],
  to: readonly ChartPoint[],
): ((progress: number) => ChartPoint[]) | null {
  const map = frameMap(from, to)
  if (!map) return null
  const { scale, shift } = map
  const count = Math.max(from.length, to.length)
  const ends = Array.from({ length: count }, (_, back) => {
    const old = from[from.length - 1 - back]
    const next = to[to.length - 1 - back]
    return {
      x: [
        100 - (back / Math.max(from.length - 1, 1)) * 100,
        100 - (back / Math.max(to.length - 1, 1)) * 100,
      ],
      top: [old ? old.top : (next.top - shift) / scale, next ? next.top : scale * old.top + shift],
    }
  }).reverse()
  const mix = (pair: number[], progress: number) => pair[0] + (pair[1] - pair[0]) * progress
  return (progress) => ends.map((end) => ({ x: mix(end.x, progress), top: mix(end.top, progress) }))
}
