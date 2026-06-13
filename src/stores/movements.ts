import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useFinancialStateStore } from './financial-state'

export const useMovementsStore = defineStore('movements', () => {
  const financialStateStore = useFinancialStateStore()

  const movements = computed(() => financialStateStore.transactions)
  const incomeMovements = computed(() =>
    movements.value.filter((transaction) => transaction.type === 'income'),
  )
  const expenseMovements = computed(() =>
    movements.value.filter((transaction) => transaction.type === 'expense'),
  )
  const investmentMovements = computed(() =>
    movements.value.filter((transaction) => transaction.type === 'investment'),
  )

  return {
    movements,
    incomeMovements,
    expenseMovements,
    investmentMovements,
  }
})
