<script setup lang="ts">
import type { DashboardSavingsGoal, DashboardTone } from '../../scripts/app/dashboard-view-model'

defineProps<{
  goal: DashboardSavingsGoal
}>()

function remainingGoalClass(tone: DashboardTone): string {
  return tone === 'good' ? 'text-good' : 'text-bad'
}
</script>

<template>
  <div
    id="savings-goal"
    class="savings-goal flex flex-wrap items-center gap-[clamp(18px,2.2vw,30px)] px-0 pt-2.5 pb-1.5"
  >
    <p v-if="goal.kind === 'empty'" class="dash-empty py-2 text-sm text-(--text-faint)">
      {{ goal.message }}
    </p>
    <template v-else>
      <div
        class="savings-ring relative aspect-square w-[clamp(118px,13vw,144px)] flex-none rounded-full bg-[conic-gradient(var(--income)_calc(var(--p)*1%),var(--track-bg)_0)]"
        :style="{ '--p': goal.progress.toFixed(1) }"
      >
        <span class="absolute inset-3.25 rounded-full bg-(--bg-panel)" aria-hidden="true"></span>
        <span
          class="savings-ring-pct absolute inset-0 grid place-items-center text-2xl font-bold text-(--text-main)"
        >
          {{ goal.progressLabel }}
        </span>
      </div>
      <div class="savings-goal-info grid min-w-0 flex-1 gap-1.25">
        <p class="savings-goal-name text-[0.78rem] font-semibold text-(--text-faint)">
          {{ goal.name }} · {{ goal.targetYear }}
        </p>
        <p
          class="savings-goal-line text-[0.85rem] text-(--text-muted) [&_strong]:font-bold [&_strong]:text-(--text-main)"
        >
          Objetivo: <strong>{{ goal.target }}</strong>
        </p>
        <strong
          class="savings-goal-current text-[clamp(1.4rem,2.4vw,1.9rem)] leading-[1.15] font-bold text-(--income)"
        >
          {{ goal.current }}
        </strong>
        <p
          class="savings-goal-remaining text-[0.82rem] text-(--text-faint)"
          :class="remainingGoalClass(goal.remainingTone)"
        >
          {{ goal.remainingLabel }}
        </p>
      </div>
    </template>
  </div>
</template>
