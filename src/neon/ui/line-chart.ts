/**
 * Geometry of the evolution chart (DESIGN.md, «Gráfico de evolución»): one
 * line over a fixed 1000×260 view box, stretched to its box with
 * `preserveAspectRatio="none"`, the area under it and a few round gridlines.
 * The range leaves room below the lowest point (20 %) and above the highest
 * (12 %), so the line never touches the edges.
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
}

/** The geometry with what to write around it: month labels, gridline values and a name. */
export interface LabelledLineChart extends LineChartGeometry {
  labels: string[]
  tickLabels: string[]
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
  if (values.length < 2) return { line: '', area: '', ticks: [], lastTop: 50 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) * 0.1 || 1
  const low = min - span * 0.2
  const high = max + span * 0.12
  const x = (index: number) => round1((index / (values.length - 1)) * CHART_WIDTH)
  const y = (value: number) => round1(CHART_HEIGHT - ((value - low) / (high - low)) * CHART_HEIGHT)
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index)} ${y(value)}`).join(' ')
  const step = niceStep((high - low) / 3)
  const ticks: LineChartGeometry['ticks'] = []
  for (let value = Math.ceil(low / step) * step; value <= high; value += step) {
    ticks.push({ value: round2(value), top: round2((y(value) / CHART_HEIGHT) * 100) })
  }

  return {
    line,
    area: `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z`,
    ticks,
    lastTop: round2((y(values[values.length - 1]) / CHART_HEIGHT) * 100),
  }
}
