<script setup lang="ts">
import type { InstrumentRow } from './cover-groups'
import { TONE_TEXT } from './view-model'

// The five cells of an instrument's row on the cover (by instrument or by
// type): name with its type, in how many accounts it is held, weight, value
// and result. The row that holds them is the grid and the click target; the
// name is the button keyboards and screen readers use.
defineProps<{ row: InstrumentRow }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button
    type="button"
    class="text-text outline-accent flex min-w-0 flex-col items-start gap-px text-start focus-visible:outline-2 focus-visible:outline-offset-4"
    :aria-label="row.openLabel"
    @click.stop="emit('open')"
  >
    <span class="text-row line-clamp-2 font-bold wrap-anywhere">{{ row.name }}</span>
    <span class="text-muted text-note font-bold">{{ row.typeLabel }}</span>
  </button>
  <span class="text-soft text-note min-w-0 text-end font-bold wrap-anywhere tabular-nums">
    {{ row.holdings }}
  </span>
  <span class="flex min-w-0 items-center gap-2">
    <span class="bg-line rounded-pill h-1.5 min-w-0 flex-auto overflow-clip" aria-hidden="true">
      <span
        class="bg-neutral-bar rounded-pill block h-full"
        :style="{ width: `${row.weightPct}%` }"
      ></span>
    </span>
    <span class="text-soft text-note flex-none text-end font-bold tabular-nums">
      {{ row.weight }}
    </span>
  </span>
  <span class="font-display text-figure-row text-end font-semibold wrap-anywhere tabular-nums">
    {{ row.value }}
    <span
      v-if="row.estimated"
      class="text-muted text-note block font-bold"
      title="Sin cotización: el valor es una estimación"
    >
      sin precio
    </span>
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
</template>
