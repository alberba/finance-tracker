import { computed } from 'vue'

import { formatMoney as formatMoneyIn, formatSignedMoney as formatSignedMoneyIn } from '../lib/format'
import { useFinancialStateStore } from '../stores/financial-state'

/**
 * Money formatters from `lib/format` bound to the active state currency.
 */
export function useMoneyFormatter() {
  const financialStateStore = useFinancialStateStore()

  const compactFormatter = computed(() => {
    const currency = (financialStateStore.currency || 'EUR').toUpperCase()
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      })
    } catch {
      return null
    }
  })

  function formatMoney(value: unknown): string {
    return formatMoneyIn(value, financialStateStore.currency || 'EUR')
  }

  function formatSignedMoney(value: unknown): string {
    return formatSignedMoneyIn(value, financialStateStore.currency || 'EUR')
  }

  function formatMoneyCompact(value: unknown): string {
    const instance = compactFormatter.value
    if (!instance) {
      return formatMoney(value)
    }
    return instance.format(Number(value || 0))
  }

  return { formatMoney, formatSignedMoney, formatMoneyCompact }
}
