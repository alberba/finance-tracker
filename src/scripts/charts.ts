// Chart.js is loaded via CDN as a global (see FinanceTrackerShell.astro)
declare const Chart: any;

type ValueFormatter = (value: number) => string;

/* ──────────────────────────────────────────────────────────────────
   "Editorial" chart language: minimal chrome, hairline grids with no
   axis borders, thin smooth lines with gradient fills and no resting
   point markers, slim rounded bars, fine donut ring, refined legends.
   Colors are read from CSS custom properties at render time so charts
   follow the active light/dark theme (re-rendered on theme switch).
   ────────────────────────────────────────────────────────────────── */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}
const axisColor = () => cssVar("--chart-axis", "#7b8b8d");
const gridColor = () => cssVar("--chart-grid", "#edf3f0");
const legendColor = () => cssVar("--chart-legend", "#516164");
const pointBorderColorVar = () => cssVar("--chart-point-border", "#ffffff");
const emptyColor = () => cssVar("--chart-empty", "#e2ece7");
const centerLabelColor = () => cssVar("--chart-center-label", "#6b7b7f");
const centerValueColor = () => cssVar("--chart-center-value", "#18363b");

const FONT_FAMILY = "'DM Sans', system-ui, sans-serif";

// Append 8-bit alpha to a 6-digit hex color (e.g. "#3B6BF0" + 0.2 -> "#3B6BF033").
function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
      .toString(16)
      .padStart(2, "0");
    return color + a;
  }
  return color;
}

// Scriptable vertical gradient fill for area lines: solid-ish at the top of
// the plot, fading to transparent at the baseline.
function areaFill(color: string) {
  return (context: any) => {
    const chart = context.chart;
    const area = chart?.chartArea;
    if (!area) return withAlpha(color, 0);
    const gradient = chart.ctx.createLinearGradient(
      0,
      area.top,
      0,
      area.bottom,
    );
    gradient.addColorStop(0, withAlpha(color, 0.22));
    gradient.addColorStop(0.55, withAlpha(color, 0.07));
    gradient.addColorStop(1, withAlpha(color, 0));
    return gradient;
  };
}

// Show a small dot only when the series is short enough that a bare line
// would read poorly; otherwise the line stays clean until hover.
function restingPointRadius(context: any): number {
  const count = context?.chart?.data?.labels?.length ?? 0;
  return count <= 3 ? 2.5 : 0;
}

const lineCommon = {
  borderWidth: 2,
  tension: 0.35,
  pointRadius: restingPointRadius,
  pointHoverRadius: 4,
  pointBorderWidth: 2,
  pointHoverBorderWidth: 2,
  borderJoinStyle: "round" as const,
  borderCapStyle: "round" as const,
};

function baseScales(
  formatAxisValue: ValueFormatter,
  labels: readonly string[],
  beginAtZero: boolean,
) {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: {
        font: { size: 10, family: FONT_FAMILY },
        color: axisColor(),
        maxRotation: 0,
        autoSkipPadding: 16,
        padding: 6,
        callback: (_value: any, index: number) =>
          (labels[index] || "").slice(0, 3),
      },
    },
    y: {
      grid: { color: gridColor(), drawTicks: false, lineWidth: 1 },
      border: { display: false },
      ticks: {
        font: { size: 10, family: FONT_FAMILY },
        color: axisColor(),
        maxTicksLimit: 5,
        padding: 10,
        callback: (value: number) => formatAxisValue(value),
      },
      beginAtZero,
    },
  };
}

const refinedLegend = (display: boolean) => ({
  display,
  position: "top" as const,
  align: "end" as const,
  labels: {
    font: { size: 11, family: FONT_FAMILY },
    color: legendColor(),
    usePointStyle: true,
    pointStyle: "circle",
    boxWidth: 7,
    boxHeight: 7,
    padding: 16,
  },
});

export interface LineChartOptions {
  color: string;
  fill: string;
  labels?: readonly string[];
  formatValue: ValueFormatter;
  formatAxisValue?: ValueFormatter;
  yScale?: "linear" | "log";
  includeZeroBaseline?: boolean;
  yPaddingRatio?: number;
}

export interface GroupedBarSeriesItem {
  name: string;
  color: string;
  values: number[];
}

export interface DonutChartItem {
  label: string;
  color: string;
  value: number;
}

export interface MultiLineSeries {
  name: string;
  color: string;
  values: number[];
}

export interface MultiLineChartOptions {
  labels?: readonly string[];
  formatValue: ValueFormatter;
  formatAxisValue?: ValueFormatter;
  yScale?: "linear" | "log";
  includeZeroBaseline?: boolean;
  forceZeroTick?: boolean;
  yPaddingRatio?: number;
}

function getTooltipEl(): HTMLElement | null {
  return document.getElementById("chart-tooltip");
}

function makeExternalTooltip(formatLines: (tooltipModel: any) => string) {
  return function (context: any): void {
    const { chart, tooltip } = context;
    const tooltipEl = getTooltipEl();
    if (!tooltipEl) return;

    if (tooltip.opacity === 0) {
      tooltipEl.classList.remove("is-visible");
      tooltipEl.setAttribute("aria-hidden", "true");
      return;
    }

    if (tooltip.dataPoints && tooltip.dataPoints.length) {
      tooltipEl.textContent = formatLines(tooltip);
    }

    const canvasRect = chart.canvas.getBoundingClientRect();
    tooltipEl.style.left = canvasRect.left + tooltip.caretX + "px";
    tooltipEl.style.top = canvasRect.top + tooltip.caretY + "px";
    tooltipEl.classList.add("is-visible");
    tooltipEl.setAttribute("aria-hidden", "false");
  };
}

function destroyExisting(canvas: HTMLCanvasElement): void {
  const existing = Chart.getChart(canvas);
  if (existing) {
    existing.destroy();
  }
}

export function renderLineChart(
  canvas: HTMLCanvasElement,
  values: number[],
  options: LineChartOptions,
): void {
  destroyExisting(canvas);

  const labels = Array.from(options.labels || []);
  const formatValue = options.formatValue;
  const formatAxisValue = options.formatAxisValue || formatValue;
  const safeValues = values.map((v) => Number(v || 0));

  const tooltipData = safeValues.map((v, i) => {
    const label = labels[i] || `Punto ${i + 1}`;
    return `${label}: ${formatValue(v)}`;
  });

  canvas.dataset.chartPointCount = String(safeValues.length);
  canvas.dataset.chartTooltips = JSON.stringify([tooltipData]);

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: safeValues,
          borderColor: options.color,
          backgroundColor: areaFill(options.color),
          pointBackgroundColor: options.color,
          pointBorderColor: pointBorderColorVar(),
          fill: true,
          ...lineCommon,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 6, right: 4, bottom: 0, left: 0 } },
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: makeExternalTooltip((tooltip) => {
            const dp = tooltip.dataPoints[0];
            const label = dp.label || `Punto ${dp.dataIndex + 1}`;
            return `${label}: ${formatValue(dp.raw)}`;
          }),
        },
      },
      scales: baseScales(
        formatAxisValue,
        labels,
        options.includeZeroBaseline ?? true,
      ),
    },
  });
}

// Tiny, chrome-less trend line for the dashboard stat cards: no axes, grid,
// legend, tooltip or resting points — just the line and a soft gradient fill.
export function renderSparkline(
  canvas: HTMLCanvasElement,
  values: number[],
  color: string,
): void {
  destroyExisting(canvas);

  const safeValues = values.map((v) => Number(v || 0));

  new Chart(canvas, {
    type: "line",
    data: {
      labels: safeValues.map((_, i) => i),
      datasets: [
        {
          data: safeValues,
          borderColor: color,
          backgroundColor: areaFill(color),
          fill: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderJoinStyle: "round" as const,
          borderCapStyle: "round" as const,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 2, bottom: 2, left: 0, right: 0 } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { capBezierPoints: true } },
    },
  });
}

export function renderGroupedBarChart(
  canvas: HTMLCanvasElement,
  labels: readonly string[],
  series: GroupedBarSeriesItem[],
  formatValue: ValueFormatter = (value) =>
    String(Number(value || 0).toFixed(2)),
): void {
  destroyExisting(canvas);

  const totalBars = labels.length * series.length;
  canvas.dataset.chartBarCount = String(totalBars);

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: Array.from(labels),
      datasets: series.map((item) => ({
        label: item.name,
        data: item.values.map((v) => Number(v || 0)),
        backgroundColor: item.color,
        hoverBackgroundColor: item.color,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 30,
        barPercentage: 0.74,
        categoryPercentage: 0.62,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 4 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: refinedLegend(true),
        tooltip: {
          enabled: false,
          external: makeExternalTooltip((tooltip) => {
            return tooltip.dataPoints
              .map((dp: any) => `${dp.dataset.label}: ${formatValue(dp.raw)}`)
              .join(" | ");
          }),
        },
      },
      scales: {
        x: {
          stacked: false,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 10, family: FONT_FAMILY },
            color: axisColor(),
            maxRotation: 0,
            padding: 6,
            callback: (_value: any, index: number) =>
              (Array.from(labels)[index] || "").slice(0, 3),
          },
        },
        y: {
          grid: { color: gridColor(), drawTicks: false, lineWidth: 1 },
          border: { display: false },
          ticks: {
            font: { size: 10, family: FONT_FAMILY },
            color: axisColor(),
            maxTicksLimit: 5,
            padding: 10,
            callback: (value: number) => formatValue(value),
          },
          beginAtZero: true,
        },
      },
    },
  });
}

export function renderDonutChart(
  canvas: HTMLCanvasElement,
  data: DonutChartItem[],
  formatValue: ValueFormatter,
  options: { showLegend?: boolean } = {},
): void {
  destroyExisting(canvas);

  const showLegend = options.showLegend ?? true;
  const clean = data.map((item) => ({
    ...item,
    value: Math.max(Number(item.value || 0), 0),
  }));
  const total = clean.reduce((sum, item) => sum + item.value, 0);

  canvas.dataset.chartSegmentCount = String(
    clean.filter((item) => item.value > 0).length,
  );
  canvas.dataset.chartLegendCount = String(clean.length);

  if (total <= 0) {
    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Sin datos"],
        datasets: [
          { data: [1], backgroundColor: [emptyColor()], borderWidth: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: "74%",
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return;
  }

  new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: clean.map((item) => item.label),
      datasets: [
        {
          data: clean.map((item) => item.value),
          backgroundColor: clean.map((item) => item.color),
          hoverOffset: 6,
          borderWidth: 3,
          borderColor: pointBorderColorVar(),
          borderRadius: 4,
          spacing: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: "74%",
      layout: { padding: 6 },
      plugins: {
        legend: {
          display: showLegend,
          position: "right" as const,
          labels: {
            font: { size: 11, family: FONT_FAMILY },
            color: legendColor(),
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
          },
        },
        tooltip: {
          enabled: false,
          external: makeExternalTooltip((tooltip) => {
            const dp = tooltip.dataPoints[0];
            const pct = total > 0 ? ((dp.raw as number) / total) * 100 : 0;
            return `${dp.label}: ${formatValue(dp.raw as number)} (${pct.toFixed(1)}%)`;
          }),
        },
      },
    },
    plugins: [
      {
        id: "center-text",
        afterDraw(chart: any) {
          const { ctx } = chart;
          const firstArc = chart.getDatasetMeta(0)?.data?.[0];
          const cx = Number(firstArc?.x);
          const cy = Number(firstArc?.y);
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
            return;
          }

          ctx.save();
          ctx.fillStyle = centerLabelColor();
          ctx.font = `600 10px ${FONT_FAMILY}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("TOTAL", cx, cy - 12);
          ctx.fillStyle = centerValueColor();
          ctx.font = `500 16px 'DM Mono', ${FONT_FAMILY}`;
          ctx.fillText(formatValue(total), cx, cy + 8);
          ctx.restore();
        },
      },
    ],
  });
}

export function renderHorizontalBarChart(
  canvas: HTMLCanvasElement,
  data: Array<{ label: string; value: number }>,
  palette: string[],
  formatValue: ValueFormatter,
): void {
  destroyExisting(canvas);

  const cleaned = data
    .map((item) => ({
      label: item.label,
      value: Math.max(Number(item.value || 0), 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  canvas.dataset.chartBarCount = String(cleaned.length);

  if (!cleaned.length) {
    new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Sin datos"],
        datasets: [{ data: [0], backgroundColor: [emptyColor()] }],
      },
      options: {
        indexAxis: "y" as const,
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return;
  }

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: cleaned.map((item) => item.label),
      datasets: [
        {
          data: cleaned.map((item) => item.value),
          backgroundColor: cleaned.map(
            (_, idx) => palette[idx % palette.length],
          ),
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 22,
          categoryPercentage: 0.72,
        },
      ],
    },
    options: {
      indexAxis: "y" as const,
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: makeExternalTooltip((tooltip) => {
            const dp = tooltip.dataPoints[0];
            return `${dp.label}: ${formatValue(dp.raw as number)}`;
          }),
        },
      },
      scales: {
        x: {
          grid: { color: gridColor(), drawTicks: false, lineWidth: 1 },
          border: { display: false },
          ticks: {
            font: { size: 10, family: FONT_FAMILY },
            color: axisColor(),
            maxTicksLimit: 5,
            padding: 8,
            callback: (value: number) => formatValue(value),
          },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 11, family: FONT_FAMILY },
            color: axisColor(),
            padding: 6,
          },
        },
      },
    },
  });
}

export function renderMultiLineChart(
  canvas: HTMLCanvasElement,
  series: MultiLineSeries[],
  options: MultiLineChartOptions,
): void {
  destroyExisting(canvas);

  const labels = Array.from(options.labels || []);
  const formatValue = options.formatValue;
  const formatAxisValue = options.formatAxisValue || formatValue;
  const forceZeroTick = options.forceZeroTick ?? false;

  if (!series.length) {
    new Chart(canvas, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    canvas.dataset.chartPointCount = "0";
    canvas.dataset.chartHasZeroTick = "false";
    canvas.dataset.chartTooltips = "[]";
    return;
  }

  const maxPoints = Math.max(...series.map((s) => s.values.length));
  canvas.dataset.chartPointCount = String(maxPoints);
  canvas.dataset.chartHasZeroTick = String(
    forceZeroTick || series.some((s) => s.values.some((v) => v === 0)),
  );
  canvas.dataset.chartSeriesNames = JSON.stringify(series.map((s) => s.name));

  const tooltipData = series.map((s) =>
    s.values.map((v, i) => {
      const label = labels[i] || `Punto ${i + 1}`;
      return `${s.name} · ${label}: ${formatValue(v)}`;
    }),
  );
  canvas.dataset.chartTooltips = JSON.stringify(tooltipData);

  const firstTooltips = series.map((s) => {
    const label = labels[0] || "Punto 1";
    return `${s.name} · ${label}: ${formatValue(s.values[0] || 0)}`;
  });
  canvas.dataset.chartFirstTooltip = firstTooltips.join(" | ");

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.name,
        data: s.values.map((v) => Number(v || 0)),
        borderColor: s.color,
        backgroundColor: s.color,
        pointBackgroundColor: s.color,
        pointBorderColor: pointBorderColorVar(),
        ...lineCommon,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 6, right: 4 } },
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: refinedLegend(series.length > 1),
        tooltip: {
          enabled: false,
          external: makeExternalTooltip((tooltip) => {
            return tooltip.dataPoints
              .map(
                (dp: any) =>
                  `${dp.dataset.label} · ${dp.label}: ${formatValue(dp.raw)}`,
              )
              .join(" | ");
          }),
        },
      },
      scales: baseScales(formatAxisValue, labels, forceZeroTick),
    },
  });
}
