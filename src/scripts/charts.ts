// Chart.js is loaded via CDN in FinanceTrackerShell.astro and exposed as a global.
declare const Chart: any;

export interface LineChartOptions {
  color: string;
  fill: string;
  labels?: readonly string[];
  formatValue: (value: number) => string;
  formatAxisValue?: (value: number) => string;
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

function getOrCreateCanvas(container: HTMLElement): HTMLCanvasElement {
  let canvas = container.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    container.appendChild(canvas);
  }
  return canvas;
}

function destroyExistingChart(canvas: HTMLCanvasElement): void {
  const existing = (Chart as any).getChart(canvas);
  if (existing) {
    existing.destroy();
  }
}

function getTooltipEl(): HTMLElement | null {
  return document.getElementById("chart-tooltip");
}

function showExternalTooltip(context: any, getText: (dataPoints: any[]) => string): void {
  const tooltipEl = getTooltipEl();
  if (!tooltipEl) return;

  const { tooltip } = context;
  if (tooltip.opacity === 0) {
    tooltipEl.classList.remove("is-visible");
    tooltipEl.setAttribute("aria-hidden", "true");
    return;
  }

  const dataPoints = tooltip.dataPoints || [];
  if (!dataPoints.length) return;

  tooltipEl.textContent = getText(dataPoints);
  tooltipEl.classList.add("is-visible");
  tooltipEl.setAttribute("aria-hidden", "false");

  const canvasRect = context.chart.canvas.getBoundingClientRect();
  const x = canvasRect.left + tooltip.caretX + 14;
  const y = canvasRect.top + tooltip.caretY + 14;
  const maxLeft = window.innerWidth - tooltipEl.offsetWidth - 8;
  const maxTop = window.innerHeight - tooltipEl.offsetHeight - 8;
  tooltipEl.style.left = `${Math.min(Math.max(8, x), Math.max(8, maxLeft))}px`;
  tooltipEl.style.top = `${Math.min(Math.max(8, y), Math.max(8, maxTop))}px`;
}

export function renderLineChart(container: HTMLElement, values: number[], options: LineChartOptions): void {
  const canvas = getOrCreateCanvas(container);
  destroyExistingChart(canvas);

  const labels = options.labels || values.map((_, i) => String(i + 1));
  const formatAxisValue = options.formatAxisValue || options.formatValue;

  // Store data count for E2E testing
  container.dataset.chartPointCount = String(values.length);

  new Chart(canvas, {
    type: "line",
    data: {
      labels: Array.from(labels),
      datasets: [
        {
          data: values,
          borderColor: options.color,
          backgroundColor: options.fill,
          borderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: options.color,
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.6,
      animation: { duration: 300 },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context: any) =>
            showExternalTooltip(context, (pts) => {
              const pt = pts[0];
              return `${pt.label}: ${options.formatValue(pt.raw as number)}`;
            }),
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(220,231,226,0.7)" },
          ticks: {
            color: "#7b8b8d",
            font: { size: 11 },
            maxRotation: 0,
          },
        },
        y: {
          beginAtZero: options.includeZeroBaseline ?? true,
          grid: { color: "rgba(220,231,226,0.7)" },
          ticks: {
            color: "#7b8b8d",
            font: { size: 11 },
            callback: (value: number) => formatAxisValue(value),
            maxTicksLimit: 5,
          },
        },
      },
    },
  });
}

export function renderGroupedBarChart(
  container: HTMLElement,
  labels: readonly string[],
  series: GroupedBarSeriesItem[],
  formatValue: (value: number) => string = (v) => String(Number(v || 0).toFixed(2))
): void {
  const canvas = getOrCreateCanvas(container);
  destroyExistingChart(canvas);

  // Store bar count (labels × series) for E2E testing
  container.dataset.chartBarCount = String(labels.length * series.length);

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: Array.from(labels),
      datasets: series.map((item) => ({
        label: item.name,
        data: item.values,
        backgroundColor: item.color,
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.75,
        categoryPercentage: 0.75,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.6,
      animation: { duration: 300 },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "start",
          labels: {
            color: "#516164",
            font: { size: 11 },
            boxWidth: 12,
            boxHeight: 12,
            useBorderRadius: true,
            borderRadius: 3,
            padding: 14,
          },
        },
        tooltip: {
          enabled: false,
          external: (context: any) =>
            showExternalTooltip(context, (pts) => {
              return pts.map((pt: any) => `${pt.dataset.label}: ${formatValue(pt.raw as number)}`).join(" · ");
            }),
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#7b8b8d",
            font: { size: 10 },
            maxRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(220,231,226,0.7)" },
          ticks: {
            color: "#7b8b8d",
            font: { size: 11 },
            callback: (value: number) => formatValue(value),
            maxTicksLimit: 5,
          },
        },
      },
    },
  });
}

export function renderDonutChart(container: HTMLElement, data: DonutChartItem[], formatValue: (value: number) => string): void {
  const canvas = getOrCreateCanvas(container);
  destroyExistingChart(canvas);

  const clean = data.map((item) => ({ ...item, value: Math.max(Number(item.value || 0), 0) }));
  const total = clean.reduce((sum, item) => sum + item.value, 0);

  // Store segment count for E2E testing
  container.dataset.chartSegmentCount = String(clean.filter((item) => item.value > 0).length);

  if (total <= 0) {
    canvas.style.display = "none";
    let msg = container.querySelector<HTMLParagraphElement>(".chart-no-data");
    if (!msg) {
      msg = document.createElement("p");
      msg.className = "chart-no-data";
      msg.style.cssText = "text-align:center;color:#6b7b7f;padding:2rem 0;";
      container.appendChild(msg);
    }
    msg.textContent = "Sin datos";
    return;
  }

  canvas.style.display = "";
  const noData = container.querySelector(".chart-no-data");
  if (noData) noData.remove();

  const centerTextPlugin = {
    id: "donutCenterText",
    beforeDraw(chart: any) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.font = "700 15px 'Space Grotesk', sans-serif";
      ctx.fillStyle = "#18363b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatValue(total), cx, cy + 7);
      ctx.font = "11px 'Space Grotesk', sans-serif";
      ctx.fillStyle = "#6b7b7f";
      ctx.fillText("Total", cx, cy - 9);
      ctx.restore();
    },
  };

  new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: clean.map((item) => item.label),
      datasets: [
        {
          data: clean.map((item) => item.value),
          backgroundColor: clean.map((item) => item.color),
          borderColor: "#fff",
          borderWidth: 3,
          hoverBorderWidth: 3,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.7,
      cutout: "62%",
      animation: { duration: 300 },
      plugins: {
        legend: {
          display: true,
          position: "right",
          labels: {
            color: "#536366",
            font: { size: 12 },
            boxWidth: 13,
            boxHeight: 13,
            useBorderRadius: true,
            borderRadius: 3,
            padding: 12,
            generateLabels: (chart: any) => {
              const dataset = chart.data.datasets[0];
              return (chart.data.labels as string[]).map((label: string, i: number) => ({
                text: `${label} (${formatValue(dataset.data[i] as number)})`,
                fillStyle: (dataset.backgroundColor as string[])[i],
                strokeStyle: "#fff",
                hidden: false,
                index: i,
              }));
            },
          },
        },
        tooltip: {
          enabled: false,
          external: (context: any) =>
            showExternalTooltip(context, (pts) => {
              const pt = pts[0];
              const value = pt.raw as number;
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return `${pt.label}: ${formatValue(value)} (${pct}%)`;
            }),
        },
      },
    },
    plugins: [centerTextPlugin],
  });
}

export function renderHorizontalBarChart(
  container: HTMLElement,
  data: Array<{ label: string; value: number }>,
  palette: string[],
  formatValue: (value: number) => string
): void {
  const canvas = getOrCreateCanvas(container);
  destroyExistingChart(canvas);

  const cleaned = data
    .map((item) => ({ label: item.label, value: Math.max(Number(item.value || 0), 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!cleaned.length) {
    canvas.style.display = "none";
    let msg = container.querySelector<HTMLParagraphElement>(".chart-no-data");
    if (!msg) {
      msg = document.createElement("p");
      msg.className = "chart-no-data";
      msg.style.cssText = "text-align:center;color:#6b7b7f;padding:2rem 0;";
      container.appendChild(msg);
    }
    msg.textContent = "Sin datos de inversión";
    return;
  }

  canvas.style.display = "";
  const noData = container.querySelector(".chart-no-data");
  if (noData) noData.remove();

  // Dynamic height based on number of items
  const itemHeight = 36;
  const minHeight = 120;
  canvas.style.height = `${Math.max(minHeight, cleaned.length * itemHeight + 40)}px`;

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: cleaned.map((item) => item.label),
      datasets: [
        {
          data: cleaned.map((item) => item.value),
          backgroundColor: cleaned.map((_, i) => palette[i % palette.length]),
          borderRadius: 7,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context: any) =>
            showExternalTooltip(context, (pts) => {
              const pt = pts[0];
              return `${pt.label}: ${formatValue(pt.raw as number)}`;
            }),
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(220,231,226,0.7)" },
          ticks: {
            color: "#7b8b8d",
            font: { size: 11 },
            callback: (value: number) => formatValue(value),
            maxTicksLimit: 5,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: "#566669",
            font: { size: 11 },
          },
        },
      },
    },
  });
}
