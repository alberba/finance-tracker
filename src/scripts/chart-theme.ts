/**
 * Chart theme read from the design tokens in global.css, so every chart
 * shares palette, axis typography and grid, and follows light/dark mode
 * (charts re-render on theme switch and read the tokens again).
 */

type TokenReader = (name: string) => string

/** Series palette size: `--chart-series-1` … `--chart-series-N` in global.css. */
export const CHART_SERIES_COUNT = 10

const NEUTRAL = '#8693a4'

export interface ChartTheme {
  axis: string
  grid: string
  legend: string
  pointBorder: string
  empty: string
  fontFamily: string
}

export function cssVar(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function readChartTheme(read: TokenReader = cssVar): ChartTheme {
  const token = (name: string, fallback: string) => read(name) || fallback
  return {
    axis: token('--chart-axis', '#7c8798'),
    grid: token('--chart-grid', '#e9edf4'),
    legend: token('--chart-legend', '#5a6678'),
    pointBorder: token('--chart-point-border', '#ffffff'),
    empty: token('--chart-empty', '#e4e8f1'),
    fontFamily: token('--font-display', "'Syne', sans-serif"),
  }
}

/**
 * Color of the nth series as a token reference. Works as is in CSS (inline
 * swatches, bars); canvas code passes it through `resolveColor` first.
 */
export function seriesColor(index: number): string {
  const token = `--chart-series-${(index % CHART_SERIES_COUNT) + 1}`
  return `var(${token})`
}

/** Resolves a `var()` token reference to its current value; literal colors pass through. */
export function resolveColor(color: string, read: TokenReader = cssVar): string {
  const match = color.match(/^var\(\s*(--[\w-]+)\s*\)$/)
  if (!match) return color
  return read(match[1]) || NEUTRAL
}
