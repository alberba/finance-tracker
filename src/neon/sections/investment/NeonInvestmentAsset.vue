<script setup lang="ts">
import { computed, ref } from 'vue'

import NeonDetailHeader from '../../ui/NeonDetailHeader.vue'
import { OPERATION_ICONS } from './asset-icons'
import { type AssetDetail } from './asset-view-model'
import NeonInvestmentAssetPositions from './NeonInvestmentAssetPositions.vue'
import NeonInvestmentAssetChart from './NeonInvestmentAssetChart.vue'
import NeonInvestmentAssetYears from './NeonInvestmentAssetYears.vue'
import NeonInvestmentQuote from './NeonInvestmentQuote.vue'
import { TONE_TEXT } from './view-model'
import { useMarketStore } from '../../../stores/market'

// The detail of an asset in Inversión (#439), desktop. The header is
// the detail header («‹ VWCE», DESIGN.md): the arrow and the symbol, nothing
// else. Under it two columns of cards: on the main one the price against the
// operations that were made (the chart reads with the mouse or the arrow keys)
// and the operations by year, with buying and selling; beside it, held in view
// while the list scrolls, the position: what it is worth, its result and its
// figures.
const props = defineProps<{ detail: AssetDetail }>()

const emit = defineEmits<{
  back: []
  buy: [event: MouseEvent]
  sell: [event: MouseEvent]
}>()

// The chart rests on today's point; moving over it (or the arrow keys) reads
// another one, and the line above it says which.
const hot = ref<number | null>(null)
const reading = computed(() => {
  const points = props.detail.chart?.points ?? []
  return points[hot.value ?? points.length - 1]
})

// An account that holds one instrument charts its quote; with several or none,
// the price of each operation against the average buy price. Each instrument's
// own quote is its own detail's business.
const marketStore = useMarketStore()
const instrument = computed(() => {
  const [only, ...others] = props.detail.positions
  return only && !others.length
    ? marketStore.instruments.find((item) => item.id === only.instrumentId)
    : undefined
})

const value = computed(() => props.detail.figures.find((figure) => figure.key === 'value'))
const result = computed(() => props.detail.figures.find((figure) => figure.key === 'result'))
const rest = computed(() =>
  props.detail.figures.filter((figure) => figure.key !== 'value' && figure.key !== 'result'),
)

const SIDES = [
  { value: 'buy', label: 'Comprar' },
  { value: 'sell', label: 'Vender' },
] as const

const CARD =
  'bg-panel border-line rounded-card grid min-w-0 content-start gap-4 border px-7 pbs-6 pbe-5'

function onBack(event: MouseEvent): void {
  event.preventDefault()
  emit('back')
}
</script>

<template>
  <div class="grid min-w-0 content-start gap-[22px]" data-investment-asset>
    <NeonDetailHeader
      class="motion-safe:animate-rise"
      :label="detail.name"
      back-href="/inversion"
      back-label="Inversión"
      title-id="investment-title"
      @back="onBack"
    />

    <div
      class="grid min-w-0 grid-cols-1 items-start gap-[22px] @4xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]"
    >
      <div class="grid min-w-0 gap-[22px]">
        <section
          v-if="detail.positions.length"
          :class="CARD"
          class="motion-safe:animate-rise motion-safe:[animation-delay:50ms]"
        >
          <NeonInvestmentAssetPositions :positions="detail.positions" :note="detail.unpricedNote" />
        </section>

        <section
          :class="CARD"
          class="motion-safe:animate-rise motion-safe:[animation-delay:75ms]"
          aria-labelledby="asset-chart-title"
        >
          <header class="flex items-baseline justify-between gap-3">
            <h2 id="asset-chart-title" class="text-block-title m-0 font-extrabold">
              <template v-if="instrument">
                Cotización
                <span class="text-muted text-note ms-1.5 font-bold">
                  {{ instrument.quoteSymbol || instrument.symbol }}
                </span>
              </template>
              <template v-else>Precio y tus operaciones</template>
            </h2>
            <span
              v-if="!instrument && detail.chart"
              class="text-muted inline-flex items-center gap-3.5 text-xs font-bold"
              aria-hidden="true"
            >
              <span class="inline-flex items-center gap-1.5">
                <span class="bg-text size-2.5 rounded-full"></span>
                Compra
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="border-text size-2.5 rounded-full border-2"></span>
                Venta
              </span>
            </span>
          </header>

          <NeonInvestmentQuote v-if="instrument" :instrument="instrument" />
          <template v-else-if="detail.chart && reading">
            <p
              class="m-0 flex min-h-[1.6em] flex-wrap items-baseline gap-x-3 gap-y-0.5 font-bold tabular-nums"
              aria-live="polite"
              data-asset-reading
            >
              <span
                class="font-display text-[clamp(1.5rem,3cqi,2.25rem)] leading-[1.05] font-semibold tracking-[-0.03em]"
              >
                {{ reading.price }}
              </span>
              <span class="text-muted text-note">{{ reading.date }}</span>
              <span class="text-note" :class="TONE_TEXT[reading.deltaTone]">
                {{ reading.delta }}
              </span>
              <span v-if="reading.note" class="text-muted text-note">{{ reading.note }}</span>
            </p>
            <NeonInvestmentAssetChart v-model:hot="hot" :chart="detail.chart" />
          </template>
          <p v-else class="text-muted text-note m-0">
            Aún no hay operaciones con precio para dibujar la gráfica.
          </p>
        </section>

        <section
          :class="CARD"
          class="motion-safe:animate-rise motion-safe:[animation-delay:100ms]"
          aria-labelledby="asset-movements-title"
        >
          <header class="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5">
            <h2
              id="asset-movements-title"
              class="text-block-title m-0 flex items-baseline gap-3 font-extrabold"
            >
              Movimientos
              <span class="text-muted text-note font-bold" data-asset-count>
                {{ detail.count }}
              </span>
            </h2>
            <div class="flex items-center gap-2">
              <button
                v-for="side in SIDES"
                :key="side.value"
                type="button"
                class="rounded-pill inline-flex min-h-11 items-center gap-2 ps-3.5 pe-[18px] text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.97]"
                :class="
                  side.value === 'buy'
                    ? 'bg-accent text-on-accent outline-text'
                    : 'bg-panel2 text-text outline-accent'
                "
                @click="side.value === 'buy' ? emit('buy', $event) : emit('sell', $event)"
              >
                <svg
                  class="size-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path :d="OPERATION_ICONS[side.value]" />
                </svg>
                {{ side.label }}
              </button>
            </div>
          </header>

          <NeonInvestmentAssetYears :years="detail.years" />
        </section>
      </div>

      <section
        :class="CARD"
        class="motion-safe:animate-rise motion-safe:[animation-delay:150ms] @4xl:sticky @4xl:top-6"
        aria-labelledby="asset-position-title"
        data-asset-figures
      >
        <h2 id="asset-position-title" class="text-block-title m-0 font-extrabold" data-asset-name>
          {{ detail.name }}
        </h2>

        <div v-if="value" class="grid gap-1" data-asset-figure="value">
          <span class="text-muted text-meta font-bold">{{ value.label }}</span>
          <span
            class="font-display text-[clamp(1.75rem,3.4cqi,2.75rem)] leading-[1.05] font-semibold tracking-[-0.035em] whitespace-nowrap tabular-nums"
          >
            {{ value.value }}
          </span>
          <span
            v-if="result"
            class="font-display flex flex-wrap items-baseline gap-x-2.5 text-[15px] font-semibold tabular-nums"
            :class="TONE_TEXT[result.tone]"
            data-asset-figure="result"
          >
            {{ result.value }}
            <span v-if="result.note">{{ result.note }}</span>
          </span>
        </div>

        <dl class="m-0 grid" data-asset-facts>
          <div
            v-for="figure in rest"
            :key="figure.key"
            class="border-line flex items-baseline justify-between gap-3 border-t py-2.5"
            :data-asset-figure="figure.key"
          >
            <dt class="text-soft text-row font-bold">{{ figure.label }}</dt>
            <dd
              class="font-display text-figure-row m-0 font-semibold whitespace-nowrap tabular-nums"
            >
              {{ figure.value }}
            </dd>
          </div>
          <div
            v-for="fact in detail.facts"
            :key="fact.label"
            class="border-line flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t py-2.5"
          >
            <dt class="text-soft text-row font-bold">{{ fact.label }}</dt>
            <dd class="m-0 grid min-w-0 justify-items-end gap-px">
              <span
                class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
              >
                {{ fact.value }}
              </span>
              <span
                v-if="fact.note"
                class="text-note font-extrabold tabular-nums"
                :class="TONE_TEXT[fact.tone]"
              >
                {{ fact.note }}
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>
