import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import { buildGoalsViewModel, previewGoalEdit } from '../domain/goals/view-model'
import { syncGoalUpsert } from '../lib/client/command-mapping'
import type { Goal, GoalKey } from '../scripts/types'
import { round2 } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

export const useGoalsStore = defineStore('goals', () => {
  const financialStateStore = useFinancialStateStore()
  const uiStore = useUiStore()
  const { showToast } = useToast()

  /** The month the goals are measured at: the one Inversión analyses. */
  const month = computed(() => uiStore.ui.investmentMonth)
  const viewModel = computed(() => buildGoalsViewModel(financialStateStore.state, month.value))

  function preview(key: GoalKey, draft: Goal) {
    return previewGoalEdit(financialStateStore.state, month.value, key, draft)
  }

  function saveGoal(key: GoalKey, goal: Goal): void {
    financialStateStore.commitState((draft) => {
      draft.goals[key] = {
        name: goal.name.trim(),
        targetYear: Math.trunc(goal.targetYear),
        targetAmount: round2(Math.max(goal.targetAmount, 0)),
      }
    })

    const saved = financialStateStore.goals[key]
    void syncGoalUpsert(key, { key, ...saved, currency: financialStateStore.currency })
    showToast('Objetivo guardado.')
  }

  return { month, viewModel, preview, saveGoal }
})
