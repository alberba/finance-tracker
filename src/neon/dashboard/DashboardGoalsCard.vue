<script setup lang="ts">
import type { SectionId } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonProgressBar from '../ui/NeonProgressBar.vue'
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
    <ul v-else>
      <li
        v-for="goal in goals"
        :key="goal.key"
        class="border-line flex min-h-16 flex-col gap-1.75 border-t py-2.5"
      >
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-bold">{{ goal.name }}</span>
          <span class="font-display text-figure-row font-semibold tabular-nums">
            {{ goal.progress }}
          </span>
        </div>
        <NeonProgressBar :value="goal.width" />
        <span class="text-muted text-meta">{{ goal.detail }}</span>
      </li>
    </ul>
  </NeonCard>
</template>
