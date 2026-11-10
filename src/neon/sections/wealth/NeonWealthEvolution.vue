<script setup lang="ts">
import NeonCard from '../../ui/NeonCard.vue'
import NeonWealthPlot from './NeonWealthPlot.vue'
import type { EvolutionChart, EvolutionKind, EvolutionPeriod } from './view-model'

// «Cómo ha ido»: the net worth at the close of each month or quarter of the
// year, as a line or as bars. A hollow dot or bar is a month still open.
defineProps<{ chart: EvolutionChart }>()
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

    <div class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <div class="relative h-60 min-w-11" aria-hidden="true">
        <span
          v-for="tick in chart.ticks"
          :key="tick.label"
          class="text-muted absolute inset-e-0 -translate-y-1/2 text-xs whitespace-nowrap tabular-nums"
          :style="{ top: `${tick.top}%` }"
          >{{ tick.label }}</span
        >
      </div>
      <div class="relative h-60 min-w-0" role="img" :aria-label="chart.label">
        <span
          v-for="tick in chart.ticks"
          :key="tick.label"
          class="border-grid absolute inset-x-0 border-t"
          :style="{ top: `${tick.top}%` }"
          aria-hidden="true"
        ></span>
        <NeonWealthPlot :points="chart.points" :kind="kind" />
      </div>
      <span aria-hidden="true"></span>
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
          <span v-if="point.sub" class="text-muted text-xs whitespace-nowrap tabular-nums">{{
            point.sub
          }}</span>
        </li>
      </ul>
    </div>
  </NeonCard>
</template>
