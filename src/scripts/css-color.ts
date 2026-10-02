export function resolveCssColor(
  value: string,
  fallback: string,
  element?: Element,
): string {
  const propertyName = cssPropertyName(value)
  if (!propertyName || typeof window === 'undefined') {
    return fallback
  }

  return (
    getComputedStyle(element ?? document.documentElement).getPropertyValue(propertyName).trim() ||
    fallback
  )
}

function cssPropertyName(value: string): string | null {
  if (value.startsWith('--')) {
    return value
  }
  return /^var\((--[^)]+)\)$/.exec(value)?.[1] ?? null
}
