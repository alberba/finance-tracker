// Chart.js is loaded via CDN as a global (see FinanceTrackerShell.astro)
declare const Chart: any;

type ValueFormatter = (value: number) => string;

// Theme-aware chart colors. Read from CSS custom properties at render time so
// charts follow the active light/dark theme (re-rendered on theme switch).
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
const axisColor = () => cssVar("--chart-axis", "#7b8b8d");
const gridColor = () => cssVar("--chart-grid", "#edf3f0");
const legendColor = () => cssVar("--chart-legend", "#516164");
const pointBorderColorVar = () => cssVar("--chart-point-border", "#ffffff");
const emptyColor = () => cssVar("--chart-empty", "#e2ece7");
const centerLabelColor = () => cssVar("--chart-center-label", "#6b7b7f");
const centerValueColor = () => cssVar("--chart-center-value", "#18363b");

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

export function renderLineChart(canvas: HTMLCanvasElement, values: number[], options: LineChartOptions): void {
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
          backgroundColor: options.fill,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: options.color,
          pointBorderColor: pointBorderColorVar(),
          pointBorderWidth: 2,
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            color: axisColor(),
            maxRotation: 0,
            callback: (_value: any, index: number) => (labels[index] || "").slice(0, 3),
          },
        },
        y: {
          grid: { color: gridColor() },
          ticks: {
            font: { size: 10 },
            color: axisColor(),
            callback: (value: number) => formatAxisValue(value),
          },
          beginAtZero: options.includeZeroBaseline ?? true,
        },
      },
    },
  });
}

export function renderGroupedBarChart(
  canvas: HTMLCanvasElement,
  labels: readonly string[],
  series: GroupedBarSeriesItem[],
  formatValue: ValueFormatter = (value) => String(Number(value || 0).toFixed(2))
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
        borderRadius: 4,
        borderSkipped: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top" as const,
          labels: { font: { size: 11 }, color: legendColor(), boxWidth: 12, boxHeight: 12 },
        },
        tooltip: {
          enabled: false,
          external: makeExternalTooltip((tooltip) => {
            return tooltip.dataPoints.map((dp: any) => `${dp.dataset.label}: ${formatValue(dp.raw)}`).join(" | ");
          }),
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 10 },
            color: axisColor(),
            maxRotation: 0,
            callback: (_value: any, index: number) => (Array.from(labels)[index] || "").slice(0, 3),
          },
        },
        y: {
          grid: { color: gridColor() },
          ticks: {
            font: { size: 10 },
            color: axisColor(),
            callback: (value: number) => formatValue(value),
          },
          beginAtZero: true,
        },
      },
    },
  });
}

export function renderDonutChart(canvas: HTMLCanvasElement, data: DonutChartItem[], formatValue: ValueFormatter): void {
  destroyExisting(canvas);

  const clean = data.map((item) => ({ ...item, value: Math.max(Number(item.value || 0), 0) }));
  const total = clean.reduce((sum, item) => sum + item.value, 0);

  canvas.dataset.chartSegmentCount = String(clean.filter((item) => item.value > 0).length);
  canvas.dataset.chartLegendCount = String(clean.length);

  if (total <= 0) {
    new Chart(canvas, {
      type: "doughnut",
      data: { labels: ["Sin datos"], datasets: [{ data: [1], backgroundColor: [emptyColor()] }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
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
          hoverOffset: 8,
          borderWidth: 2,
          borderColor: pointBorderColorVar(),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: "62%",
      plugins: {
        legend: {
          display: true,
          position: "right" as const,
          labels: { font: { size: 12 }, color: legendColor(), boxWidth: 12, boxHeight: 12 },
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
          ctx.font = "11px 'DM Sans', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Total", cx, cy - 12);
          ctx.fillStyle = centerValueColor();
          ctx.font = "bold 15px 'DM Sans', sans-serif";
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
  formatValue: ValueFormatter
): void {
  destroyExisting(canvas);

  const cleaned = data
    .map((item) => ({ label: item.label, value: Math.max(Number(item.value || 0), 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  canvas.dataset.chartBarCount = String(cleaned.length);

  if (!cleaned.length) {
    new Chart(canvas, {
      type: "bar",
      data: { labels: ["Sin datos"], datasets: [{ data: [0], backgroundColor: [emptyColor()] }] },
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
          backgroundColor: cleaned.map((_, idx) => palette[idx % palette.length]),
          borderRadius: 7,
          borderSkipped: false,
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
          grid: { color: gridColor() },
          ticks: {
            font: { size: 11 },
            color: axisColor(),
            callback: (value: number) => formatValue(value),
          },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: axisColor() },
        },
      },
    },
  });
}

export function renderMultiLineChart(canvas: HTMLCanvasElement, series: MultiLineSeries[], options: MultiLineChartOptions): void {
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
  canvas.dataset.chartHasZeroTick = String(forceZeroTick || series.some((s) => s.values.some((v) => v === 0)));
  canvas.dataset.chartSeriesNames = JSON.stringify(series.map((s) => s.name));

  const tooltipData = series.map((s) =>
    s.values.map((v, i) => {
      const label = labels[i] || `Punto ${i + 1}`;
      return `${s.name} · ${label}: ${formatValue(v)}`;
    })
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
        backgroundColor: s.color + "22",
        borderWidth: 2.5,
        pointRadius: 3.5,
        pointHoverRadius: 5,
        pointBackgroundColor: s.color,
        pointBorderColor: pointBorderColorVar(),
        pointBorderWidth: 1.5,
        fill: false,
        tension: 0.3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          display: series.length > 1,
          position: "top" as const,
          labels: { font: { size: 11 }, color: legendColor(), boxWidth: 12, boxHeight: 12 },
        },
        tooltip: {
          enabled: false,
          external: makeExternalTooltip((tooltip) => {
            return tooltip.dataPoints
              .map((dp: any) => `${dp.dataset.label} · ${dp.label}: ${formatValue(dp.raw)}`)
              .join(" | ");
          }),
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            color: axisColor(),
            maxRotation: 0,
            callback: (_value: any, index: number) => (labels[index] || "").slice(0, 3),
          },
        },
        y: {
          grid: { color: gridColor() },
          ticks: {
            font: { size: 10 },
            color: axisColor(),
            callback: (value: number) => formatAxisValue(value),
          },
          beginAtZero: forceZeroTick,
        },
      },
    },
  });
}
