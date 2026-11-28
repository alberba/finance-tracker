<script setup lang="ts">
import type { InstrumentTotal } from './instrument-view-model'
import { TONE_TEXT } from './view-model'

// One row of what is held of an instrument: an account's position, or the
// total of all of them (`total`, a heavier name). The figures are the same
// shape in both, so the table row and the stacked row are written once. The
// row's own data attribute (`data-instrument-position`, `data-instrument-total`)
// and the grid of the table come from the caller.
withDefaults(
  defineProps<{
    name: string
    figures: InstrumentTotal
    /** The value is an estimate: it says so, quietly, with `note` on hover. */
    estimated?: boolean
    note?: string | null
    /** The mobile frame: a short list instead of a table row. */
    stacked?: boolean
    total?: boolean
  }>(),
  { estimated: false, note: null, stacked: false, total: false },
)
</script>

<template>
  <li
    v-if="stacked"
    class="border-line grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t py-2.5"
  >
    <span class="text-row min-w-0 truncate" :class="total ? 'font-extrabold' : 'font-bold'">
      {{ name }}
    </span>
    <span class="font-display text-figure-row text-end font-semibold tabular-nums">
      {{ figures.value }}
    </span>
    <span class="text-muted text-meta min-w-0 font-bold tabular-nums">
      {{ figures.units }} títulos · puesto {{ figures.invested }}
    </span>
    <span class="text-meta text-end font-extrabold tabular-nums" :class="TONE_TEXT[figures.tone]">
      {{ figures.gain }}
      <span v-if="figures.ret">{{ figures.ret }}</span>
    </span>
    <span
      v-if="estimated"
      class="text-muted text-meta col-span-2 font-bold"
      :title="note ?? undefined"
    >
      Sin cotización
    </span>
  </li>
  <li v-else class="border-line grid items-center border-t py-3.5">
    <span class="grid min-w-0 gap-px">
      <span class="text-row truncate" :class="total ? 'font-extrabold' : 'font-bold'">
        {{ name }}
      </span>
      <span v-if="estimated" class="text-muted text-meta font-bold" :title="note ?? undefined">
        Sin cotización
      </span>
    </span>
    <span class="text-soft text-note text-end font-bold tabular-nums">{{ figures.units }}</span>
    <span class="font-display text-figure-row text-end font-semibold tabular-nums">
      {{ figures.value }}
    </span>
    <span class="text-soft text-note text-end font-bold tabular-nums">
      {{ figures.invested }}
    </span>
    <span
      class="flex flex-col items-end gap-px text-end tabular-nums"
      :class="TONE_TEXT[figures.tone]"
    >
      <span class="text-note font-semibold">{{ figures.gain }}</span>
      <span v-if="figures.ret" class="text-meta font-extrabold">{{ figures.ret }}</span>
    </span>
  </li>
</template>
