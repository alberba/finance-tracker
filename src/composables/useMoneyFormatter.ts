import { computed } from 'vue'

import { useFinancialStateStore } from '../stores/financial-state'

/**
 * Currency formatter bound to the active state currency, mirroring the legacy
 * `formatMoney` helper (es-ES, 2 decimals) so migrated sections render amounts
 * identically.
 */
export function useMoneyFormatter() {
  const financialStateStore = useFinancialStateStore()

  const formatter = computed(() => {
    const currency = (financialStateStore.currency || 'EUR').toUpperCase()
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      })
    } catch {
      return null
    }
  })

  function formatMoney(value: unknown): string {
    const numeric = Number(value || 0)
    const instance = formatter.value
    if (!instance) {
      return `${numeric.toFixed(2)} ${(financialStateStore.currency || 'EUR').toUpperCase()}`
    }
    return instance.format(numeric)
  }

  return { formatMoney }
}
