import type {
  ChartType,
  ScriptableContext,
  TooltipModel,
  TooltipOptions,
} from 'chart.js'

import { formatAxisLabel } from '../lib/format'
import { readChartTheme, resolveColor } from './chart-theme'

type ChartModule = typeof import('chart.js')
type ChartConstructor = ChartModule['Chart']

declare global {
  interface Window {
    Chart?: ChartConstructor
  }
}

/**
 * Chart.js is a large dependency (it was ~71 kB gzip for all eight chart
 * families when only line charts are rendered). Load it after the dashboard
 * markup is already visible, and register only what `render*Chart` uses.
 * The canvas `data-chart-*` attributes are written synchronously before the
 * import resolves, so tests and scripts can read them without waiting.
 */
let chartLoader: Promise<ChartModule> | null = null
let chartConstructor: ChartConstructor | null = null

function loadChart(): Promise<ChartModule> {
  chartLoader ??= import('chart.js').then((chart) => {
    chart.Chart.register(
      chart.LineController,
      chart.LineElement,
      chart.PointElement,
      chart.LinearScale,
      chart.CategoryScale,
      chart.Filler,
      chart.Tooltip,
      chart.Legend,
    )
    chartConstructor = chart.Chart
    if (typeof window !== 'undefined') {
      window.Chart = chart.Chart
    }
    return chart
  })
  return chartLoader
}

/** Destroys the chart attached to a canvas, if Chart.js has already loaded. */
export function destroyChart(canvas: HTMLCanvasElement): void {
  // Also invalidate a pending async render: the canvas may unmount before the
  // chart chunk resolves, and creating a chart then would leak it.
  renderVersions.set(canvas, (renderVersions.get(canvas) ?? 0) + 1)
  chartConstructor?.getChart(canvas)?.destroy()
}

/**
 * Renders are async now. A canvas can be redrawn (theme change, range change)
 * before the previous import resolves; only the latest render may create a
 * chart, or the old one would win and leak.
 */
const renderVersions = new WeakMap<HTMLCanvasElement, number>()

function nextRenderVersion(canvas: HTMLCanvasElement): number {
  const version = (renderVersions.get(canvas) ?? 0) + 1
  renderVersions.set(canvas, version)
  return version
}

function isCurrentRender(canvas: HTMLCanvasElement, version: number): boolean {
  return renderVersions.get(canvas) === version
}

function drawWhenReady(
  canvas: HTMLCanvasElement,
  version: number,
  draw: (chart: ChartConstructor) => void,
): void {
  const start = (): void => {
    void loadChart()
      .then((chart) => {
        if (!isCurrentRender(canvas, version)) return
        chart.Chart.getChart(canvas)?.destroy()
        draw(chart.Chart)
        canvas.dataset.chartReady = 'true'
      })
      .catch(() => {
        // A failed chart chunk must not take the section down; leave the canvas
        // blank and let a later render (theme/range) retry the import.
        chartLoader = null
        delete canvas.dataset.chartReady
      })
  }

  // The first chart waits for an idle window: its 200 kB chunk (69 kB gzip)
  // must not compete with hydration or the dashboard's first paint. Redraws
  // after a range/theme change are immediate because Chart.js is already here.
  if (chartConstructor) {
    start()
    return
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 1000 })
  } else {
    setTimeout(start, 200)
  }
}

type ValueFormatter = (value: number) => string

/* ──────────────────────────────────────────────────────────────────
   "Editorial" chart language: minimal chrome, hairline grids with no
   axis borders, thin smooth lines with gradient fills and no resting
   point markers, slim rounded bars, fine donut ring, refined legends.
   Colors and axis type come from the design tokens (chart-theme.ts) at
   render time, so charts follow the active light/dark theme (re-rendered
   on theme switch). Series colors may be token references (`var(--…)`).
   ────────────────────────────────────────────────────────────────── */
const axisColor = () => readChartTheme().axis
const gridColor = () => readChartTheme().grid
const legendColor = () => readChartTheme().legend
const pointBorderColorVar = () => readChartTheme().pointBorder

// Legends name series (text, body font); axes carry figures (display font).
const FONT_FAMILY = "'DM Sans', system-ui, sans-serif"
const axisFont = (size: number) => ({ size, family: readChartTheme().fontFamily })

// Append 8-bit alpha to a 6-digit hex color (e.g. "#3B6BF0" + 0.2 -> "#3B6BF033").
function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0')
    return color + a
  }
  return color
}

// Scriptable vertical gradient fill for area lines: solid-ish at the top of
// the plot, fading to transparent at the baseline.
function areaFill(color: string, topOpacity = 0.22) {
  return (context: ScriptableContext<'line'>) => {
    const chart = context.chart
    const area = chart?.chartArea
    if (!area) return withAlpha(color, 0)
    const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
    gradient.addColorStop(0, withAlpha(color, topOpacity))
    gradient.addColorStop(0.55, withAlpha(color, topOpacity * 0.32))
    gradient.addColorStop(1, withAlpha(color, 0))
    return gradient
  }
}

// Show a small dot only when the series is short enough that a bare line
// would read poorly; otherwise the line stays clean until hover.
function restingPointRadius(context: ScriptableContext<'line'>): number {
  const count = context?.chart?.data?.labels?.length ?? 0
  return count <= 3 ? 2.5 : 0
}

const lineCommon = {
  borderWidth: 2,
  tension: 0.35,
  pointRadius: restingPointRadius,
  pointHoverRadius: 4,
  pointBorderWidth: 2,
  pointHoverBorderWidth: 2,
  borderJoinStyle: 'round' as const,
  borderCapStyle: 'round' as const,
}

function baseScales(
  formatAxisValue: ValueFormatter,
  labels: readonly string[],
  beginAtZero: boolean,
  colors: { axis?: string; grid?: string } = {},
) {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: {
        font: axisFont(10),
        color: colors.axis || axisColor(),
        maxRotation: 0,
        autoSkipPadding: 16,
        padding: 6,
        callback: (_value: string | number, index: number) => formatAxisLabel(labels[index]),
      },
    },
    y: {
      grid: { color: colors.grid || gridColor(), drawTicks: false, lineWidth: 1 },
      border: { display: false },
      ticks: {
        font: axisFont(10),
        color: colors.axis || axisColor(),
        maxTicksLimit: 5,
        padding: 10,
        callback: (value: string | number) => formatAxisValue(Number(value || 0)),
      },
      beginAtZero,
    },
  }
}

const refinedLegend = (display: boolean) => ({
  display,
  position: 'top' as const,
  align: 'end' as const,
  labels: {
    font: { size: 11, family: FONT_FAMILY },
    color: legendColor(),
    usePointStyle: true,
    pointStyle: 'circle',
    boxWidth: 7,
    boxHeight: 7,
    padding: 16,
  },
})

export interface LineChartOptions {
  color: string
  fill: string
  axisColor?: string
  borderWidth?: number
  fillOpacity?: number
  gridColor?: string
  pointBorderColor?: string
  labels?: readonly string[]
  formatValue: ValueFormatter
  formatAxisValue?: ValueFormatter
  yScale?: 'linear' | 'log'
  includeZeroBaseline?: boolean
  yPaddingRatio?: number
}

export interface MultiLineSeries {
  name: string
  /** A color or a token reference (`var(--chart-series-1)`). */
  color: string
  values: number[]
  /** Dashed line, for reference series such as contributed capital. */
  dashed?: boolean
}

export interface MultiLineChartOptions {
  labels?: readonly string[]
  formatValue: ValueFormatter
  formatAxisValue?: ValueFormatter
  yScale?: 'linear' | 'log'
  includeZeroBaseline?: boolean
  forceZeroTick?: boolean
  yPaddingRatio?: number
}

function getTooltipEl(): HTMLElement | null {
  return document.getElementById('chart-tooltip')
}

function tooltipRawNumber(item: { raw: unknown }): number {
  return Number(item.raw || 0)
}

function tooltipDatasetLabel(item: { dataset: { label?: string } }): string {
  return item.dataset.label || ''
}

function makeExternalTooltip<TType extends ChartType>(
  formatLines: (tooltipModel: TooltipModel<TType>) => string,
): TooltipOptions<TType>['external'] {
  return function ({ chart, tooltip }): void {
    const tooltipEl = getTooltipEl()
    if (!tooltipEl) return

    if (tooltip.opacity === 0) {
      delete tooltipEl.dataset.visible
      tooltipEl.setAttribute('aria-hidden', 'true')
      return
    }

    if (tooltip.dataPoints && tooltip.dataPoints.length) {
      tooltipEl.textContent = formatLines(tooltip)
    }

    const canvasRect = chart.canvas.getBoundingClientRect()
    tooltipEl.style.left = canvasRect.left + tooltip.caretX + 'px'
    tooltipEl.style.top = canvasRect.top + tooltip.caretY + 'px'
    tooltipEl.dataset.visible = ''
    tooltipEl.setAttribute('aria-hidden', 'false')
  }
}

export function renderLineChart(
  canvas: HTMLCanvasElement,
  values: number[],
  options: LineChartOptions,
): void {
  const version = nextRenderVersion(canvas)
  const labels = Array.from(options.labels || [])
  const formatValue = options.formatValue
  const formatAxisValue = options.formatAxisValue || formatValue
  const safeValues = values.map((v) => Number(v || 0))

  const tooltipData = safeValues.map((v, i) => {
    const label = labels[i] || `Punto ${i + 1}`
    return `${label}: ${formatValue(v)}`
  })

  canvas.dataset.chartPointCount = String(safeValues.length)
  canvas.dataset.chartTooltips = JSON.stringify([tooltipData])

  drawWhenReady(canvas, version, (Chart) => {
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: safeValues,
            borderColor: options.color,
            backgroundColor: areaFill(options.color, options.fillOpacity),
            pointBackgroundColor: options.color,
            pointBorderColor: options.pointBorderColor || pointBorderColorVar(),
            fill: true,
            ...lineCommon,
            borderWidth: options.borderWidth ?? lineCommon.borderWidth,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 6, right: 4, bottom: 0, left: 0 } },
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: makeExternalTooltip<'line'>((tooltip) => {
              const dp = tooltip.dataPoints[0]
              const label = dp.label || `Punto ${dp.dataIndex + 1}`
              return `${label}: ${formatValue(tooltipRawNumber(dp))}`
            }),
          },
        },
        scales: baseScales(formatAxisValue, labels, options.includeZeroBaseline ?? true, {
          axis: options.axisColor,
          grid: options.gridColor,
        }),
      },
    })
  })
}

export function renderMultiLineChart(
  canvas: HTMLCanvasElement,
  series: MultiLineSeries[],
  options: MultiLineChartOptions,
): void {
  const version = nextRenderVersion(canvas)
  const labels = Array.from(options.labels || [])
  const formatValue = options.formatValue
  const formatAxisValue = options.formatAxisValue || formatValue
  const forceZeroTick = options.forceZeroTick ?? false

  if (!series.length) {
    canvas.dataset.chartPointCount = '0'
    canvas.dataset.chartHasZeroTick = 'false'
    canvas.dataset.chartTooltips = '[]'
    drawWhenReady(canvas, version, (Chart) => {
      new Chart(canvas, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        },
      })
    })
    return
  }

  const maxPoints = Math.max(...series.map((s) => s.values.length))
  canvas.dataset.chartPointCount = String(maxPoints)
  canvas.dataset.chartHasZeroTick = String(
    forceZeroTick || series.some((s) => s.values.some((v) => v === 0)),
  )
  canvas.dataset.chartSeriesNames = JSON.stringify(series.map((s) => s.name))

  const tooltipData = series.map((s) =>
    s.values.map((v, i) => {
      const label = labels[i] || `Punto ${i + 1}`
      return `${s.name} · ${label}: ${formatValue(v)}`
    }),
  )
  canvas.dataset.chartTooltips = JSON.stringify(tooltipData)

  const firstTooltips = series.map((s) => {
    const label = labels[0] || 'Punto 1'
    return `${s.name} · ${label}: ${formatValue(s.values[0] || 0)}`
  })
  canvas.dataset.chartFirstTooltip = firstTooltips.join(' | ')

  drawWhenReady(canvas, version, (Chart) => {
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s) => {
          const color = resolveColor(s.color)
          return {
            label: s.name,
            data: s.values.map((v) => Number(v || 0)),
            borderColor: color,
            backgroundColor: color,
            pointBackgroundColor: color,
            pointBorderColor: pointBorderColorVar(),
            borderDash: s.dashed ? [6, 5] : undefined,
            ...lineCommon,
          }
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 6, right: 4 } },
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: refinedLegend(series.length > 1),
          tooltip: {
            enabled: false,
            external: makeExternalTooltip<'line'>((tooltip) => {
              return tooltip.dataPoints
                .map(
                  (dp) =>
                    `${tooltipDatasetLabel(dp)} · ${dp.label}: ${formatValue(tooltipRawNumber(dp))}`,
                )
                .join(' | ')
            }),
          },
        },
        scales: baseScales(formatAxisValue, labels, forceZeroTick),
      },
    })
  })
}
