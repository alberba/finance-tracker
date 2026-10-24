import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import { buildGoalsViewModel, previewGoalEdit } from '../domain/goals/view-model'
import {
  resolveOrCreateCategoryId,
  syncGoalUpsert,
  syncListDiff,
} from '../lib/client/command-mapping'
import type { Goal, GoalKey, SavingGoal } from '../scripts/types'
import { round2, uid } from '../scripts/utils'
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

  /** A savings goal travels as a `goal` row tied to its saving category. */
  async function buildSavingGoalData(goal: SavingGoal) {
    const categoryId = await resolveOrCreateCategoryId('saving', goal.category)
    if (!categoryId) return null
    return {
      key: `saving:${goal.id}`,
      categoryId,
      name: goal.name,
      targetAmount: goal.targetAmount,
      currency: financialStateStore.currency,
    }
  }

  function commitSavingGoals(change: (goals: SavingGoal[]) => void, message: string): void {
    const before = financialStateStore.state.savingGoals
    financialStateStore.commitState((draft) => change(draft.savingGoals))
    void syncListDiff('goal', before, financialStateStore.state.savingGoals, buildSavingGoalData)
    showToast(message)
  }

  function validSavingGoal(input: Omit<SavingGoal, 'id'>): boolean {
    return (
      Boolean(input.name.trim()) &&
      Boolean(input.category) &&
      financialStateStore.state.savingCategories.includes(input.category) &&
      Number.isFinite(input.targetAmount) &&
      input.targetAmount > 0
    )
  }

  function addSavingGoal(input: Omit<SavingGoal, 'id'>): boolean {
    if (!validSavingGoal(input)) return false
    commitSavingGoals((goals) => {
      goals.push({
        id: uid('saving-goal'),
        name: input.name.trim(),
        category: input.category,
        targetAmount: round2(input.targetAmount),
      })
    }, 'Objetivo de ahorro guardado.')
    return true
  }

  function updateSavingGoal(id: string, input: Omit<SavingGoal, 'id'>): boolean {
    if (!validSavingGoal(input)) return false
    commitSavingGoals((goals) => {
      const goal = goals.find((item) => item.id === id)
      if (!goal) return
      goal.name = input.name.trim()
      goal.category = input.category
      goal.targetAmount = round2(input.targetAmount)
    }, 'Objetivo de ahorro guardado.')
    return true
  }

  function removeSavingGoal(id: string): void {
    commitSavingGoals((goals) => {
      const index = goals.findIndex((item) => item.id === id)
      if (index >= 0) goals.splice(index, 1)
    }, 'Objetivo de ahorro eliminado.')
  }

  return {
    month,
    viewModel,
    preview,
    saveGoal,
    addSavingGoal,
    updateSavingGoal,
    removeSavingGoal,
  }
})
