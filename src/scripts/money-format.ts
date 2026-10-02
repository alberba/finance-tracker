export function formatMoneyForCurrency(value: number, currency: string): string {
  const safeCurrency = normalizeCurrency(currency)
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(Number(value || 0))
  } catch {
    return `${Number(value || 0).toFixed(2)} ${safeCurrency}`
  }
}

export function formatCompactMoneyForCurrency(value: number, currency: string): string {
  const safeCurrency = normalizeCurrency(currency)
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: safeCurrency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(Number(value || 0))
  } catch {
    return formatMoneyForCurrency(value, safeCurrency)
  }
}

function normalizeCurrency(currency: string): string {
  return String(currency || 'EUR')
    .toUpperCase()
    .slice(0, 3)
}
