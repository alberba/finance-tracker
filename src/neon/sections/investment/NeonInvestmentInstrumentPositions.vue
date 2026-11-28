<script setup lang="ts">
import type { InstrumentPositionLine, InstrumentTotal } from './instrument-view-model'
import { TONE_TEXT } from './view-model'

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
      <li
        v-for="line in positions"
        :key="line.accountId"
        class="border-line grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t py-2.5"
        :data-instrument-position="line.accountId"
      >
        <span class="text-row min-w-0 truncate font-bold">{{ line.accountName }}</span>
        <span class="font-display text-figure-row text-end font-semibold tabular-nums">
          {{ line.value }}
        </span>
        <span class="text-muted text-meta min-w-0 font-bold tabular-nums">
          {{ line.units }} títulos · puesto {{ line.invested }}
        </span>
        <span class="text-meta text-end font-extrabold tabular-nums" :class="TONE_TEXT[line.tone]">
          {{ line.gain }}
          <span v-if="line.ret">{{ line.ret }}</span>
        </span>
        <span
          v-if="line.estimated"
          class="text-muted text-meta col-span-2 font-bold"
          :title="note ?? undefined"
        >
          Sin cotización
        </span>
      </li>
      <li
        v-if="total"
        class="border-line grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t py-2.5"
        data-instrument-total
      >
        <span class="text-row font-extrabold">Total</span>
        <span class="font-display text-figure-row text-end font-semibold tabular-nums">
          {{ total.value }}
        </span>
        <span class="text-muted text-meta min-w-0 font-bold tabular-nums">
          {{ total.units }} títulos · puesto {{ total.invested }}
        </span>
        <span class="text-meta text-end font-extrabold tabular-nums" :class="TONE_TEXT[total.tone]">
          {{ total.gain }}
          <span v-if="total.ret">{{ total.ret }}</span>
        </span>
      </li>
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
        <li
          v-for="line in positions"
          :key="line.accountId"
          class="border-line grid items-center border-t py-3.5"
          :class="COLUMNS"
          :data-instrument-position="line.accountId"
        >
          <span class="grid min-w-0 gap-px">
            <span class="text-row truncate font-bold">{{ line.accountName }}</span>
            <span
              v-if="line.estimated"
              class="text-muted text-meta font-bold"
              :title="note ?? undefined"
            >
              Sin cotización
            </span>
          </span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{ line.units }}</span>
          <span class="font-display text-figure-row text-end font-semibold tabular-nums">
            {{ line.value }}
          </span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{
            line.invested
          }}</span>
          <span
            class="flex flex-col items-end gap-px text-end tabular-nums"
            :class="TONE_TEXT[line.tone]"
          >
            <span class="text-note font-semibold">{{ line.gain }}</span>
            <span v-if="line.ret" class="text-meta font-extrabold">{{ line.ret }}</span>
          </span>
        </li>
        <li
          v-if="total"
          class="border-line grid items-center border-t py-3.5"
          :class="COLUMNS"
          data-instrument-total
        >
          <span class="text-row font-extrabold">Total</span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{ total.units }}</span>
          <span class="font-display text-figure-row text-end font-semibold tabular-nums">
            {{ total.value }}
          </span>
          <span class="text-soft text-note text-end font-bold tabular-nums">{{
            total.invested
          }}</span>
          <span
            class="flex flex-col items-end gap-px text-end tabular-nums"
            :class="TONE_TEXT[total.tone]"
          >
            <span class="text-note font-semibold">{{ total.gain }}</span>
            <span v-if="total.ret" class="text-meta font-extrabold">{{ total.ret }}</span>
          </span>
        </li>
      </ul>
    </template>
  </section>
</template>
