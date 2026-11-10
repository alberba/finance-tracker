<script setup lang="ts">
import { computed, useId } from 'vue'

import NeonCard from '../../ui/NeonCard.vue'
import type { EvolutionChart, EvolutionKind, EvolutionPeriod } from './view-model'

// «Cómo ha ido»: the net worth at the close of each month or quarter of the
// year, as a line or as bars. A hollow dot or bar is a month still open.
const props = defineProps<{ chart: EvolutionChart }>()
const period = defineModel<EvolutionPeriod>('period', { required: true })
const kind = defineModel<EvolutionKind>('kind', { required: true })

const PERIODS: { value: EvolutionPeriod; label: string }[] = [
  { value: 'month', label: 'Mes' },
  { value: 'quarter', label: 'Trimestre' },
]
const KINDS: { value: EvolutionKind; label: string; icon: string }[] = [
  { value: 'line', label: 'Gráfica de línea', icon: 'M3 17l5-7 4 3 8-9M16 4h4v4' },
  { value: 'bars', label: 'Gráfica de barras', icon: 'M5 20v-7M12 20V5M19 20v-10' },
]

const gradientId = `wealth-area-${useId()}`
const line = computed(() => props.chart.points.map((point) => `${point.x},${point.y}`).join(' '))
const area = computed(() => {
  const points = props.chart.points
  if (!points.length) return ''
  return `${points[0].x},100 ${line.value} ${points[points.length - 1].x},100`
})
const barWidth = computed(() => Math.min((100 / Math.max(props.chart.points.length, 1)) * 0.56, 9))
</script>

<template>
  <NeonCard title="Cómo ha ido" title-id="wealth-evolution-title">
    <template #actions>
      <p class="text-muted text-note">{{ chart.note }}</p>
    </template>

    <div class="flex flex-wrap justify-between gap-x-4 gap-y-2">
      <div
        role="group"
        aria-label="Periodo de la gráfica"
        class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
      >
        <button
          v-for="option in PERIODS"
          :key="option.value"
          type="button"
          :aria-pressed="period === option.value"
          class="rounded-pill outline-accent text-note min-h-9 px-2 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11 pointer-coarse:px-3"
          :class="period === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft'"
          @click="period = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <div
        role="group"
        aria-label="Tipo de gráfica"
        class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
      >
        <button
          v-for="option in KINDS"
          :key="option.value"
          type="button"
          :aria-pressed="kind === option.value"
          :aria-label="option.label"
          :title="option.label"
          class="rounded-pill outline-accent grid min-h-9 w-10 place-items-center focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11 pointer-coarse:w-11"
          :class="kind === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft'"
          @click="kind = option.value"
        >
          <svg
            class="size-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="option.icon" />
          </svg>
        </button>
      </div>
    </div>

    <div
      class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 @max-lg:-mx-3 @max-lg:grid-cols-1"
    >
      <div class="relative h-60 min-w-11 @max-lg:hidden" aria-hidden="true">
        <span
          v-for="tick in chart.ticks"
          :key="tick.label"
          class="text-muted absolute inset-e-0 -translate-y-1/2 text-xs whitespace-nowrap tabular-nums"
          :style="{ top: `${tick.top}%` }"
          >{{ tick.label }}</span
        >
      </div>
      <div class="relative h-60 min-w-0 @max-lg:h-[266px]" role="img" :aria-label="chart.label">
        <span
          v-for="tick in chart.ticks"
          :key="tick.label"
          class="border-grid absolute inset-x-0 border-t @max-lg:hidden"
          :style="{ top: `${tick.top}%` }"
          aria-hidden="true"
        ></span>
        <template v-if="kind === 'line'">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            class="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--color-accent)" stop-opacity="0.42" />
                <stop offset="0.55" stop-color="var(--color-accent)" stop-opacity="0.14" />
                <stop offset="1" stop-color="var(--color-accent)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <polygon :points="area" :fill="`url(#${gradientId})`" />
            <polyline
              :points="line"
              fill="none"
              stroke="var(--color-accent)"
              stroke-width="2.5"
              stroke-linejoin="round"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span
            v-for="point in chart.points"
            :key="point.month"
            class="border-accent absolute -ms-1.5 -mt-1.5 size-3 rounded-full border-2"
            :class="point.open ? 'bg-panel' : 'bg-accent'"
            :style="{ left: `${point.x}%`, top: `${point.y}%` }"
            aria-hidden="true"
          ></span>
        </template>
        <template v-else>
          <span
            v-for="point in chart.points"
            :key="point.month"
            class="border-accent absolute bottom-0 rounded-t-lg border-2 border-b-0"
            :class="point.open ? 'bg-transparent' : 'bg-accent'"
            :style="{
              left: `${point.x - barWidth / 2}%`,
              width: `${barWidth}%`,
              height: `${100 - point.y}%`,
            }"
            aria-hidden="true"
          ></span>
        </template>
      </div>
      <span class="@max-lg:hidden" aria-hidden="true"></span>
      <ul
        class="mt-2 grid min-w-0"
        :style="{ gridTemplateColumns: `repeat(${chart.points.length}, minmax(0, 1fr))` }"
        aria-hidden="true"
      >
        <li
          v-for="point in chart.points"
          :key="point.month"
          class="grid min-w-0 content-start justify-items-center gap-0.5 text-center"
        >
          <span
            class="text-meta font-bold whitespace-nowrap"
            :class="point.open ? 'text-text' : 'text-soft'"
            >{{ point.label }}</span
          >
          <span
            v-if="point.sub"
            class="text-muted text-xs whitespace-nowrap tabular-nums @max-lg:hidden"
            >{{ point.sub }}</span
          >
        </li>
      </ul>
    </div>
  </NeonCard>
</template>
