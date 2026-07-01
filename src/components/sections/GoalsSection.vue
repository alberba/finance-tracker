<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import GoalEditorCard from '../goals/GoalEditorCard.vue'
import GoalProgressCard from '../goals/GoalProgressCard.vue'
import AppSection from '../ui/AppSection.vue'
import type { GoalField, GoalKey } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useGoalsStore } from '../../stores/goals'

const props = withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const financialStateStore = useFinancialStateStore()
const goalsStore = useGoalsStore()
const { viewModel } = storeToRefs(goalsStore)

const formatter = computed(
  () =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: financialStateStore.currency || 'EUR',
      maximumFractionDigits: 2,
    }),
)

function formatMoney(value: number): string {
  return formatter.value.format(Number(value || 0))
}

function updateGoalField(payload: { key: GoalKey; field: GoalField; value: string }): void {
  goalsStore.updateGoalField(payload.key, payload.field, payload.value)
}
</script>

<template>
  <AppSection id="goals" :is-active="props.isActive">
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Metas financieras</p>
        <h2 id="goals-title">Objetivos</h2>
        <p>Seguimiento de metas patrimoniales y de inversión.</p>
      </div>
    </div>

    <div class="goal-edit-grid">
      <GoalEditorCard
        v-for="editor in viewModel.editors"
        :key="editor.key"
        :editor="editor"
        @update-goal-field="updateGoalField"
      />
    </div>

    <div class="goal-progress">
      <GoalProgressCard
        v-for="item in viewModel.progressItems"
        :key="item.key"
        :item="item"
        :format-money="formatMoney"
      />
    </div>
  </AppSection>
</template>
