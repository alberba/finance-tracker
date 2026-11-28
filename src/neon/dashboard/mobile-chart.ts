/**
 * Geometry of the charts of the mobile home (DESIGN.md, «Inicio en móvil»):
 * several series on one shared scale, as shares of the plot (x and top,
 * 0–100), so a dashed reference reads against the main line. The range leaves
 * 8 % of the span free above and below, as the evolution chart does.
 */
export interface MobilePoint {
  x: number
  top: number
}

export interface MobileLine {
  points: MobilePoint[]
  dashed?: boolean
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * `series` share one scale over `count` slots on the x axis (a series may stop
 * before the last slot: this month up to today). `base`, when given, is kept
 * inside the range and returned as the height the main area closes on.
 */
export function sharedScale(
  series: ReadonlyArray<{ values: readonly number[]; dashed?: boolean }>,
  count: number,
  base?: number,
): { lines: MobileLine[]; baseTop: number | null } {
  const all = series.flatMap(({ values }) => values)
  if (base !== undefined) all.push(base)
  if (!all.length) return { lines: [], baseTop: null }
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || Math.abs(max) * 0.1 || 1
  const low = min - span * 0.08
  const high = max + span * 0.08
  const top = (value: number) => round2((1 - (value - low) / (high - low)) * 100)
  const x = (index: number) => round2((index / Math.max(count - 1, 1)) * 100)
  return {
    lines: series.map(({ values, dashed }) => ({
      points: values.map((value, index) => ({ x: x(index), top: top(value) })),
      dashed,
    })),
    baseTop: base === undefined ? null : top(base),
  }
}

/** Four labels spread over the axis, the first and the last always among them. */
export function spreadLabels(count: number): number[] {
  if (count <= 4) return Array.from({ length: count }, (_, index) => index)
  const last = count - 1
  return [0, Math.round(last / 3), Math.round((last * 2) / 3), last]
}
