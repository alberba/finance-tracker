<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import NeonBarDetail from '../../ui/NeonBarDetail.vue'
import { OPERATION_ICONS } from './asset-icons'
import { assetHref } from './asset-route'
import { type AssetDetail } from './asset-view-model'
import NeonInvestmentAssetPositions from './NeonInvestmentAssetPositions.vue'
import NeonInvestmentAssetChart from './NeonInvestmentAssetChart.vue'
import NeonInvestmentAssetYears from './NeonInvestmentAssetYears.vue'
import NeonInvestmentQuote from './NeonInvestmentQuote.vue'
import { TONE_TEXT } from './view-model'
import { useMarketStore } from '../../../stores/market'

// The detail of an asset in the mobile frame (artboard «Inversión · detalle de
// activo (VWCE) · móvil · Pixel 10», #440), from the same view model as the
// desktop one (NeonInvestmentAsset). The top bar keeps only «‹ VWCE». Two
// screens, each an entry of the history (asset-route):
//
// - The summary: the asset's name and its price, the chart edge to edge (read
//   with the finger, the mouse or the arrows), a button with the units held
//   that opens the movements, and «Tu posición» with a ring of its weight.
// - The movements: the units in big figures with «Comprar» and «Vender» under
//   them, and the operations by year in a sheet that runs down to the bottom
//   bar. There the arrow goes back to the summary.
const props = defineProps<{ detail: AssetDetail; movements: boolean }>()

const emit = defineEmits<{
  back: []
  openInstrument: [instrumentId: string]
  openMovements: []
  closeMovements: []
  buy: [event: MouseEvent]
  sell: [event: MouseEvent]
}>()

const RING = 2 * Math.PI * 45

// An account that holds one instrument charts its quote; with several or none,
// the price of each operation against the average buy price.
const marketStore = useMarketStore()
const instrument = computed(() => {
  const [only, ...others] = props.detail.positions
  return only && !others.length
    ? marketStore.instruments.find((item) => item.id === only.instrumentId)
    : undefined
})

// The chart rests on today's point; a finger on it (or the arrow keys) reads another.
const hot = ref<number | null>(null)
const reading = computed(() => {
  const points = props.detail.chart?.points ?? []
  return points[hot.value ?? points.length - 1]
})
watch(
  () => props.movements,
  () => (hot.value = null),
)

function onBack(event: MouseEvent): void {
  event.preventDefault()
  if (props.movements) emit('closeMovements')
  else emit('back')
}

// The page's own side padding: the chart and the sheet go over it, edge to edge.
const BLEED = '-mx-[clamp(16px,2.6vw,40px)]'
const ACTIONS = [
  { side: 'buy', label: 'Comprar' },
  { side: 'sell', label: 'Vender' },
] as const

const PRESS =
  'motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]'
</script>

<template>
  <NeonBarDetail
    :label="detail.name"
    :back-href="movements ? assetHref(detail.id) : '/inversion'"
    :back-label="movements ? detail.name : 'Inversión'"
    title-id="investment-title"
    @back="onBack"
  />

  <!-- Both screens are as tall as what is left between the bars, as on the
       cover: the page's top padding is taken back and its bottom one all but,
       so the frame's grid doesn't stretch the top bar. The movements' sheet
       runs down to the bottom bar. -->
  <div
    v-if="!movements"
    class="-mt-[clamp(18px,2.6vw,36px)] -mb-5 grid min-h-[calc(100dvh-144px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-w-0 content-start gap-[22px] pbs-4 pbe-24"
    data-investment-asset
    data-asset-summary
  >
    <section
      class="grid min-w-0 gap-2.5"
      :aria-label="instrument ? 'Cotización' : 'Precio y tus operaciones'"
    >
      <p
        class="font-display text-h1-detail tracking-h1 m-0 -mbe-2 leading-[1.15] font-bold"
        data-asset-name
      >
        {{ detail.name }}
      </p>

      <NeonInvestmentQuote v-if="instrument" :instrument="instrument" touch />
      <template v-else-if="detail.chart && reading">
        <p
          class="text-muted text-note m-0 flex min-h-[1.6em] flex-wrap items-baseline gap-x-3.5 gap-y-0.5 font-bold tabular-nums"
          aria-live="polite"
          data-asset-reading
        >
          <span
            class="font-display text-text basis-full text-[38px] leading-[1.1] font-semibold tracking-[-0.02em]"
          >
            {{ reading.price }}
          </span>
          <span :class="TONE_TEXT[reading.deltaTone]">{{ reading.delta }}</span>
          <span class="text-text order-2 font-extrabold">{{ reading.date }}</span>
        </p>
        <NeonInvestmentAssetChart v-model:hot="hot" :chart="detail.chart" touch :class="BLEED" />
      </template>
      <p v-else class="text-muted text-note m-0">
        Aún no hay operaciones con precio para dibujar la gráfica.
      </p>
    </section>

    <div class="flex px-2">
      <button
        type="button"
        class="bg-accent text-on-accent outline-text font-display rounded-pill text-note flex min-h-11 flex-auto items-center justify-center gap-2.5 px-[22px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
        :class="PRESS"
        :aria-label="`Ver tus movimientos: ${detail.count}`"
        data-asset-open-movements
        @click="emit('openMovements')"
      >
        {{ detail.units ? `${detail.units.count} ${detail.units.word}` : 'Movimientos' }}
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>

    <NeonInvestmentAssetPositions
      v-if="detail.positions.length"
      :positions="detail.positions"
      :note="detail.unpricedNote"
      stacked
      @open="emit('openInstrument', $event)"
    />

    <section class="grid min-w-0 gap-3" aria-labelledby="asset-position-title">
      <h2 id="asset-position-title" class="text-block-title m-0 font-extrabold">Tu posición</h2>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
        <ul class="m-0 list-none p-0" data-asset-position>
          <li
            v-for="row in detail.position.rows"
            :key="row.label"
            class="border-line flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-t py-2.5"
          >
            <span class="text-note font-bold">{{ row.label }}</span>
            <span
              class="font-display ms-auto text-xs font-semibold whitespace-nowrap tabular-nums"
              :class="TONE_TEXT[row.tone]"
            >
              {{ row.value }}
              <span v-if="row.note" class="font-sans font-extrabold">{{ row.note }}</span>
            </span>
          </li>
        </ul>
        <div
          role="img"
          :aria-label="detail.position.ring.label"
          class="relative size-32 flex-none"
          data-asset-ring
        >
          <svg viewBox="0 0 100 100" class="block size-full -rotate-90" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="var(--color-line)"
              stroke-width="6"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="var(--color-neutral-bar)"
              stroke-width="6"
              stroke-linecap="round"
              :stroke-dasharray="`${((detail.position.ring.share / 100) * RING).toFixed(1)} ${RING.toFixed(2)}`"
            />
          </svg>
          <span class="absolute inset-3.5 grid place-content-center gap-0.5 text-center">
            <span
              class="font-display text-meta font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums"
            >
              {{ detail.position.ring.value }}
            </span>
            <span class="text-muted text-xs font-bold">{{ detail.position.ring.weight }}</span>
          </span>
        </div>
      </div>
    </section>
  </div>

  <div
    v-else
    class="-mt-[clamp(18px,2.6vw,36px)] -mb-5 flex min-h-[calc(100dvh-144px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-w-0 flex-col"
    data-investment-asset
    data-asset-movements-screen
  >
    <div class="flex flex-col items-center gap-1.5 px-4 pbs-12 pbe-11 text-center">
      <span
        class="font-display text-[38px] leading-[1.05] font-bold tracking-[-0.035em] tabular-nums"
        data-asset-units
      >
        {{ detail.units?.count ?? detail.figures[0].value }}
      </span>
      <span class="text-muted text-label tracking-label font-extrabold uppercase">
        {{ detail.units?.word ?? detail.figures[0].label }}
      </span>
      <div class="mbs-[22px] flex justify-center gap-7">
        <button
          v-for="action in ACTIONS"
          :key="action.side"
          type="button"
          class="group outline-accent rounded-tile grid justify-items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-4"
          :class="PRESS"
          @click="action.side === 'buy' ? emit('buy', $event) : emit('sell', $event)"
        >
          <span
            class="grid size-16 place-items-center rounded-full"
            :class="action.side === 'buy' ? 'bg-accent text-on-accent' : 'bg-panel2 text-text'"
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="OPERATION_ICONS[action.side]" />
            </svg>
          </span>
          <span class="text-soft text-[13px] font-extrabold">{{ action.label }}</span>
        </button>
      </div>
    </div>

    <section
      class="bg-panel rounded-t-sheet shadow-sheet grid flex-1 content-start gap-1.5 px-4 pbs-5 pbe-24"
      :class="BLEED"
      aria-labelledby="asset-movements-title"
    >
      <div class="flex flex-wrap items-center justify-between gap-x-4">
        <h2
          id="asset-movements-title"
          class="text-block-title m-0 flex items-baseline gap-3 font-extrabold"
        >
          Movimientos
          <span class="text-muted text-note font-bold" data-asset-count>{{ detail.count }}</span>
        </h2>
      </div>
      <NeonInvestmentAssetYears :years="detail.years" />
    </section>
  </div>
</template>
