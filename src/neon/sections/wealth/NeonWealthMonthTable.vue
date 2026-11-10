<script setup lang="ts">
import type { Month } from '../../../lib/month'
import type { SnapshotKind } from '../../../scripts/types'
import type { MonthTableRow, FigureTone } from './view-model'

// «Balance por meses»: every account at the close of each month, in whole
// euros. A month's header opens it in «Cerrar {mes}»; a filled dot marks a
// closed month.
defineProps<{
  table: {
    months: { month: Month; short: string; closed: boolean; aria: string }[]
    rows: MonthTableRow[]
  }
  month: Month
}>()
const emit = defineEmits<{ pick: [month: Month] }>()

const SWATCH: Record<SnapshotKind, string> = {
  accounts: 'bg-faint',
  investments: 'bg-lilac',
  liabilities: 'bg-peach',
}
const TONE_CLASS: Record<FigureTone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  muted: 'text-muted',
  plain: 'text-text',
}
</script>

<template>
  <section
    aria-labelledby="wealth-history-title"
    class="bg-panel border-line rounded-card flex min-w-0 flex-col border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4"
  >
    <h2 id="wealth-history-title" class="text-block-title font-extrabold">Balance por meses</h2>
    <p class="text-soft mt-3 text-[16px]">
      Saldo de cada cuenta al cierre de cada mes, en euros redondeados. Pulsa un mes para abrirlo.
    </p>
    <div class="mt-5 min-w-0 overflow-x-auto">
      <div
        role="table"
        aria-label="Saldo de cada cuenta por mes, en euros redondeados"
        class="grid min-w-max gap-x-1.5 [--wealth-label-col:148px] @min-[640px]:[--wealth-label-col:minmax(180px,2fr)]"
        :style="{
          gridTemplateColumns: `var(--wealth-label-col) repeat(${table.months.length}, minmax(56px, 1fr))`,
        }"
      >
        <div role="row" class="col-span-full grid grid-cols-subgrid items-end pb-1.5">
          <span
            role="columnheader"
            class="text-muted text-label tracking-label bg-panel sticky inset-s-0 z-[1] self-end font-extrabold uppercase"
            >Cuenta o activo</span
          >
          <span
            v-for="entry in table.months"
            :key="entry.month"
            role="columnheader"
            class="min-w-0"
          >
            <button
              type="button"
              :aria-pressed="entry.month === month"
              :aria-label="entry.aria"
              class="outline-accent text-note flex min-h-11 w-full items-center justify-end gap-1.5 border-b-2 px-0.5 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
              :class="
                entry.month === month ? 'border-accent text-text' : 'text-muted border-transparent'
              "
              @click="emit('pick', entry.month)"
            >
              <span
                class="size-2 flex-none rounded-full border-[1.5px]"
                :class="entry.closed ? 'border-text bg-text' : 'border-muted'"
                aria-hidden="true"
              ></span>
              {{ entry.short }}
            </button>
          </span>
        </div>
        <div
          v-for="row in table.rows"
          :key="row.key"
          role="row"
          class="col-span-full grid min-h-11 grid-cols-subgrid items-center"
          :class="
            row.kind === 'total'
              ? 'border-ctrl-line border-t'
              : row.kind === 'group'
                ? 'border-line border-t'
                : ''
          "
          :data-history-row="row.key"
        >
          <span
            role="rowheader"
            class="bg-panel sticky inset-s-0 z-[1] flex min-w-0 items-center gap-2.5 truncate text-[15px]"
            :class="row.kind === 'item' ? 'ps-[22px] font-semibold' : 'font-extrabold'"
          >
            <span
              v-if="row.kind === 'group' && row.group"
              class="size-2 flex-none rounded-[2px]"
              :class="SWATCH[row.group]"
              aria-hidden="true"
            ></span>
            {{ row.label }}
          </span>
          <span
            v-for="(cell, index) in row.cells"
            :key="index"
            role="cell"
            class="font-display text-end text-[15px] whitespace-nowrap tabular-nums"
            :class="[TONE_CLASS[cell.tone], row.kind === 'item' ? 'font-semibold' : 'font-bold']"
            >{{ cell.text }}</span
          >
        </div>
      </div>
    </div>
    <p class="text-muted text-meta mt-auto pt-4">
      Verde o rojo: el saldo sube o baja más de un 10 % y más de 300 € frente al mes anterior. En
      gris, los meses que aún no están cerrados.
    </p>
  </section>
</template>
