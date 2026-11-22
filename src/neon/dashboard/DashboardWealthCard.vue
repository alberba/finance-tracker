<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import type { SectionId } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import NeonLineChart from '../ui/NeonLineChart.vue'
import { WEALTH_RANGES, type NeonDashboardViewModel, type WealthRange } from './view-model'

// Patrimonio: today's net worth, its change this month and this year, and its
// evolution over the range picked (DESIGN.md, Segmentado and Gráfico).
const props = defineProps<{ wealth: NeonDashboardViewModel['wealth'] }>()
const range = defineModel<WealthRange>('range', { required: true })
const emit = defineEmits<{ navigate: [section: SectionId] }>()

const hovered = shallowRef<number | null>(null)
// The figure follows the point being read on the chart.
const figure = computed(() =>
  hovered.value !== null
    ? (props.wealth.chart.readings[hovered.value]?.value ?? props.wealth.value)
    : props.wealth.value,
)

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
// The changes below the figure are today's: while another point is read they
// step back so they are not taken for that point's.
const FADE = 'motion-safe:transition-opacity motion-safe:duration-160'
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
          class="outline-accent rounded-pill text-meta min-h-9 min-w-11 px-2.5 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[transform,background-color,color] motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.96] pointer-coarse:min-h-11"
          :class="range === option.value ? 'bg-sel-bg text-sel-text' : 'text-muted'"
          @click="range = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </template>

    <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <NeonFigure :value="figure" class="text-figure-lg text-text font-semibold" />
      <span
        v-if="wealth.monthChange"
        class="text-muted text-note"
        :class="[FADE, hovered !== null && 'opacity-40']"
      >
        <b class="font-extrabold" :class="TONE_TEXT[wealth.monthChange.tone]">{{
          wealth.monthChange.text
        }}</b>
        este mes
      </span>
    </p>
    <p
      v-if="wealth.yearChange"
      class="text-muted text-note"
      :class="[FADE, hovered !== null && 'opacity-40']"
    >
      <b class="font-extrabold" :class="TONE_TEXT[wealth.yearChange.tone]">{{
        wealth.yearChange.text
      }}</b>
      en lo que va de año
    </p>
    <NeonLineChart v-if="wealth.chart.line" v-model:active="hovered" :chart="wealth.chart" />
  </NeonCard>
</template>
