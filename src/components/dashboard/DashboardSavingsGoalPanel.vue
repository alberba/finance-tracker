<script setup lang="ts">
import type { DashboardSavingsGoal, DashboardTone } from '../../scripts/app/dashboard-view-model'

defineProps<{
  goal: DashboardSavingsGoal
}>()

const emit = defineEmits<{
  navigate: [target: string]
}>()

function remainingGoalClass(tone: DashboardTone): string {
  return tone === 'good' ? 'text-good' : 'text-bad'
}
</script>

<template>
  <article
    class="dash-panel flex min-w-0 flex-col justify-start gap-3.5 rounded-lg border border-(--line) bg-(--bg-panel) p-[clamp(18px,1.9vw,24px)] [box-shadow:var(--shadow-soft)]"
  >
    <h3 class="dash-panel-title text-base font-bold tracking-[-0.01em] text-(--text-main)">
      Objetivo de ahorro
    </h3>
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
          <span
            class="absolute inset-[13px] rounded-full bg-(--bg-panel)"
            aria-hidden="true"
          ></span>
          <span
            class="savings-ring-pct absolute inset-0 grid place-items-center text-2xl font-bold text-(--text-main)"
          >
            {{ goal.progressLabel }}
          </span>
        </div>
        <div class="savings-goal-info grid min-w-0 flex-1 gap-[5px]">
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
          <p class="savings-goal-sub text-[0.82rem] text-(--text-muted)">
            {{ goal.subLabel }}
          </p>
          <p
            class="savings-goal-remaining text-[0.82rem] text-(--text-faint)"
            :class="remainingGoalClass(goal.remainingTone)"
          >
            {{ goal.remainingLabel }}
          </p>
        </div>
      </template>
    </div>
    <button
      type="button"
      class="dash-more mt-auto inline-flex min-h-0 items-center gap-1.5 border-t border-(--line) bg-transparent px-0 pt-3 pb-0 text-[0.85rem] font-semibold text-(--primary) [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:transition-transform hover:[&_svg]:translate-x-0.75"
      data-goto="goals"
      @click="emit('navigate', 'goals')"
    >
      Ver todos los objetivos
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        aria-hidden="true"
      >
        <path d="M4 10h11M11 6l4 4-4 4"></path>
      </svg>
    </button>
  </article>
</template>
