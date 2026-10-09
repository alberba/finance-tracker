<script setup lang="ts">
import { computed } from 'vue'

import type { SnapshotTotals, WealthMonthViewModel } from '../../domain/wealth/view-model'
import { splitDecimals } from '../../lib/format'
import { GROUP_SWATCH } from './group-swatch'

// The ink band of Patrimonio: the snapshot total of the chosen month with its
// state, how it adds up, and the strip of months that replaces a month picker
// (filled dot: saved snapshot; ring: only the calculated balance).
const props = defineProps<{
  totals: SnapshotTotals
  months: WealthMonthViewModel[]
  monthName: string
  status: { saved: boolean; text: string }
  formatMoney: (value: number) => string
}>()

const month = defineModel<number>('month', { required: true })

const parts = computed(() => splitDecimals(props.formatMoney(props.totals.net)))
const facts = computed(() => [
  { kind: 'accounts' as const, label: 'Liquidez', value: props.totals.accounts, op: '' },
  { kind: 'investments' as const, label: 'Inversión', value: props.totals.investments, op: '+' },
  { kind: 'liabilities' as const, label: 'Deuda', value: props.totals.liabilities, op: '−' },
])

function monthAria(entry: WealthMonthViewModel): string {
  if (!entry.available) return `${entry.name}, aún no`
  return `${entry.name}, ${entry.saved ? 'snapshot guardado' : 'sin guardar'}`
}
</script>

<template>
  <section
    class="bg-ink border-ink-line text-ink-text grid overflow-hidden rounded-lg border"
    aria-labelledby="wealth-total-title"
    data-wealth-band
  >
    <div
      class="grid gap-6 px-5 py-6 sm:px-9 sm:pt-8 sm:pb-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end lg:gap-10"
    >
      <div class="grid gap-2.5">
        <h3 id="wealth-total-title" class="text-ink-muted text-[0.9375rem] font-semibold">
          Total del snapshot de {{ monthName }}
        </h3>
        <p
          id="wealth-total"
          class="font-display text-5xl leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums lg:text-6xl"
        >
          {{ parts.whole }}<span class="text-ink-muted text-2xl lg:text-3xl">{{ parts.rest }}</span>
        </p>
        <p class="text-ink-muted flex items-center gap-2 text-sm" data-wealth-status>
          <span
            class="size-2 shrink-0 rounded-full"
            :class="status.saved ? 'bg-ink-gain' : 'border-ink-muted border-[1.5px]'"
            aria-hidden="true"
          ></span>
          {{ status.text }}
        </p>
      </div>
      <dl
        aria-label="Cómo se compone"
        class="border-ink-text/10 grid grid-cols-3 gap-3 border-t pt-4 lg:flex lg:items-end lg:justify-end lg:gap-5 lg:border-t-0 lg:pt-0"
      >
        <template v-for="fact in facts" :key="fact.kind">
          <span
            v-if="fact.op"
            class="font-display text-ink-muted hidden pb-0.5 text-2xl lg:block"
            aria-hidden="true"
            >{{ fact.op }}</span
          >
          <div class="grid min-w-0 gap-1.5">
            <dt class="text-ink-muted flex items-center gap-2 text-xs sm:text-sm">
              <span
                class="size-2 shrink-0 rounded-xs"
                :class="GROUP_SWATCH[fact.kind]"
                aria-hidden="true"
              ></span>
              {{ fact.label }}
            </dt>
            <dd class="font-display m-0 text-sm font-medium tabular-nums sm:text-2xl">
              {{ formatMoney(fact.value) }}
            </dd>
          </div>
        </template>
      </dl>
    </div>

    <div class="border-ink-text/10 grid gap-2.5 border-t px-3 pt-4 pb-4 sm:px-7">
      <div class="text-ink-muted flex items-center justify-between gap-4 px-2 text-sm">
        <span>Mes del snapshot</span>
        <span class="flex items-center gap-4">
          <span class="flex items-center gap-1.5">
            <span class="bg-ink-gain size-2 rounded-full" aria-hidden="true"></span>Guardado
          </span>
          <span class="flex items-center gap-1.5">
            <span class="border-ink-muted size-2 rounded-full border-[1.5px]" aria-hidden="true"></span
            >Sin guardar
          </span>
        </span>
      </div>
      <div
        role="group"
        aria-label="Mes del snapshot"
        class="flex gap-1 overflow-x-auto lg:grid lg:grid-cols-12 lg:overflow-visible"
        data-wealth-months
      >
        <button
          v-for="entry in months"
          :key="entry.month"
          type="button"
          class="focus-visible:outline-ink-text flex min-h-12 min-w-14 shrink-0 items-center justify-center gap-2 rounded-b-md border-t-2 px-2 text-sm font-bold transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
          :class="
            entry.month === month
              ? 'border-ink-text bg-ink-text/10 text-ink-text'
              : 'text-ink-muted enabled:hover:bg-ink-text/10 border-transparent'
          "
          :aria-pressed="entry.month === month"
          :aria-label="monthAria(entry)"
          :disabled="!entry.available"
          :data-month="entry.month"
          @click="month = entry.month"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="
              entry.saved && entry.available
                ? 'bg-ink-gain'
                : entry.available
                  ? 'border-ink-muted border-[1.5px]'
                  : ''
            "
            aria-hidden="true"
          ></span>
          {{ entry.label }}
        </button>
      </div>
    </div>
  </section>
</template>
