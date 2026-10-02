export function round2(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100
}

/** An amount as the text a field shows to edit it ("64,32"); the inverse of `parseDecimal`. */
export function formatDecimalInput(value: number): string {
  return String(round2(value)).replace('.', ',')
}

/** An amount typed by hand ("64,32", "1.250,5", "123.45") as a number; NaN when it is none. */
export function parseDecimal(text: string): number {
  const compact = String(text).trim().replace(/\s/g, '')
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact
  return normalized === '' ? NaN : Number(normalized)
}
