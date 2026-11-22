<script setup lang="ts">
import { computed } from 'vue'

import NeonChartSeries from '../../ui/NeonChartSeries.vue'
import type { EvolutionKind, EvolutionPoint } from './view-model'

// The drawing of «Cómo ha ido»: the net worth at the close of each month as a
// line under an accent gradient or as bars, filling its positioned parent. A
// hollow dot or bar is a month still open. The desktop card puts a grid and
// figures around it; the mobile cover lets it run behind the figure, with only
// the last point marked.
const props = withDefaults(
  defineProps<{ points: EvolutionPoint[]; kind: EvolutionKind; dots?: 'all' | 'last' }>(),
  { dots: 'all' },
)

const line = computed(() =>
  props.points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' '),
)
const area = computed(() => {
  const points = props.points
  if (!points.length) return ''
  return `${line.value} L${points[points.length - 1].x} 100 L${points[0].x} 100 Z`
})
const barWidth = computed(() => Math.min((100 / Math.max(props.points.length, 1)) * 0.56, 9))
const dotted = computed(() => (props.dots === 'last' ? props.points.slice(-1) : props.points))
</script>

<template>
  <div class="absolute inset-0" aria-hidden="true">
    <template v-if="kind === 'line'">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        class="absolute inset-0 size-full overflow-visible"
      >
        <NeonChartSeries :line="line" :area="area" />
      </svg>
      <span
        v-for="point in dotted"
        :key="point.month"
        class="border-accent absolute -ms-1.5 -mt-1.5 size-3 rounded-full border-2"
        :class="point.open ? 'bg-panel' : 'bg-accent'"
        :style="{ left: `${point.x}%`, top: `${point.y}%` }"
      ></span>
    </template>
    <template v-else>
      <span
        v-for="point in points"
        :key="point.month"
        class="border-accent absolute bottom-0 rounded-t-lg border-2 border-b-0"
        :class="point.open ? 'bg-transparent' : 'bg-accent'"
        :style="{
          left: `${point.x - barWidth / 2}%`,
          width: `${barWidth}%`,
          height: `${100 - point.y}%`,
        }"
      ></span>
    </template>
  </div>
</template>
