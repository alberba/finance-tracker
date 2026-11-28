<script setup lang="ts">
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import {
  DIRECTION_OPTIONS,
  SORT_OPTIONS,
  SPARK_HEIGHT,
  SPARK_WIDTH,
  sortLabel,
  type AccountRow,
  type SortDirection,
  type SortKey,
  type Tone,
  TONE_STROKE,
  TONE_TEXT,
} from './view-model'

// The investment accounts of the cover, one ledger row each: name, how many
// positions it holds, weight, value, result, and how it did in the period. An
// account carries no symbol (ADR 0011). The whole row opens the account; the
// name is the button keyboards and screen readers use.
const props = defineProps<{
  rows: readonly AccountRow[]
  sortKey: SortKey
  sortDirection: SortDirection
  /** The cover is coming in: the rows follow its blocks (see the section). */
  entering: boolean
}>()

const emit = defineEmits<{
  open: [id: string]
  sort: [key: SortKey, direction: SortDirection]
}>()

// The table comes in with its head, at 200ms, its rows close behind one
// another (`anim-row`, 25ms apart up to the ninth) and each weight bar drawing
// itself, shorter than elsewhere, as its row lands: the cover is done in about
// a second. Only while the cover comes in: a row that moves later just moves.
const LIST_START = 200
const rowAt = (index: number) => LIST_START + Math.min(index, 8) * 25
const rowIn = (index: number) =>
  props.entering ? { animationDelay: `${rowAt(index)}ms` } : undefined
const barIn = (index: number) =>
  props.entering
    ? { animationDelay: `${rowAt(index) + 100}ms`, animationDuration: '600ms' }
    : undefined

const COLUMNS =
  'grid-cols-[minmax(0,1.65fr)_minmax(0,0.72fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-x-[clamp(0.625rem,1.5cqi,1.75rem)]'
const SORT_ICON = 'M4 7h16M7 12h10M10 17h4'

function sortGroups(): ChoiceGroup<SortKey | SortDirection>[] {
  return [
    { key: 'by', options: SORT_OPTIONS, value: props.sortKey },
    { key: 'direction', options: DIRECTION_OPTIONS, value: props.sortDirection },
  ]
}

const isDirection = (value: SortKey | SortDirection): value is SortDirection =>
  value === 'asc' || value === 'desc'

function onSort(_group: string, value: SortKey | SortDirection): void {
  if (isDirection(value)) emit('sort', props.sortKey, value)
  else emit('sort', value, props.sortDirection)
}
</script>

<template>
  <section
    class="flex min-w-0 flex-col"
    aria-labelledby="investment-accounts-title"
    data-investment-accounts
  >
    <div
      class="motion-safe:animate-rise relative z-10 mbe-3 flex flex-wrap items-center justify-between gap-3 motion-safe:[animation-delay:200ms]"
    >
      <h2 id="investment-accounts-title" class="font-display text-figure-block font-bold">
        Cuentas
      </h2>
      <NeonChoiceMenu
        :text="sortLabel(sortKey, sortDirection)"
        label="Ordenar por"
        :icon="SORT_ICON"
        :groups="sortGroups()"
        @select="onSort"
      />
    </div>
    <div
      class="text-muted text-label tracking-label motion-safe:animate-rise grid pbe-2.5 font-extrabold uppercase motion-safe:[animation-delay:200ms]"
      :class="COLUMNS"
      aria-hidden="true"
    >
      <span>Cuenta</span>
      <span class="text-end">Posiciones</span>
      <span>Peso</span>
      <span class="text-end">Valor</span>
      <span class="text-end">Resultado</span>
      <span>Evolución</span>
    </div>
    <ul class="m-0 list-none p-0">
      <li
        v-for="(row, index) in rows"
        :key="row.id"
        class="border-line pointer-fine:hover:bg-panel grid cursor-pointer items-center border-t py-4 motion-safe:transition-colors motion-safe:duration-160"
        :class="[COLUMNS, entering && 'motion-safe:animate-row']"
        :style="rowIn(index)"
        :data-investment-account="row.id"
        @click="emit('open', row.id)"
      >
        <button
          type="button"
          class="text-text outline-accent flex min-w-0 items-center gap-2 text-start focus-visible:outline-2 focus-visible:outline-offset-4"
          :aria-label="row.openLabel"
          @click.stop="emit('open', row.id)"
        >
          <span class="text-row line-clamp-2 font-bold wrap-anywhere">{{ row.name }}</span>
        </button>
        <span class="min-w-0 text-end wrap-anywhere">
          <span v-if="row.holdings" class="text-soft text-note font-bold tabular-nums">
            {{ row.holdings }}
          </span>
          <span v-else class="text-muted">—</span>
        </span>
        <span class="flex min-w-0 items-center gap-2">
          <span
            class="bg-line rounded-pill h-1.5 min-w-0 flex-auto overflow-clip"
            aria-hidden="true"
          >
            <span
              class="bg-neutral-bar rounded-pill block h-full"
              :class="entering && 'motion-safe:animate-wipe'"
              :style="{ width: `${row.weightPct}%`, ...barIn(index) }"
            ></span>
          </span>
          <span class="text-soft text-note flex-none text-end font-bold tabular-nums">
            {{ row.weight }}
          </span>
        </span>
        <span
          class="font-display text-figure-row text-end font-semibold wrap-anywhere tabular-nums"
        >
          {{ row.value }}
        </span>
        <span class="flex min-w-0 flex-col items-end gap-px text-end wrap-anywhere">
          <span
            class="font-display text-figure-row font-semibold tabular-nums"
            :class="TONE_TEXT[row.tone]"
          >
            {{ row.gain }}
          </span>
          <span class="text-note font-extrabold tabular-nums" :class="TONE_TEXT[row.tone]">
            {{ row.ret }}
          </span>
        </span>
        <span class="flex min-w-0 items-center gap-2" role="img" :aria-label="row.sparkLabel">
          <svg
            :viewBox="`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`"
            preserveAspectRatio="none"
            class="block h-9 min-w-0 flex-1 overflow-visible"
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
            class="text-note max-w-full flex-none text-end font-extrabold wrap-anywhere tabular-nums"
            :class="TONE_TEXT[row.changeTone]"
          >
            {{ row.change }}
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>
