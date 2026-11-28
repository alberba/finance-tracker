<script setup lang="ts">
import type { SectionId } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFitList from '../ui/NeonFitList.vue'
import NeonProgressBar from '../ui/NeonProgressBar.vue'
import { barDelay, rowDelay } from '../ui/row-motion'
import type { NeonDashboardViewModel } from './view-model'

// Objetivos: how far each net worth goal is, with a neutral progress bar.
defineProps<{ goals: NeonDashboardViewModel['goals'] }>()
const emit = defineEmits<{ navigate: [section: SectionId] }>()
</script>

<template>
  <NeonCard
    title="Objetivos"
    title-id="dashboard-goals-title"
    :to="{ section: 'goals', label: 'Ir a Objetivos' }"
    data-dashboard-goals
    @navigate="emit('navigate', $event)"
  >
    <NeonEmptyState v-if="!goals.length">Aún no tienes objetivos definidos.</NeonEmptyState>
    <NeonFitList v-else>
      <li
        v-for="(goal, index) in goals"
        :key="goal.key"
        class="border-line motion-safe:animate-row border-t"
        :style="{ animationDelay: `${rowDelay(index)}ms` }"
      >
        <button
          type="button"
          class="outline-accent rounded-field hover:bg-panel2 -mx-3 flex min-h-16 w-[calc(100%+1.5rem)] cursor-pointer flex-col gap-1.75 px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-[background-color,transform] motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.985]"
          @click="emit('navigate', 'goals')"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-bold">{{ goal.name }}</span>
            <span class="font-display text-figure-row font-semibold tabular-nums">
              {{ goal.progress }}
            </span>
          </div>
          <NeonProgressBar :value="goal.width" :delay="barDelay(index)" />
          <span class="text-muted text-meta">{{ goal.detail }}</span>
        </button>
      </li>
    </NeonFitList>
  </NeonCard>
</template>
