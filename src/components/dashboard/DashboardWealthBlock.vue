<script setup lang="ts">
import { computed } from 'vue'

import DashboardBlock from './DashboardBlock.vue'
import type { DashboardWealthKind, DashboardWealthSplit } from '../../domain/dashboard/view-model'

// 01 · PATRIMONIO: a donut with the total in the middle and the legend with
// amount and share per kind of asset.
const props = defineProps<{ split: DashboardWealthSplit }>()

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** A small gap between segments, in the same units as the circumference. */
const GAP = 2

const KIND_COLOR: Record<DashboardWealthKind, { stroke: string; dot: string }> = {
  cash: { stroke: 'var(--chart-series-3)', dot: 'bg-(--chart-series-3)' },
  funds: { stroke: 'var(--chart-series-4)', dot: 'bg-(--chart-series-4)' },
  crypto: { stroke: 'var(--chart-series-10)', dot: 'bg-(--chart-series-10)' },
  other: { stroke: 'var(--chart-series-1)', dot: 'bg-(--chart-series-1)' },
}

const segments = computed(() => {
  let start = 0
  return props.split.items.map((item) => {
    const length = (item.weight / 100) * CIRCUMFERENCE
    const gap = props.split.items.length > 1 ? GAP : 0
    const segment = {
      kind: item.kind,
      dash: `${Math.max(length - gap, 0).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`,
      offset: (-start).toFixed(2),
    }
    start += length
    return segment
  })
})

const kinds = computed(() => {
  const count = props.split.items.length
  return `${count} ${count === 1 ? 'tipo' : 'tipos'}`
})
</script>

<template>
  <DashboardBlock
    kicker="01 · PATRIMONIO"
    title="Distribución del patrimonio"
    title-id="dashboard-wealth-title"
  >
    <p v-if="!split.items.length" class="text-text-muted py-2 text-sm">
      Configura tus cuentas e inversiones en Patrimonio.
    </p>
    <div
      v-else
      class="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-5 sm:grid-cols-1"
      data-wealth-split
    >
      <div class="relative size-34 sm:size-44 sm:justify-self-center">
        <svg
          class="size-full -rotate-90"
          viewBox="0 0 140 140"
          role="img"
          aria-label="Distribución del patrimonio por tipo de activo"
        >
          <circle
            v-for="segment in segments"
            :key="segment.kind"
            cx="70"
            cy="70"
            :r="RADIUS"
            fill="none"
            :stroke="KIND_COLOR[segment.kind].stroke"
            stroke-width="18"
            :stroke-dasharray="segment.dash"
            :stroke-dashoffset="segment.offset"
          />
        </svg>
        <span class="absolute inset-0 grid place-content-center gap-0.5 text-center">
          <span class="text-text-muted text-xs">{{ kinds }}</span>
          <span class="font-display text-text-main text-sm font-semibold tabular-nums sm:text-lg">
            {{ split.total }}
          </span>
        </span>
      </div>
      <ul id="wealth-split-legend" class="grid min-w-0">
        <li
          v-for="item in split.items"
          :key="item.kind"
          class="border-line grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 border-t first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_3.5rem] sm:first:border-t"
        >
          <span class="text-text-main flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span
              class="size-2.5 shrink-0 rounded-xs"
              :class="KIND_COLOR[item.kind].dot"
              aria-hidden="true"
            ></span>
            <span class="truncate">{{ item.label }}</span>
          </span>
          <span class="font-display text-text-main hidden text-sm tabular-nums sm:inline">
            {{ item.amount }}
          </span>
          <span class="font-display text-text-muted text-right text-sm tabular-nums">
            {{ item.share }}
          </span>
        </li>
      </ul>
    </div>
  </DashboardBlock>
</template>
