export function round2(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100
}
