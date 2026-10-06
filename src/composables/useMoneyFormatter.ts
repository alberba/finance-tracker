import {
  formatCompactMoney,
  formatMoney as formatMoneyIn,
  formatSignedMoney as formatSignedMoneyIn,
} from '../lib/format'
import { useFinancialStateStore } from '../stores/financial-state'

/**
 * Money formatters from `lib/format` bound to the active state currency.
 */
export function useMoneyFormatter() {
  const financialStateStore = useFinancialStateStore()

  function formatMoney(value: unknown): string {
    return formatMoneyIn(value, financialStateStore.currency || 'EUR')
  }

  function formatSignedMoney(value: unknown): string {
    return formatSignedMoneyIn(value, financialStateStore.currency || 'EUR')
  }

  function formatMoneyCompact(value: unknown): string {
    return formatCompactMoney(value, financialStateStore.currency || 'EUR')
  }

  return { formatMoney, formatSignedMoney, formatMoneyCompact }
}
