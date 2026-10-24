import {
  formatCompactMoney,
  formatMoney as formatMoneyIn,
  formatSignedMoney as formatSignedMoneyIn,
} from '../lib/format'
import { signedAmount } from '../domain/transactions/registry'
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

  /** A movement's amount as the user reads it: signed by its effect, or plain for a saving. */
  function formatMovementAmount(movement: { type: string; amount: unknown }): string {
    if (movement.type === 'saving') return formatMoney(Math.abs(Number(movement.amount) || 0))
    return formatSignedMoney(signedAmount(movement as Parameters<typeof signedAmount>[0]))
  }

  function formatMoneyCompact(value: unknown): string {
    return formatCompactMoney(value, financialStateStore.currency || 'EUR')
  }

  return { formatMoney, formatSignedMoney, formatMovementAmount, formatMoneyCompact }
}
