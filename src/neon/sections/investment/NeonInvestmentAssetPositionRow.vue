<script setup lang="ts">
import { computed } from 'vue'

import { instrumentHref } from './asset-route'
import type { PositionLine, UninstrumentedLine } from './asset-view-model'
import NeonInvestmentPositionEvolution from './NeonInvestmentPositionEvolution.vue'
import { TONE_TEXT } from './view-model'

// One row of what an account holds: a position (a link to its instrument's
// detail, with units, average price, weight and evolution) or, closing the
// list, «Sin instrumento»: the same figures of what has no instrument, with
// dashes where a position has units, price, weight and a line, and no link.
// The grid of the table row comes from the caller.
const props = withDefaults(
  defineProps<{
    line: PositionLine | UninstrumentedLine
    note?: string | null
    /** The mobile frame: a short list instead of a table row. */
    stacked?: boolean
  }>(),
  { note: null, stacked: false },
)

const emit = defineEmits<{ open: [instrumentId: string] }>()

const position = computed(() => ('instrumentId' in props.line ? props.line : null))
// The row's own data attribute: each kind is found by its own.
const kind = computed(() =>
  position.value
    ? { 'data-asset-position-line': position.value.symbol }
    : { 'data-asset-uninstrumented': '' },
)

const LINK =
  'text-row text-text outline-accent min-w-0 truncate font-bold after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px]'

function onOpen(event: MouseEvent, instrumentId: string): void {
  // A modified click keeps the browser's own way of opening a link.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  emit('open', instrumentId)
}
</script>

<template>
  <li
    v-if="stacked"
    class="border-line grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t py-2.5"
    :class="position && 'relative'"
    v-bind="kind"
  >
    <a
      v-if="position"
      :href="instrumentHref(position.instrumentId)"
      :class="LINK"
      @click="onOpen($event, position.instrumentId)"
    >
      {{ position.symbol }}
    </a>
    <span v-else class="text-row text-soft min-w-0 truncate font-bold">Sin instrumento</span>
    <span class="font-display text-figure-row text-end font-semibold tabular-nums">
      {{ line.value }}
    </span>
    <span v-if="position" class="text-muted text-meta min-w-0 font-bold tabular-nums">
      {{ position.units }} · media {{ position.averagePrice }}
    </span>
    <span v-else class="text-muted text-meta min-w-0 font-bold tabular-nums">
      Has puesto {{ line.invested }}
    </span>
    <span class="text-meta text-end font-extrabold tabular-nums" :class="TONE_TEXT[line.tone]">
      {{ line.gain }}
      <span v-if="line.ret">{{ line.ret }}</span>
    </span>
    <template v-if="position">
      <span class="text-muted text-meta font-bold tabular-nums">
        Has puesto {{ position.invested }} · {{ position.weight }}
      </span>
      <span
        v-if="position.estimated"
        class="text-muted text-meta text-end font-bold"
        :title="note ?? undefined"
      >
        Sin cotización
      </span>
      <NeonInvestmentPositionEvolution
        v-if="position.evolution"
        class="col-span-2 h-8 w-full"
        :evolution="position.evolution"
        :tone="position.tone"
        :symbol="position.symbol"
      />
    </template>
  </li>

  <li
    v-else
    class="border-line grid items-center border-t py-3.5"
    :class="position && 'relative'"
    v-bind="kind"
  >
    <span v-if="position" class="grid min-w-0 gap-px">
      <a
        :href="instrumentHref(position.instrumentId)"
        :class="LINK"
        @click="onOpen($event, position.instrumentId)"
      >
        {{ position.symbol }}
      </a>
      <span
        v-if="position.estimated"
        class="text-muted text-meta font-bold"
        :title="note ?? undefined"
      >
        Sin cotización
      </span>
    </span>
    <span v-else class="text-soft text-row min-w-0 truncate font-bold">Sin instrumento</span>
    <span v-if="position" class="text-soft text-note text-end font-bold tabular-nums">
      {{ position.units }}
    </span>
    <span v-else class="text-muted text-note text-end font-bold">—</span>
    <span v-if="position" class="text-soft text-note text-end font-bold tabular-nums">
      {{ position.averagePrice }}
    </span>
    <span v-else class="text-muted text-note text-end font-bold">—</span>
    <span class="font-display text-figure-row text-end font-semibold tabular-nums">
      {{ line.value }}
    </span>
    <span class="text-soft text-note text-end font-bold tabular-nums">{{ line.invested }}</span>
    <span
      class="flex flex-col items-end gap-px text-end tabular-nums"
      :class="TONE_TEXT[line.tone]"
    >
      <span class="text-note font-semibold">{{ line.gain }}</span>
      <span v-if="line.ret" class="text-meta font-extrabold">{{ line.ret }}</span>
    </span>
    <span v-if="position" class="text-soft text-note text-end font-bold tabular-nums">
      {{ position.weight }}
    </span>
    <span v-else class="text-muted text-note text-end font-bold">—</span>
    <span class="flex justify-end">
      <NeonInvestmentPositionEvolution
        v-if="position?.evolution"
        class="h-7 w-full max-w-28"
        :evolution="position.evolution"
        :tone="position.tone"
        :symbol="position.symbol"
      />
    </span>
  </li>
</template>
