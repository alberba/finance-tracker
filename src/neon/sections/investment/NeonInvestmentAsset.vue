<script setup lang="ts">
import { computed, ref } from 'vue'

import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailHeader from '../../ui/NeonDetailHeader.vue'
import { OPERATION_ICONS } from './asset-icons'
import { type AssetDetail } from './asset-view-model'
import NeonInvestmentAssetChart from './NeonInvestmentAssetChart.vue'
import NeonInvestmentAssetYears from './NeonInvestmentAssetYears.vue'
import { TONE_TEXT } from './view-model'

// The detail of an asset in the new Inversión (artboard «Inversión · detalle de
// activo (VWCE) · 2560 px», #439), desktop. The header is the detail header
// («‹ VWCE», DESIGN.md): the arrow and the symbol, nothing else. Under it, what
// the asset is worth, its price against the operations that were made (the
// chart reads with the mouse or the arrow keys), a few figures and the
// operations by year.
const props = defineProps<{ detail: AssetDetail }>()

const emit = defineEmits<{
  back: []
  buy: []
  sell: []
  declareAll: []
}>()

// The chart rests on today's point; moving over it (or the arrow keys) reads
// another one, and the line above it says which.
const hot = ref<number | null>(null)
const reading = computed(() => {
  const points = props.detail.chart?.points ?? []
  return points[hot.value ?? points.length - 1]
})

function onBack(event: MouseEvent): void {
  event.preventDefault()
  emit('back')
}
</script>

<template>
  <div class="grid min-w-0 content-start gap-[26px]" data-investment-asset>
    <NeonDetailHeader
      :label="detail.symbol"
      back-href="/inversion"
      back-label="Inversión"
      title-id="investment-title"
      @back="onBack"
    />

    <div
      role="group"
      aria-label="Resumen del activo"
      class="grid min-w-0 grid-cols-4 gap-y-[18px]"
      data-asset-figures
    >
      <div
        v-for="(figure, index) in detail.figures"
        :key="figure.key"
        class="grid min-w-0 content-start gap-1 px-5"
        :class="index ? 'border-line border-s' : 'ps-0'"
        :data-asset-figure="figure.key"
      >
        <span class="text-muted text-label tracking-label font-extrabold uppercase">
          {{ figure.label }}
        </span>
        <span
          class="font-display truncate text-[clamp(24px,2.4cqi,34px)] leading-[1.1] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums"
          :class="TONE_TEXT[figure.tone]"
        >
          {{ figure.value }}
        </span>
      </div>
    </div>

    <div
      class="grid min-w-0 grid-cols-1 items-start gap-x-14 gap-y-8 @4xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]"
    >
      <section class="grid min-w-0 gap-2.5" aria-labelledby="asset-chart-title">
        <h2
          id="asset-chart-title"
          class="text-block-title m-0 flex items-baseline justify-between gap-3 font-extrabold"
        >
          Precio y tus operaciones
          <span
            v-if="detail.chart"
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
        </h2>
        <p
          class="font-display text-figure-block m-0 leading-[1.15] font-bold tracking-[-0.03em]"
          data-asset-name
        >
          {{ detail.name }}
        </p>

        <template v-if="detail.chart && reading">
          <p
            class="text-muted text-note m-0 flex min-h-[1.6em] flex-wrap items-baseline gap-x-3.5 gap-y-0.5 font-bold tabular-nums"
            aria-live="polite"
            data-asset-reading
          >
            <span class="text-text font-extrabold">{{ reading.date }}</span>
            <span class="font-display text-figure-block text-text font-semibold tracking-[-0.02em]">
              {{ reading.price }}
            </span>
            <span :class="TONE_TEXT[reading.deltaTone]">{{ reading.delta }}</span>
            <span v-if="reading.note">{{ reading.note }}</span>
          </p>
          <NeonInvestmentAssetChart v-model:hot="hot" :chart="detail.chart" />
        </template>
        <p v-else class="text-muted text-note m-0">
          Aún no hay operaciones con precio para dibujar la gráfica.
        </p>
      </section>

      <section class="grid min-w-0 content-start gap-1.5" aria-labelledby="asset-facts-title">
        <h2 id="asset-facts-title" class="text-block-title m-0 mb-2 font-extrabold">En cifras</h2>
        <ul class="m-0 list-none p-0" data-asset-facts>
          <li
            v-for="fact in detail.facts"
            :key="fact.label"
            class="border-line flex items-baseline justify-between gap-3 border-t py-2.5"
          >
            <span class="text-soft text-row font-bold">{{ fact.label }}</span>
            <span class="grid min-w-0 justify-items-end gap-px">
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
            </span>
          </li>
        </ul>
      </section>
    </div>

    <section class="grid min-w-0 gap-1.5" aria-labelledby="asset-movements-title">
      <div class="mb-1.5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5">
        <h2
          id="asset-movements-title"
          class="text-block-title m-0 flex items-baseline gap-3.5 font-extrabold"
        >
          Movimientos
          <span class="text-muted text-note font-bold" data-asset-count>{{ detail.count }}</span>
        </h2>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="bg-accent text-on-accent outline-text inline-grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.97]"
            aria-label="Comprar"
            @click="emit('buy')"
          >
            <svg
              class="size-[22px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="OPERATION_ICONS.buy" />
            </svg>
          </button>
          <button
            type="button"
            class="bg-panel2 text-text outline-accent inline-grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.97]"
            aria-label="Vender"
            @click="emit('sell')"
          >
            <svg
              class="size-[22px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="OPERATION_ICONS.sell" />
            </svg>
          </button>
        </div>
        <NeonButton v-if="detail.undeclared.length" @click="emit('declareAll')">
          Marcar todas como declaradas
        </NeonButton>
      </div>

      <NeonInvestmentAssetYears :years="detail.years" />
    </section>
  </div>
</template>
