<script setup lang="ts">
import { computed } from 'vue'

import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import {
  DIRECTION_OPTIONS,
  SORT_OPTIONS,
  SPARK_HEIGHT,
  SPARK_WIDTH,
  sortLabel,
  type PositionRow,
  type SortDirection,
  type SortKey,
  type Tone,
} from './view-model'

// The positions of the cover, one ledger row each: ticker and name, units and
// price, weight, value, result, and how it did in the period. The whole row
// opens the position; the name is the button keyboards and screen readers use.
const props = defineProps<{
  rows: readonly PositionRow[]
  sortKey: SortKey
  sortDirection: SortDirection
}>()

const emit = defineEmits<{
  open: [id: string]
  sort: [key: SortKey, direction: SortDirection]
}>()

const TONE_TEXT: Record<Tone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  neutral: 'text-text',
}
const TONE_STROKE: Record<Tone, string> = {
  gain: 'var(--color-gain)',
  loss: 'var(--color-loss)',
  neutral: 'var(--color-text)',
}
const COLUMNS = 'grid-cols-[minmax(220px,1fr)_120px_170px_150px_150px_220px]'
const SORT_ICON = 'M4 7h16M7 12h10M10 17h4'

function sortGroups(): ChoiceGroup<string>[] {
  return [
    { key: 'by', options: SORT_OPTIONS, value: props.sortKey },
    { key: 'direction', options: DIRECTION_OPTIONS, value: props.sortDirection },
  ]
}

// The ticker column only exists when some asset has a ticker; a row without
// one keeps its place so the names stay aligned.
const hasTickers = computed(() => props.rows.some((row) => row.symbol))

function onSort(group: string, value: string): void {
  if (group === 'by') emit('sort', value as SortKey, props.sortDirection)
  else emit('sort', props.sortKey, value as SortDirection)
}
</script>

<template>
  <section class="flex min-w-0 flex-col" aria-label="Posiciones" data-investment-positions>
    <NeonChoiceMenu
      class="mbe-1.5 self-end"
      :text="sortLabel(sortKey, sortDirection)"
      label="Ordenar por"
      :icon="SORT_ICON"
      :groups="sortGroups()"
      @select="onSort"
    />
    <div
      class="text-muted text-label tracking-label grid gap-x-7 pbe-2.5 font-extrabold uppercase"
      :class="COLUMNS"
      aria-hidden="true"
    >
      <span>Activo</span>
      <span class="text-end">Títulos</span>
      <span>Peso</span>
      <span class="text-end">Valor</span>
      <span class="text-end">Resultado</span>
      <span>Evolución</span>
    </div>
    <ul class="m-0 list-none p-0">
      <li
        v-for="row in rows"
        :key="row.id"
        class="border-line hover:bg-panel grid cursor-pointer items-center gap-x-7 border-t py-4 motion-safe:transition-colors motion-safe:duration-160"
        :class="COLUMNS"
        :data-investment-position="row.id"
        @click="emit('open', row.id)"
      >
        <button
          type="button"
          class="text-text outline-accent flex min-w-0 items-center gap-3 text-start focus-visible:outline-2 focus-visible:outline-offset-4"
          :aria-label="row.openLabel"
          @click.stop="emit('open', row.id)"
        >
          <span
            v-if="hasTickers"
            class="bg-panel2 w-16 flex-none rounded-[8px] px-2 py-0.5 text-center font-mono text-[13px] font-bold tracking-[0.04em]"
            :class="row.symbol ? '' : 'invisible'"
          >
            {{ row.symbol ?? '·' }}
          </span>
          <span class="truncate text-[16px] font-bold">{{ row.name }}</span>
        </button>
        <span class="min-w-0 text-end">
          <template v-if="row.units">
            <span
              class="font-display block text-[16px] font-semibold whitespace-nowrap tabular-nums"
            >
              {{ row.units }}
            </span>
            <span class="text-muted block text-[13px] whitespace-nowrap">{{ row.price }}</span>
          </template>
          <span v-else class="text-muted">—</span>
        </span>
        <span class="flex min-w-0 items-center gap-3">
          <span class="bg-line rounded-pill h-1.5 flex-auto overflow-clip" aria-hidden="true">
            <span
              class="bg-neutral-bar rounded-pill block h-full"
              :style="{ width: `${row.weightPct}%` }"
            ></span>
          </span>
          <span class="text-soft min-w-[52px] flex-none text-end text-[14px] font-bold">
            {{ row.weight }}
          </span>
        </span>
        <span
          class="font-display text-end text-[16px] font-semibold whitespace-nowrap tabular-nums"
        >
          {{ row.value }}
        </span>
        <span class="flex flex-col items-end gap-px text-end">
          <span
            class="font-display text-[16px] font-semibold whitespace-nowrap tabular-nums"
            :class="TONE_TEXT[row.tone]"
          >
            {{ row.gain }}
          </span>
          <span class="text-[14px] font-extrabold whitespace-nowrap" :class="TONE_TEXT[row.tone]">
            {{ row.ret }}
          </span>
        </span>
        <span class="flex min-w-0 items-center gap-3" role="img" :aria-label="row.sparkLabel">
          <svg
            :viewBox="`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`"
            preserveAspectRatio="none"
            class="block h-9 min-w-20 flex-auto overflow-visible"
            aria-hidden="true"
          >
            <path
              :d="row.spark"
              fill="none"
              :stroke="TONE_STROKE[row.changeTone]"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span
            class="min-w-16 flex-none text-end text-[14px] font-extrabold whitespace-nowrap"
            :class="TONE_TEXT[row.changeTone]"
          >
            {{ row.change }}
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>
