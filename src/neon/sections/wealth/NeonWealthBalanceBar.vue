<script setup lang="ts">
import { computed } from 'vue'

import { formatMoney } from '../../../lib/format'
import NeonFigure from '../../ui/NeonFigure.vue'
import type { MonthTotals } from './view-model'

// The balance of the cover drawn as one bar: cash and investment side by side
// make the assets, the debt is taken off its end (hatched) and a mark stands
// where the net worth lands. The legend under it reads as the sum and ends in
// «= Patrimonio».
const props = defineProps<{ totals: MonthTotals }>()

const bar = computed(() => {
  const cash = Math.max(props.totals.accounts, 0)
  const investment = Math.max(props.totals.investments, 0)
  const assets = cash + investment
  if (assets <= 0) return null
  const debt = Math.min(Math.max(props.totals.liabilities, 0) / assets, 1)
  return { cash, investment, debt: debt * 100, mark: (1 - debt) * 100 }
})

const label = computed(
  () =>
    `Activos ${formatMoney(props.totals.accounts + props.totals.investments)}; ` +
    `los pasivos restan ${formatMoney(props.totals.liabilities)}.`,
)
</script>

<template>
  <section
    aria-label="Balance del mes"
    class="border-line grid gap-3.5 border-y py-[22px]"
    data-wealth-equation
  >
    <div v-if="bar" role="img" :aria-label="label" class="relative flex h-3.5 gap-[3px]">
      <span
        v-if="bar.cash"
        class="bg-neutral-bar rounded-pill"
        :style="{ flex: `${bar.cash} 1 0` }"
      ></span>
      <span
        v-if="bar.investment"
        class="bg-soft rounded-pill"
        :style="{ flex: `${bar.investment} 1 0` }"
      ></span>
      <span
        v-if="bar.debt"
        class="border-loss rounded-pill absolute inset-y-[-5px] inset-e-0 border-[1.5px] border-dashed bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--color-loss)_35%,transparent)_0_3px,transparent_3px_7px)]"
        :style="{ inlineSize: `${bar.debt}%` }"
      ></span>
      <span
        class="border-text absolute inset-y-[-10px] border-s-2"
        :style="{ insetInlineStart: `${bar.mark}%` }"
      ></span>
    </div>

    <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <p class="text-muted flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <span class="whitespace-nowrap">
          <span
            class="bg-neutral-bar me-2 inline-block size-2.5 rounded-[3px]"
            aria-hidden="true"
          ></span
          >Efectivo
          <b class="font-display text-text font-semibold tabular-nums">{{
            formatMoney(totals.accounts)
          }}</b>
        </span>
        <span class="whitespace-nowrap">
          <span class="bg-soft me-2 inline-block size-2.5 rounded-[3px]" aria-hidden="true"></span
          ><span class="sr-only">más </span>Inversión
          <b class="font-display text-text font-semibold tabular-nums">{{
            formatMoney(totals.investments)
          }}</b>
        </span>
        <span class="whitespace-nowrap">
          <span
            class="border-loss me-2 inline-block size-2.5 rounded-[3px] border-[1.5px] border-dashed"
            aria-hidden="true"
          ></span
          ><span class="sr-only">menos </span>Pasivos
          <b class="font-display text-text font-semibold tabular-nums">{{
            formatMoney(totals.liabilities)
          }}</b>
        </span>
      </p>
      <p class="text-text flex items-baseline gap-3">
        <span class="font-display text-muted" aria-hidden="true">=</span>
        <span class="text-block-title font-extrabold">Patrimonio</span>
        <NeonFigure
          :value="formatMoney(totals.net)"
          class="text-[clamp(34px,3.4cqi,44px)] leading-none font-bold tracking-[-0.04em]"
          data-wealth-net
        />
      </p>
    </div>
  </section>
</template>
