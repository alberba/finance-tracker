import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildGoalsViewModel } from '../domain/goals/view-model'
import type { GoalField, GoalKey } from '../scripts/types'
import { parseFloatSafe, parseIntSafe, round2 } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

export const useGoalsStore = defineStore('goals', () => {
  const financialStateStore = useFinancialStateStore()
  const uiStore = useUiStore()

  const viewModel = computed(() =>
    buildGoalsViewModel(financialStateStore.state, uiStore.ui.investmentMonth),
  )
  const goals = computed(() => financialStateStore.goals)
  const orderedGoals = computed(() => Object.values(goals.value))

  function updateGoalField(key: GoalKey, field: GoalField, value: string): void {
    financialStateStore.commitState((draft) => {
      if (field === 'targetYear') {
        draft.goals[key].targetYear = parseIntSafe(value, draft.year)
        return
      }

      if (field === 'targetAmount') {
        draft.goals[key].targetAmount = round2(parseFloatSafe(value, 0))
        return
      }

      draft.goals[key].name = value
    })
  }

  return {
    viewModel,
    goals,
    orderedGoals,
    updateGoalField,
  }
})
