<script setup lang="ts">
import type { SectionId } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import NeonLineChart from '../ui/NeonLineChart.vue'
import { WEALTH_RANGES, type NeonDashboardViewModel, type WealthRange } from './view-model'

// Patrimonio: today's net worth, its change this month and this year, and its
// evolution over the range picked (DESIGN.md, Segmentado and Gráfico).
defineProps<{ wealth: NeonDashboardViewModel['wealth'] }>()
const range = defineModel<WealthRange>('range', { required: true })
const emit = defineEmits<{ navigate: [section: SectionId] }>()

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
</script>

<template>
  <NeonCard
    title="Patrimonio"
    title-id="dashboard-wealth-title"
    :to="{ section: 'wealth', label: 'Ir a Patrimonio' }"
    data-dashboard-wealth
    @navigate="emit('navigate', $event)"
  >
    <template #actions>
      <div
        role="group"
        aria-label="Rango del gráfico"
        class="bg-panel2 rounded-pill flex gap-1 p-0.75"
      >
        <button
          v-for="option in WEALTH_RANGES"
          :key="option.value"
          type="button"
          :aria-pressed="range === option.value"
          class="outline-accent rounded-pill text-meta min-h-9 min-w-11 px-2.5 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="range === option.value ? 'bg-sel-bg text-sel-text' : 'text-muted'"
          @click="range = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </template>

    <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <NeonFigure :value="wealth.value" class="text-figure-lg text-text font-semibold" />
      <span v-if="wealth.monthChange" class="text-muted text-note">
        <b class="font-extrabold" :class="TONE_TEXT[wealth.monthChange.tone]">{{
          wealth.monthChange.text
        }}</b>
        este mes
      </span>
    </p>
    <p v-if="wealth.yearChange" class="text-muted text-note">
      <b class="font-extrabold" :class="TONE_TEXT[wealth.yearChange.tone]">{{
        wealth.yearChange.text
      }}</b>
      en lo que va de año
    </p>
    <NeonLineChart v-if="wealth.chart.line" :chart="wealth.chart" />
  </NeonCard>
</template>
