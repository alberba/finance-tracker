<script setup lang="ts">
import type { InstrumentPositionLine, InstrumentTotal } from './instrument-view-model'
import NeonInvestmentInstrumentPositionRow from './NeonInvestmentInstrumentPositionRow.vue'

// What is held of an instrument in each account (#561): units, value, what went
// in and the result, with the total of all of them under the lines. Desktop is
// a dense table with the value as the figure of each row; the mobile frame
// stacks each account as a short list. A position with no quote says so,
// quietly: its value is an estimate.
withDefaults(
  defineProps<{
    positions: readonly InstrumentPositionLine[]
    total: InstrumentTotal | null
    note: string | null
    stacked?: boolean
  }>(),
  { stacked: false },
)

const COLUMNS =
  'grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-[clamp(0.625rem,1.5cqi,1.75rem)]'
</script>

<template>
  <section class="grid min-w-0 gap-3" aria-labelledby="instrument-positions-title">
    <h2 id="instrument-positions-title" class="text-block-title m-0 font-extrabold">Posiciones</h2>

    <p v-if="!positions.length" class="text-muted text-note m-0" data-instrument-no-positions>
      Ahora mismo no tienes títulos de este instrumento en ninguna cuenta.
    </p>

    <ul v-else-if="stacked" class="m-0 list-none p-0">
      <NeonInvestmentInstrumentPositionRow
        v-for="line in positions"
        :key="line.accountId"
        stacked
        :name="line.accountName"
        :figures="line"
        :estimated="line.estimated"
        :note="note"
        :data-instrument-position="line.accountId"
      />
      <NeonInvestmentInstrumentPositionRow
        v-if="total"
        stacked
        total
        name="Total"
        :figures="total"
        data-instrument-total
      />
    </ul>

    <template v-else>
      <div
        class="text-muted text-label tracking-label grid pbe-2.5 font-extrabold uppercase"
        :class="COLUMNS"
        aria-hidden="true"
      >
        <span>Cuenta</span>
        <span class="text-end">Títulos</span>
        <span class="text-end">Valor</span>
        <span class="text-end">Invertido</span>
        <span class="text-end">Ganancia</span>
      </div>
      <ul class="m-0 list-none p-0">
        <NeonInvestmentInstrumentPositionRow
          v-for="line in positions"
          :key="line.accountId"
          :class="COLUMNS"
          :name="line.accountName"
          :figures="line"
          :estimated="line.estimated"
          :note="note"
          :data-instrument-position="line.accountId"
        />
        <NeonInvestmentInstrumentPositionRow
          v-if="total"
          :class="COLUMNS"
          total
          name="Total"
          :figures="total"
          data-instrument-total
        />
      </ul>
    </template>
  </section>
</template>
