import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useFinancialStateStore } from './financial-state'

export const useGoalsStore = defineStore('goals', () => {
  const financialStateStore = useFinancialStateStore()

  const goals = computed(() => financialStateStore.goals)
  const orderedGoals = computed(() => Object.values(goals.value))

  return {
    goals,
    orderedGoals,
  }
})
