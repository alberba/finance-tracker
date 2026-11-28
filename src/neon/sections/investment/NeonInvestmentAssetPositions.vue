<script setup lang="ts">
import type { PositionLine, UninstrumentedLine } from './asset-view-model'
import NeonInvestmentAssetPositionRow from './NeonInvestmentAssetPositionRow.vue'

// What an investment account holds: one line per instrument (a position, ADR
// 0011) with units, average buy price, value, what went in, the result and the
// weight inside the account. Desktop is a dense table with the value as the
// figure of each row; the mobile frame stacks each position as a short list.
// A position with no quote says so, quietly: its value is an estimate. The
// symbol of each one is a link to its instrument's detail (#561): a real
// address, so it opens in a tab and survives a reload, and it stretches over
// the whole row so the row is the tap target. What the account holds with no
// instrument (movements without units) closes the list as «Sin instrumento»,
// with no link: there is no detail to open.
withDefaults(
  defineProps<{
    positions: readonly PositionLine[]
    /** What the account holds with no instrument, as one more row; null when negligible. */
    uninstrumented?: UninstrumentedLine | null
    note: string | null
    stacked?: boolean
  }>(),
  { stacked: false, uninstrumented: null },
)

const emit = defineEmits<{ open: [instrumentId: string] }>()

const COLUMNS =
  'grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-x-[clamp(0.625rem,1.5cqi,1.75rem)]'
</script>

<template>
  <section class="grid min-w-0 gap-3" aria-labelledby="asset-positions-title" data-asset-positions>
    <h2 id="asset-positions-title" class="text-block-title m-0 font-extrabold">Posiciones</h2>

    <ul v-if="stacked" class="m-0 list-none p-0">
      <NeonInvestmentAssetPositionRow
        v-for="line in positions"
        :key="line.instrumentId"
        stacked
        :line="line"
        :note="note"
        @open="emit('open', $event)"
      />
      <NeonInvestmentAssetPositionRow v-if="uninstrumented" stacked :line="uninstrumented" />
    </ul>

    <template v-else>
      <div
        class="text-muted text-label tracking-label grid pbe-2.5 font-extrabold uppercase"
        :class="COLUMNS"
        aria-hidden="true"
      >
        <span>Instrumento</span>
        <span class="text-end">Títulos</span>
        <span class="text-end">Precio medio</span>
        <span class="text-end">Valor</span>
        <span class="text-end">Invertido</span>
        <span class="text-end">Ganancia</span>
        <span class="text-end">Peso</span>
        <span class="text-end">Evolución</span>
      </div>
      <ul class="m-0 list-none p-0">
        <NeonInvestmentAssetPositionRow
          v-for="line in positions"
          :key="line.instrumentId"
          :class="COLUMNS"
          :line="line"
          :note="note"
          @open="emit('open', $event)"
        />
        <NeonInvestmentAssetPositionRow
          v-if="uninstrumented"
          :class="COLUMNS"
          :line="uninstrumented"
        />
      </ul>
    </template>
  </section>
</template>
