type ValueFormatter = (value: number) => string;

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

export function renderLineChart(svg: SVGSVGElement, values: number[], options: LineChartOptions): void {
  const width = 720;
  const height = 280;
  const padX = 64;
  const padY = 26;
  const labels = options.labels || [];
  const formatAxisValue = options.formatAxisValue || options.formatValue;
  const yScale = options.yScale || "linear";
  const includeZeroBaseline = options.includeZeroBaseline ?? true;
  const yPaddingRatio = options.yPaddingRatio ?? 0.08;

  const safeValues = values.map((v) => Number(v || 0));
  const rawMax = Math.max(...safeValues);
  const rawMin = Math.min(...safeValues);
  let domainMax = includeZeroBaseline ? Math.max(rawMax, 0) : rawMax;
  let domainMin = includeZeroBaseline ? Math.min(rawMin, 0) : rawMin;

  if (!Number.isFinite(domainMax)) {
    domainMax = 0;
  }
  if (!Number.isFinite(domainMin)) {
    domainMin = 0;
  }
  if (domainMax === domainMin) {
    const delta = Math.max(Math.abs(domainMax) * 0.1, 1);
    domainMax += delta;
    domainMin -= delta;
  }

  if (yScale === "linear") {
    const pad = (domainMax - domainMin) * yPaddingRatio;
    domainMax += pad;
    domainMin -= pad;
    if (includeZeroBaseline) {
      if (rawMin >= 0) {
        domainMin = Math.min(domainMin, 0);
      }
      if (rawMax <= 0) {
        domainMax = Math.max(domainMax, 0);
      }
    }
  }

  const logOffset = yScale === "log" && domainMin <= 0 ? -domainMin : 0;
  const toScale = (value: number) => {
    if (yScale !== "log") {
      return value;
    }
    return Math.log10(value + logOffset + 1);
  };
  const fromScale = (value: number) => {
    if (yScale !== "log") {
      return value;
    }
    return Math.pow(10, value) - logOffset - 1;
  };
  let scaledMax = toScale(domainMax);
  let scaledMin = toScale(domainMin);
  if (yScale === "log") {
    const scaledPad = (scaledMax - scaledMin || 1) * yPaddingRatio;
    scaledMax += scaledPad;
    scaledMin -= scaledPad;
  }
  const scaledSpan = scaledMax - scaledMin || 1;

  const stepX = (width - padX * 2) / Math.max(safeValues.length - 1, 1);
  const points = safeValues.map((value, idx) => {
    const x = padX + idx * stepX;
    const scaledValue = toScale(value);
    const y = height - padY - ((scaledValue - scaledMin) / scaledSpan) * (height - padY * 2);
    return { x, y };
  });

  const line = points.map((point, idx) => `${idx === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L ${points[points.length - 1]?.x || padX},${height - padY} L ${points[0]?.x || padX},${height - padY} Z`;

  const axis = labels
    .map((label, idx) => {
      const x = padX + idx * stepX;
      return `<text x="${x}" y="${height - 6}" text-anchor="middle" font-size="11" fill="#657478">${label.slice(0, 3)}</text>`;
    })
    .join("");

  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const scaledValue = scaledMax - (scaledSpan / 3) * i;
    const value = fromScale(scaledValue);
    const y = padY + ((height - padY * 2) / 3) * i;
    return `
      <line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="#edf3f0" />
      <text x="${padX - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#7b8b8d">${formatAxisValue(value)}</text>
    `;
  }).join("");

  const circles = points
    .map((point, idx) => {
      const label = labels[idx] || `Punto ${idx + 1}`;
      const value = safeValues[idx] || 0;
      return `
        <circle cx="${point.x}" cy="${point.y}" r="4" fill="${options.color}" stroke="#fff" stroke-width="2" data-chart-tooltip="${escapeSvgText(`${label}: ${options.formatValue(value)}`)}">
          <title>${escapeSvgText(label)}: ${escapeSvgText(options.formatValue(value))}</title>
        </circle>
      `;
    })
    .join("");

  svg.innerHTML = `
    ${yTicks}
    <path d="${area}" fill="${options.fill}"></path>
    <path d="${line}" fill="none" stroke="${options.color}" stroke-width="3" stroke-linecap="round"></path>
    ${circles}
    ${axis}
  `;
}

export function renderGroupedBarChart(
  svg: SVGSVGElement,
  labels: readonly string[],
  series: GroupedBarSeriesItem[],
  formatValue: ValueFormatter = (value) => String(Number(value || 0).toFixed(2))
): void {
  const width = 720;
  const height = 280;
  const padX = 48;
  const padY = 30;

  const maxValue = Math.max(0, ...series.flatMap((item) => item.values.map((value) => Number(value || 0))));
  const chartHeight = height - padY * 2;
  const groupWidth = (width - padX * 2) / labels.length;
  const barWidth = Math.max((groupWidth - 8) / series.length - 2, 6);

  const bars = labels
    .map((_, monthIndex) => {
      const xBase = padX + monthIndex * groupWidth + 4;
      return series
        .map((item, index) => {
          const value = Number(item.values[monthIndex] || 0);
          const h = maxValue <= 0 ? 0 : (value / maxValue) * chartHeight;
          const x = xBase + index * (barWidth + 2);
          const y = height - padY - h;
          const monthLabel = labels[monthIndex] || `Mes ${monthIndex + 1}`;
          return `
            <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="${item.color}" data-chart-tooltip="${escapeSvgText(`${monthLabel} · ${item.name}: ${formatValue(value)}`)}">
              <title>${escapeSvgText(monthLabel)} · ${escapeSvgText(item.name)}: ${escapeSvgText(formatValue(value))}</title>
            </rect>
          `;
        })
        .join("");
    })
    .join("");

  const xLabels = labels
    .map((label, idx) => {
      const x = padX + idx * groupWidth + groupWidth / 2;
      return `<text x="${x}" y="${height - 7}" text-anchor="middle" font-size="10" fill="#6b7b7f">${label.slice(0, 3)}</text>`;
    })
    .join("");

  const legend = series
    .map(
      (item, idx) => `
        <rect x="${padX + idx * 140}" y="6" width="12" height="12" rx="2" fill="${item.color}"></rect>
        <text x="${padX + 18 + idx * 140}" y="16" font-size="11" fill="#516164">${item.name}</text>
      `
    )
    .join("");

  svg.innerHTML = `
    <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="#dce7e2"></line>
    ${bars}
    ${xLabels}
    ${legend}
  `;
}

export function renderDonutChart(svg: SVGSVGElement, data: DonutChartItem[], formatValue: ValueFormatter): void {
  const width = 420;
  const height = 260;
  const cx = 130;
  const cy = 130;
  const radius = 74;
  const thickness = 28;

  const clean = data.map((item) => ({ ...item, value: Math.max(Number(item.value || 0), 0) }));
  const total = clean.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#6b7b7f">Sin datos</text>`;
    return;
  }

  let angleStart = -Math.PI / 2;
  const segments = clean
    .map((item) => {
      const angle = (item.value / total) * Math.PI * 2;
      const angleEnd = angleStart + angle;
      const path = donutArcPath(cx, cy, radius, radius - thickness, angleStart, angleEnd);
      angleStart = angleEnd;
      const pct = total > 0 ? (item.value / total) * 100 : 0;
      return `
        <path d="${path}" fill="${item.color}" data-chart-tooltip="${escapeSvgText(`${item.label}: ${formatValue(item.value)} (${pct.toFixed(1)}%)`)}">
          <title>${escapeSvgText(item.label)}: ${escapeSvgText(formatValue(item.value))} (${pct.toFixed(1)}%)</title>
        </path>
      `;
    })
    .join("");

  const legend = clean
    .map(
      (item, idx) => `
        <rect x="240" y="${46 + idx * 28}" width="12" height="12" rx="2" fill="${item.color}"></rect>
        <text x="258" y="${56 + idx * 28}" font-size="12" fill="#536366">${escapeSvgText(item.label)} (${formatValue(item.value)})</text>
      `
    )
    .join("");

  svg.innerHTML = `
    ${segments}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="11" fill="#6b7b7f">Total</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="16" font-weight="700" fill="#18363b">${formatValue(total)}</text>
    ${legend}
  `;
}

export function renderHorizontalBarChart(
  svg: SVGSVGElement,
  data: Array<{ label: string; value: number }>,
  palette: string[],
  formatValue: ValueFormatter
): void {
  const width = 720;
  const rowHeight = 26;
  const startY = 24;
  const maxRows = Math.max(data.length, 1);
  const height = startY + maxRows * rowHeight + 20;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const cleaned = data
    .map((item) => ({ label: item.label, value: Math.max(Number(item.value || 0), 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!cleaned.length) {
    svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#6b7b7f">Sin datos de inversión</text>`;
    return;
  }

  const max = Math.max(...cleaned.map((item) => item.value), 1);
  const rows = cleaned
    .map((item, idx) => {
      const y = startY + idx * rowHeight;
      const barWidth = (item.value / max) * 390;
      const color = palette[idx % palette.length];
      return `
        <text x="16" y="${y + 14}" font-size="11" fill="#566669">${escapeSvgText(item.label)}</text>
        <rect x="210" y="${y + 2}" width="${barWidth}" height="14" rx="7" fill="${color}" data-chart-tooltip="${escapeSvgText(`${item.label}: ${formatValue(item.value)}`)}">
          <title>${escapeSvgText(item.label)}: ${escapeSvgText(formatValue(item.value))}</title>
        </rect>
        <text x="${210 + barWidth + 10}" y="${y + 14}" font-size="11" fill="#1a2e31">${formatValue(item.value)}</text>
      `;
    })
    .join("");

  svg.innerHTML = rows;
}

function donutArcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const startOuter = polar(cx, cy, outerR, endAngle);
  const endOuter = polar(cx, cy, outerR, startAngle);
  const startInner = polar(cx, cy, innerR, startAngle);
  const endInner = polar(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function escapeSvgText(input: string): string {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
