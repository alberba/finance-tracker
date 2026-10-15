import { computed } from 'vue'

import { useFinancialStateStore } from '../stores/financial-state'

export function useAccountRequirement() {
  const financialStateStore = useFinancialStateStore()
  const needsAccount = computed(() => financialStateStore.accounts.length === 0)

  return { needsAccount }
}
