<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailHeader from '../../ui/NeonDetailHeader.vue'
import { type AssetDetail } from './asset-view-model'
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

const gradientId = `asset-area-${useId()}`
const ICONS = {
  buy: 'M12 5v14M6 13l6 6 6-6',
  sell: 'M12 19V5M6 11l6-6 6 6',
  other: 'M12 5v14M5 12h14',
}

// The chart rests on today's point; moving over it (or the arrow keys) reads
// another one.
const hot = ref<number | null>(null)
const points = computed(() => props.detail.chart?.points ?? [])
const current = computed(() => hot.value ?? points.value.length - 1)
const reading = computed(() => points.value[current.value])

function nearest(event: PointerEvent): number {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const share = ((event.clientX - box.left) / box.width) * 100
  let best = 0
  points.value.forEach((point, index) => {
    if (Math.abs(point.left - share) < Math.abs(points.value[best].left - share)) best = index
  })
  return best
}

function onPointer(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return
  hot.value = nearest(event)
}

function onKey(event: KeyboardEvent): void {
  const last = points.value.length - 1
  let next: number | null = null
  if (event.key === 'ArrowLeft') next = Math.max(0, current.value - 1)
  else if (event.key === 'ArrowRight') next = Math.min(last, current.value + 1)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = last
  else if (event.key === 'Escape') hot.value = null
  if (next === null) return
  event.preventDefault()
  hot.value = next
}

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
          <div
            class="outline-accent relative min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
            tabindex="0"
            role="group"
            aria-roledescription="gráfica interactiva"
            aria-label="Gráfica del precio. Flechas izquierda y derecha para recorrer las operaciones, Escape para volver a hoy."
            data-asset-chart
            @keydown="onKey"
            @blur="hot = null"
          >
            <svg
              :viewBox="detail.chart.viewBox"
              width="100%"
              role="img"
              :aria-label="detail.chart.label"
              class="block h-auto overflow-visible"
            >
              <defs>
                <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="var(--color-accent)" stop-opacity="0.42" />
                  <stop offset="0.55" stop-color="var(--color-accent)" stop-opacity="0.14" />
                  <stop offset="1" stop-color="var(--color-accent)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path
                v-if="detail.chart.average"
                :d="detail.chart.average.d"
                fill="none"
                stroke="var(--color-faint)"
                stroke-width="1"
                stroke-dasharray="4 4"
              />
              <path :d="detail.chart.area" :fill="`url(#${gradientId})`" stroke="none" />
              <path
                :d="detail.chart.line"
                fill="none"
                stroke="var(--color-accent)"
                stroke-width="2.5"
                stroke-linejoin="round"
                stroke-linecap="round"
                vector-effect="non-scaling-stroke"
              />
              <template v-for="(point, index) in points" :key="index">
                <circle
                  v-if="point.operation"
                  :cx="point.x"
                  :cy="point.y"
                  r="5.5"
                  :fill="point.operation === 'sell' ? 'var(--color-bg)' : 'var(--color-text)'"
                  :stroke="point.declared ? 'var(--color-text)' : 'var(--color-accent)'"
                  :stroke-width="point.declared ? 2 : 3"
                />
              </template>
              <circle
                v-if="hot === null"
                :cx="reading.x"
                :cy="reading.y"
                r="5.5"
                fill="var(--color-text)"
                stroke="var(--color-bg)"
                stroke-width="2.5"
              />
              <circle
                v-else
                :cx="reading.x"
                :cy="reading.y"
                r="6"
                fill="var(--color-bg)"
                stroke="var(--color-text)"
                stroke-width="2.5"
              />
            </svg>
            <span
              v-if="detail.chart.average"
              class="text-muted pointer-events-none absolute inset-s-2 -translate-y-full pb-1.5 text-xs font-bold"
              :style="{ insetBlockStart: `${detail.chart.average.top}%` }"
              aria-hidden="true"
            >
              Tu precio medio
            </span>
            <span
              v-for="tick in detail.chart.ticks"
              :key="tick.left"
              class="text-muted pointer-events-none absolute inset-bs-[97%] -translate-x-1/2 -translate-y-1/2 text-xs leading-none font-bold"
              :style="{ insetInlineStart: `${tick.left}%` }"
              aria-hidden="true"
            >
              {{ tick.text }}
            </span>
            <div
              class="absolute inset-0 cursor-crosshair"
              aria-hidden="true"
              @pointermove="onPointer"
              @pointerleave="hot = null"
            ></div>
          </div>
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
              <path :d="ICONS.buy" />
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
              <path :d="ICONS.sell" />
            </svg>
          </button>
        </div>
        <NeonButton v-if="detail.undeclared.length" @click="emit('declareAll')">
          Marcar todas como declaradas
        </NeonButton>
      </div>

      <p v-if="!detail.years.length" class="text-muted text-note m-0">
        Aún no hay operaciones apuntadas.
      </p>
      <div v-for="year in detail.years" :key="year.year" class="grid gap-1" data-asset-year>
        <div class="mt-3.5 flex items-baseline justify-between gap-x-5 gap-y-0.5">
          <h3 class="text-muted text-label tracking-label m-0 flex-none font-extrabold uppercase">
            {{ year.year }}
          </h3>
          <span class="text-muted text-meta min-w-0 truncate font-bold tabular-nums">
            {{ year.sum }}
          </span>
        </div>
        <ul class="m-0 list-none p-0">
          <li
            v-for="row in year.rows"
            :key="row.id"
            class="border-line grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 border-t py-2.5 [grid-template-areas:'i_o_t'_'i_d_q'_'i_f_q']"
            :data-asset-movement="row.id"
          >
            <span
              class="flex items-center self-center [grid-area:i]"
              :class="row.side === 'sell' ? 'text-soft' : 'text-text'"
              aria-hidden="true"
            >
              <svg
                class="size-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path :d="ICONS[row.side ?? 'other']" />
              </svg>
            </span>
            <span
              class="text-note min-w-0 truncate font-bold [grid-area:o]"
              :class="row.side === 'sell' ? 'text-soft' : 'text-text'"
            >
              {{ row.operation }}
            </span>
            <span
              class="text-muted text-note font-bold whitespace-nowrap tabular-nums [grid-area:d]"
            >
              {{ row.day }}
            </span>
            <span
              v-if="row.fee"
              class="text-muted text-meta whitespace-nowrap tabular-nums [grid-area:f]"
            >
              {{ row.fee }}
            </span>
            <span
              v-if="row.quantity"
              class="text-muted text-meta text-end font-bold whitespace-nowrap tabular-nums [grid-area:q]"
            >
              {{ row.quantity }}
            </span>
            <span
              class="font-display text-figure-row text-end font-semibold whitespace-nowrap tabular-nums [grid-area:t]"
            >
              {{ row.total }}
            </span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
