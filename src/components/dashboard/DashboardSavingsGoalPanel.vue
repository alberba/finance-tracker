<script setup lang="ts">
import type { DashboardSavingsGoal, DashboardTone } from '../../domain/dashboard/view-model'

defineProps<{
  goal: DashboardSavingsGoal
}>()

function remainingGoalClass(tone: DashboardTone): string {
  return tone === 'good' ? 'text-(--income)' : 'text-(--expense)'
}
</script>

<template>
  <div id="savings-goal" class="flex flex-wrap gap-4">
    <p v-if="goal.kind === 'empty'" class="text-text-faint py-2 text-sm">
      {{ goal.message }}
    </p>
    <template v-else>
      <strong class="text-text-faint text-xs font-bold">
        {{ goal.name }} · {{ goal.targetYear }}
      </strong>
      <div class="flex flex-wrap justify-center gap-8">
        <div class="progress-ring w-42" :style="{ '--p': goal.progress.toFixed(1) }">
          <span class="absolute inset-4 rounded-full bg-(--bg-panel)" aria-hidden="true"></span>
          <span class="text-text-main absolute inset-0 grid place-items-center text-2xl font-bold">
            {{ goal.progressLabel }}
          </span>
        </div>
        <div class="flex flex-col justify-center gap-1.25">
          <p class="text-text-muted">
            Objetivo: <strong>{{ goal.target }}</strong>
          </p>
          <strong class="text-2xl font-bold text-(--income)">
            {{ goal.current }}
          </strong>
        </div>
        <p class="text-text-faint" :class="remainingGoalClass(goal.remainingTone)">
          {{ goal.remainingLabel }}
        </p>
      </div>
    </template>
  </div>
</template>
