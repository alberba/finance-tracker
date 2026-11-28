<script setup lang="ts">
import { computed } from 'vue'

import { useMarketStore } from '../../../stores/market'
import NeonBarDetail from '../../ui/NeonBarDetail.vue'
import NeonDetailHeader from '../../ui/NeonDetailHeader.vue'
import type { InstrumentDetail } from './instrument-view-model'
import NeonInvestmentAssetYears from './NeonInvestmentAssetYears.vue'
import NeonInvestmentInstrumentPositions from './NeonInvestmentInstrumentPositions.vue'
import NeonInvestmentQuote from './NeonInvestmentQuote.vue'

// The detail of an instrument in Inversión (#561, ADR 0011), route
// `/inversion?instrumento=<id>`: its quote (the same chart as an account's
// single instrument), what is held of it in each account with the total, and
// its buys and sells by year. Desktop draws the detail header («‹ ETH») in the
// page and lays the three blocks as cards; the mobile frame (`touch`) puts the
// header in the top bar and stacks them. The arrow goes back to wherever the
// instrument was opened from (instrument route), not always to the cover.
const props = defineProps<{ detail: InstrumentDetail; touch?: boolean }>()

const emit = defineEmits<{ back: [] }>()

const marketStore = useMarketStore()
const instrument = computed(() =>
  marketStore.instruments.find((item) => item.id === props.detail.id),
)

const CARD =
  'bg-panel border-line rounded-card grid min-w-0 content-start gap-4 border px-7 pbs-6 pbe-5'

function onBack(event: MouseEvent): void {
  event.preventDefault()
  emit('back')
}
</script>

<template>
  <NeonBarDetail
    v-if="touch"
    :label="detail.symbol"
    back-href="/inversion"
    back-label="Inversión"
    title-id="investment-title"
    @back="onBack"
  />

  <div
    v-if="touch"
    class="-mt-[clamp(18px,2.6vw,36px)] grid min-w-0 content-start gap-[22px] pbs-4 pbe-24"
    data-investment-instrument
  >
    <section class="grid min-w-0 gap-2.5" aria-label="Cotización">
      <p
        class="font-display text-h1-detail tracking-h1 m-0 -mbe-2 leading-[1.15] font-bold"
        data-instrument-name
      >
        {{ detail.symbol }}
        <span class="text-muted text-note ms-1.5 font-bold">{{ detail.typeLabel }}</span>
      </p>
      <NeonInvestmentQuote v-if="instrument" :instrument="instrument" touch />
    </section>

    <NeonInvestmentInstrumentPositions
      :positions="detail.positions"
      :total="detail.total"
      :note="detail.unpricedNote"
      stacked
    />

    <section class="grid min-w-0 gap-3" aria-labelledby="instrument-movements-title">
      <h2
        id="instrument-movements-title"
        class="text-block-title m-0 flex items-baseline gap-3 font-extrabold"
      >
        Movimientos
        <span class="text-muted text-note font-bold" data-instrument-count>{{ detail.count }}</span>
      </h2>
      <NeonInvestmentAssetYears :years="detail.years" />
    </section>
  </div>

  <div v-else class="grid min-w-0 content-start gap-[22px]" data-investment-instrument>
    <NeonDetailHeader
      class="motion-safe:animate-rise"
      :label="detail.symbol"
      back-href="/inversion"
      back-label="Inversión"
      title-id="investment-title"
      @back="onBack"
    />

    <section
      v-if="instrument"
      :class="CARD"
      class="motion-safe:animate-rise motion-safe:[animation-delay:50ms]"
      aria-labelledby="instrument-quote-title"
    >
      <h2 id="instrument-quote-title" class="text-block-title m-0 font-extrabold">
        Cotización
        <span class="text-muted text-note ms-1.5 font-bold" data-instrument-name>
          {{ instrument.quoteSymbol || instrument.symbol }} · {{ detail.typeLabel }}
        </span>
      </h2>
      <NeonInvestmentQuote :instrument="instrument" />
    </section>

    <section :class="CARD" class="motion-safe:animate-rise motion-safe:[animation-delay:100ms]">
      <NeonInvestmentInstrumentPositions
        :positions="detail.positions"
        :total="detail.total"
        :note="detail.unpricedNote"
      />
    </section>

    <section
      :class="CARD"
      class="motion-safe:animate-rise motion-safe:[animation-delay:150ms]"
      aria-labelledby="instrument-movements-title"
    >
      <h2
        id="instrument-movements-title"
        class="text-block-title m-0 flex items-baseline gap-3 font-extrabold"
      >
        Movimientos
        <span class="text-muted text-note font-bold" data-instrument-count>{{ detail.count }}</span>
      </h2>
      <NeonInvestmentAssetYears :years="detail.years" />
    </section>
  </div>
</template>
