import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useFinancialStateStore } from './financial-state'

export const useInvestmentStore = defineStore('investment', () => {
  const financialStateStore = useFinancialStateStore()

  const assets = computed(() => financialStateStore.investmentAssets)
  const contributions = computed(() => financialStateStore.contributions)
  const movements = computed(() =>
    financialStateStore.transactions.filter((transaction) => transaction.type === 'investment'),
  )

  return {
    assets,
    contributions,
    movements,
  }
})
