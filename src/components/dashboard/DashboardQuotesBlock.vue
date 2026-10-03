<script setup lang="ts">
import { computed } from 'vue'

import DashboardBlock from './DashboardBlock.vue'
import BaseButton from '../ui/BaseButton.vue'
import StatusDot from '../ui/StatusDot.vue'
import { TONE_TEXT, toneOf } from '../ui/tone'
import { useLiveQuotes } from '../../composables/useLiveQuotes'
import { QUOTE_STATUS, summarizeQuoteStatus } from '../../domain/investment/quote-status'
import { formatPercent, formatQuotePrice } from '../../lib/format'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMarketStore } from '../../stores/market'

// 06 · MERCADO: up to four quotes as cards, with the day's change and a
// «Retrasado» note only when a quote is late. Holdings are edited in
// Patrimonio.
const QUOTE_LIMIT = 4

const marketStore = useMarketStore()
const financialStateStore = useFinancialStateStore()
useLiveQuotes()

const rows = computed(() => marketStore.valuation.instruments.slice(0, QUOTE_LIMIT))
const assetNames = computed(
  () => new Map(financialStateStore.investmentAssets.map((asset) => [asset.id, asset.name])),
)
const updatedAt = computed(() => {
  const summary = summarizeQuoteStatus(marketStore.valuation.instruments)
  if (!summary) return ''
  const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(summary.latest),
  )
  return `Actualizado a las ${time}`
})
</script>

<template>
  <DashboardBlock
    kicker="06 · MERCADO"
    title="Cotizaciones"
    title-id="dashboard-quotes-title"
    :description="updatedAt || undefined"
    data-dashboard-quotes
  >
    <template #actions>
      <BaseButton
        variant="ghost"
        :disabled="marketStore.isLoading || !rows.length"
        @click="marketStore.refreshQuotes(true)"
      >
        <svg
          class="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 5v6h-6" />
        </svg>
        Actualizar
      </BaseButton>
    </template>
    <p v-if="marketStore.errorMessage" class="text-loss text-sm" role="alert">
      {{ marketStore.errorMessage }}. Se conserva el último dato válido si existe.
    </p>
    <p v-if="!rows.length" class="text-text-muted text-sm">
      Configura un instrumento en Configuración para ver sus cotizaciones.
    </p>
    <ul v-else class="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
      <li
        v-for="row in rows"
        :key="row.instrument.id"
        class="border-line grid content-start gap-1.5 rounded-md border px-3.5 py-3 sm:gap-2.5 sm:px-4.5 sm:py-4"
        :data-quote="row.instrument.symbol"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-text-main font-mono text-sm font-medium">
            {{ row.instrument.symbol }}
          </span>
          <span
            v-if="row.dailyChangePercent !== null"
            class="font-display text-sm font-semibold tabular-nums"
            :class="TONE_TEXT[toneOf(row.dailyChangePercent)]"
          >
            {{ formatPercent(row.dailyChangePercent, { signed: true }) }}
          </span>
        </div>
        <span class="font-display text-text-main text-base font-medium tabular-nums sm:text-xl">
          {{ row.quote ? formatQuotePrice(row.quote.price, row.quote.currency) : '—' }}
        </span>
        <div class="flex items-center justify-between gap-2 text-sm">
          <span class="text-text-muted hidden truncate sm:inline">
            {{ assetNames.get(row.instrument.investmentAssetId) || row.instrument.type.toUpperCase() }}
          </span>
          <StatusDot
            v-if="row.status === 'stale'"
            class="text-text-main shrink-0 font-bold"
            tone="warn"
            :label="QUOTE_STATUS.stale.label"
          />
        </div>
      </li>
    </ul>
  </DashboardBlock>
</template>
