<script setup lang="ts">
import type { PositionEvolutionLine } from './asset-view-model'
import { SPARK_HEIGHT, SPARK_WIDTH, TONE_STROKE, type Tone } from './view-model'

// The month by month line of a position, in the sparkline's box. Dashed when it
// is only the position's share of the account's value. The caller sizes it
// with `class`.
defineProps<{ evolution: PositionEvolutionLine; tone: Tone; symbol: string }>()
</script>

<template>
  <svg
    :viewBox="`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`"
    preserveAspectRatio="none"
    class="block overflow-visible"
    role="img"
    :aria-label="evolution.label"
    :data-position-evolution="symbol"
  >
    <path
      :d="evolution.path"
      fill="none"
      :stroke="TONE_STROKE[tone]"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
      :stroke-dasharray="evolution.approximate ? '3 3' : undefined"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
