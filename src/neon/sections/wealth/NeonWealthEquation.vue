<script setup lang="ts">
import { formatMoney } from '../../../lib/format'
import type { MonthTotals } from './view-model'

// The balance equation (artboard: «una línea de texto, no un héroe»): cash
// plus investment minus debt equals net worth, with whether the month is
// closed at the end of the line.
defineProps<{
  totals: MonthTotals
  status: { closed: boolean; text: string }
}>()
</script>

<template>
  <section
    aria-label="Ecuación del balance"
    class="border-line text-muted flex flex-wrap items-baseline gap-x-3 gap-y-2 border-y py-4 text-[16px]"
    data-wealth-equation
  >
    <span class="whitespace-nowrap">
      Efectivo
      <b class="font-display text-text text-[16px] font-semibold tabular-nums">{{
        formatMoney(totals.accounts)
      }}</b>
    </span>
    <span class="whitespace-nowrap">
      <span class="font-display me-2" aria-hidden="true">+</span>Inversión
      <b class="font-display text-text text-[16px] font-semibold tabular-nums">{{
        formatMoney(totals.investments)
      }}</b>
    </span>
    <span class="whitespace-nowrap">
      <span class="font-display me-2" aria-hidden="true">−</span>Pasivos
      <b class="font-display text-text text-[16px] font-semibold tabular-nums">{{
        formatMoney(totals.liabilities)
      }}</b>
    </span>
    <span class="whitespace-nowrap">
      <span class="font-display me-2" aria-hidden="true">=</span>Patrimonio
      <b class="font-display text-text text-[22px] font-bold tabular-nums" data-wealth-net>{{
        formatMoney(totals.net)
      }}</b>
    </span>
    <span
      class="text-soft text-note ms-auto flex items-center gap-2 font-bold whitespace-nowrap"
      data-wealth-status
    >
      <span
        class="size-2 rounded-full border-[1.5px]"
        :class="status.closed ? 'border-text bg-text' : 'border-muted'"
        aria-hidden="true"
      ></span>
      {{ status.text }}
    </span>
  </section>
</template>
