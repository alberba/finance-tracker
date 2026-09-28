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
  <div id="savings-goal" class="grid min-w-0 gap-4">
    <p v-if="goal.kind === 'empty'" class="text-text-faint py-2 text-sm">
      {{ goal.message }}
    </p>
    <template v-else>
      <strong class="text-text-faint text-xs font-bold">
        {{ goal.name }} · {{ goal.targetYear }}
      </strong>
      <div class="grid min-w-0 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div
          class="progress-ring mx-auto w-36 sm:w-40"
          :style="{ '--p': goal.progress.toFixed(1) }"
        >
          <span class="absolute inset-4 rounded-full bg-(--bg-panel)" aria-hidden="true"></span>
          <span class="text-text-main absolute inset-0 grid place-items-center text-2xl font-bold">
            {{ goal.progressLabel }}
          </span>
        </div>
        <div class="flex min-w-0 flex-col justify-center gap-1.5">
          <p class="text-text-muted">
            Objetivo: <strong>{{ goal.target }}</strong>
          </p>
          <strong class="font-mono text-2xl font-medium [overflow-wrap:anywhere] text-(--income)">
            {{ goal.current }}
          </strong>
        </div>
        <p class="text-sm sm:col-span-2" :class="remainingGoalClass(goal.remainingTone)">
          {{ goal.remainingLabel }}
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Conic progress ring; --p (0–100) comes from the template. */
.progress-ring {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 9999px;
  background: conic-gradient(
    var(--income, #2f9e44) calc(var(--p, 0) * 1%),
    var(--track-bg, rgba(255, 255, 255, 0.12)) 0
  );
}
</style>
