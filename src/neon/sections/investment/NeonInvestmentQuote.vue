<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import { useLiveQuotes } from '../../../composables/useLiveQuotes'
import {
  PRICE_RANGE_LABELS,
  priceRangesFor,
  type PriceHistory,
  type PriceRange,
} from '../../../domain/investment/price-history'
import { QUOTE_STATUS } from '../../../domain/investment/quote-status'
import { formatQuotePrice, formatShortDate, formatStamp } from '../../../lib/format'
import { runClientHttp } from '../../../lib/client/runtime'
import { fetchPriceHistory } from '../../../services/market-api'
import { useMarketStore } from '../../../stores/market'
import type { Instrument } from '../../../scripts/types'
import NeonLineChart from '../../ui/NeonLineChart.vue'
import { quoteLineChart, quoteRangeChange } from './quote-chart'

// The quote of the asset's symbol, the main chart of its detail (#524): the
// price, its change over the period, its time and state, and the chart from one
// day (every five minutes, about 15 minutes late) to five years. A fund has one
// price a day, so it starts at a week. `touch` is the mobile frame: a bigger
// price and a chart explored by holding a finger on it.
const props = withDefaults(defineProps<{ instrument: Instrument; touch?: boolean }>(), {
  touch: false,
})

const marketStore = useMarketStore()
useLiveQuotes()

const instrument = computed(() => props.instrument)
const valuation = computed(() =>
  marketStore.valuation.instruments.find((row) => row.instrument.id === instrument.value.id),
)
const quote = computed(() =>
  valuation.value?.status === 'unavailable' ? null : (valuation.value?.quote ?? null),
)
const status = computed(() => QUOTE_STATUS[valuation.value?.status ?? 'unavailable'])

const ranges = computed(() => priceRangesFor(instrument.value.type))
const range = shallowRef<PriceRange>('1d')
const history = shallowRef<PriceHistory | null>(null)
const loading = shallowRef(false)
const failed = shallowRef(false)
let request = 0

watch(
  () => [instrument.value, range.value] as const,
  async ([current, picked]) => {
    if (!priceRangesFor(current.type).includes(picked)) {
      range.value = priceRangesFor(current.type)[0]
      return
    }
    const id = ++request
    loading.value = true
    failed.value = false
    try {
      const loaded = await runClientHttp(fetchPriceHistory(current, picked))
      if (id === request) history.value = loaded
    } catch {
      if (id === request) failed.value = true
    } finally {
      if (id === request) loading.value = false
    }
  },
  { immediate: true },
)

const hovered = shallowRef<number | null>(null)
const chart = computed(() => (history.value ? quoteLineChart(history.value) : null))
const change = computed(() =>
  history.value ? quoteRangeChange(history.value, hovered.value ?? undefined) : null,
)
const shownPrice = computed(() => {
  const read = hovered.value === null ? null : chart.value?.readings[hovered.value]
  if (read) return read.value
  return quote.value ? formatQuotePrice(quote.value.price, quote.value.currency) : null
})
// The change follows the chart: over the session for 1D, over the period
// otherwise, and up to the point being read while the chart is explored.
const shownChange = computed(
  () => change.value && { ...change.value, text: `${change.value.text} ${periodWord.value}` },
)
const periodWord = computed(
  () =>
    ({
      '1d': 'hoy',
      '5d': 'en la semana',
      '1mo': 'en el mes',
      '6mo': 'en 6 meses',
      '1y': 'en el año',
      '5y': 'en 5 años',
    })[range.value],
)
const reading = computed(() =>
  hovered.value === null ? null : (chart.value?.readings[hovered.value]?.name ?? null),
)

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-soft' } as const
const TONE_PILL = {
  gain: 'text-gain bg-gain/12',
  warn: 'text-accent-text bg-accent/12',
  loss: 'text-loss bg-loss/12',
} as const
</script>

<template>
  <div class="grid min-w-0 gap-3" data-asset-quote>
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="grid min-w-0 gap-1" aria-live="polite">
        <p class="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
          <span
            class="font-display leading-[1.05] font-semibold"
            :class="
              touch
                ? 'basis-full text-[38px] tracking-[-0.02em]'
                : 'text-[clamp(1.5rem,3cqi,2.25rem)] tracking-[-0.03em]'
            "
            data-asset-quote-price
          >
            {{ shownPrice ?? '—' }}
          </span>
          <span v-if="shownChange" class="text-note font-bold" :class="TONE_TEXT[shownChange.tone]">
            {{ shownChange.text }}
          </span>
        </p>
        <p class="text-muted text-note m-0 font-bold tabular-nums">
          <template v-if="reading">{{ reading }}</template>
          <template v-else-if="quote?.dataType === 'eod'">
            Valor liquidativo del {{ formatShortDate(quote.timestamp.slice(0, 10)) }}
          </template>
          <template v-else-if="quote">Precio de {{ formatStamp(quote.timestamp) }}</template>
          <template v-else>Sin precio por ahora</template>
        </p>
      </div>
      <span
        class="rounded-pill px-2.5 py-0.5 text-[12px] font-extrabold"
        :class="TONE_PILL[status.tone]"
        data-asset-quote-status
      >
        {{ status.label }}
      </span>
    </div>

    <div
      class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
      :class="touch ? 'w-full' : 'w-fit'"
      role="group"
      aria-label="Periodo de la gráfica"
    >
      <button
        v-for="option in ranges"
        :key="option"
        type="button"
        :aria-pressed="range === option"
        class="rounded-pill outline-accent min-h-9 flex-1 px-3.5 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97] pointer-coarse:min-h-11"
        :class="
          range === option ? 'bg-sel-bg text-sel-text' : 'text-soft pointer-fine:hover:text-text'
        "
        @click="range = option"
      >
        {{ PRICE_RANGE_LABELS[option] }}
      </button>
    </div>

    <NeonLineChart
      v-if="chart?.line"
      v-model:active="hovered"
      :chart="chart"
      :compact="touch"
      :hold-to-explore="touch"
      tone="accent"
      :class="[touch ? 'min-h-56' : 'min-h-72', loading && 'opacity-50']"
    />
    <p
      v-else
      class="text-muted text-note m-0 content-center text-center font-semibold"
      :class="touch ? 'min-h-56' : 'min-h-72'"
    >
      {{
        loading
          ? 'Cargando la gráfica…'
          : failed
            ? 'No se pudo cargar la gráfica.'
            : 'Sin datos para este periodo.'
      }}
    </p>
  </div>
</template>
