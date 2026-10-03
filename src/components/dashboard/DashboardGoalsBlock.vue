<script setup lang="ts">
import DashboardBlock from './DashboardBlock.vue'
import type { DashboardGoals } from '../../domain/dashboard/view-model'

// 05 · METAS: one progress ring per savings goal, with saved against target
// and its year with the monthly amount it needs. Three small rings in a row
// on mobile.
defineProps<{ goals: DashboardGoals }>()
defineEmits<{ navigate: [target: string] }>()

const CIRCUMFERENCE = 2 * Math.PI * 50

function dash(progress: number): string {
  return `${((progress / 100) * CIRCUMFERENCE).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`
}
</script>

<template>
  <DashboardBlock
    kicker="05 · METAS"
    title="Objetivos de ahorro"
    title-id="dashboard-goals-title"
    :description="goals.summary || undefined"
  >
    <div v-if="!goals.items.length" class="grid justify-items-start gap-2">
      <p class="text-text-muted text-sm">Aún no tienes objetivos de ahorro.</p>
      <button
        type="button"
        class="text-primary focus-visible:outline-primary inline-flex min-h-11 items-center text-sm font-semibold hover:underline focus-visible:outline-2"
        @click="$emit('navigate', 'goals')"
      >
        Definir un objetivo
      </button>
    </div>
    <ul v-else id="savings-goal" class="grid grid-cols-3 gap-2 sm:gap-0">
      <li
        v-for="goal in goals.items"
        :key="goal.key"
        class="border-line grid content-start justify-items-center gap-2 text-center sm:justify-items-start sm:gap-3.5 sm:border-l sm:px-6 sm:text-left sm:first:border-l-0 sm:first:pl-0"
        :aria-label="`${goal.name}: ${goal.progressLabel}, ${goal.saved} de ${goal.target}`"
        data-goal
      >
        <span class="relative size-21 sm:size-30">
          <svg class="size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--track-bg)" stroke-width="10" />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="var(--primary)"
              stroke-width="10"
              stroke-linecap="round"
              :stroke-dasharray="dash(goal.progress)"
            />
          </svg>
          <span
            class="font-display text-text-main absolute inset-0 grid place-items-center text-base font-semibold tabular-nums sm:text-2xl"
          >
            {{ goal.progressLabel }}
          </span>
        </span>
        <span class="grid gap-1">
          <span class="text-text-main text-sm leading-tight font-bold sm:text-base">
            {{ goal.name }}
          </span>
          <span class="font-display text-text-muted text-xs tabular-nums sm:text-sm">
            <span class="sm:text-text-main">{{ goal.saved }}</span
            ><span class="hidden sm:inline"> / {{ goal.target }}</span>
          </span>
          <span class="text-text-muted hidden text-sm sm:inline">{{ goal.detail }}</span>
        </span>
      </li>
    </ul>
  </DashboardBlock>
</template>
