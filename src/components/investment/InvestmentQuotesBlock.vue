<script setup lang="ts">
import { computed } from 'vue'

import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import StatusDot from '../ui/StatusDot.vue'
import { TONE_TEXT, toneOf } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { QUOTE_STATUS } from '../../domain/investment/quote-status'
import type { InstrumentValuation } from '../../domain/investment/valuation'
import { formatPercent, formatQuotePrice } from '../../lib/format'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMarketStore } from '../../stores/market'

// "03 Cotizaciones": market price, today's change and status per instrument,
// with the held units editable in place. Hidden while no instrument is set up.
const marketStore = useMarketStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()

const signedPercent = (value: number) => formatPercent(value, { signed: true })
const dailyChange = computed(() => marketStore.valuation.dailyChangePercent)
const quotes = computed(() => marketStore.valuation.instruments)
const assetNameById = computed(
  () => new Map(financialStateStore.investmentAssets.map((asset) => [asset.id, asset.name])),
)
const columns: LedgerColumn<InstrumentValuation>[] = [
  { key: 'instrument', label: 'Instrumento', rowHeader: true },
  { key: 'units', label: 'Títulos', align: 'right' },
  { key: 'price', label: 'Precio', align: 'right' },
  { key: 'day', label: 'Hoy', align: 'right', hideBelow: 'sm' },
  { key: 'value', label: 'Valor', align: 'right' },
  { key: 'status', label: 'Estado', hideBelow: 'md' },
]
</script>

<template>
  <NumberedBlock
    v-if="quotes.length"
    number="03"
    title="Cotizaciones"
    title-id="inv-mkt-title"
    description="Precio orientativo; no sustituye a los snapshots confirmados. Corrige los títulos si no cuadran."
    data-investment-quotes
  >
    <template #actions>
      <div class="grid justify-items-end gap-1">
        <p class="font-display text-xl font-medium tabular-nums">
          {{ formatMoney(marketStore.valuation.totalValue) }}
        </p>
        <p
          v-if="dailyChange !== null"
          class="font-display text-sm tabular-nums"
          :class="TONE_TEXT[toneOf(dailyChange)]"
        >
          {{ signedPercent(dailyChange) }} hoy
        </p>
      </div>
    </template>

    <p v-if="marketStore.isLoading" class="text-text-muted text-sm" role="status">
      Actualizando cotizaciones…
    </p>
    <p v-else-if="marketStore.errorMessage" class="text-loss text-sm" role="alert">
      {{ marketStore.errorMessage }}. Se conserva el último dato válido si existe.
    </p>

    <LedgerTable
      :columns="columns"
      :rows="quotes"
      :row-key="(row) => row.instrument.id"
      :row-attrs="(row) => ({ 'data-quote': row.instrument.id })"
      label="Cotizaciones de cartera"
      empty-text="Aún no hay instrumentos. Añádelos a un activo en Configuración para seguir su cotización."
    >
      <template #cell-instrument="{ row }">
        <span class="grid gap-0.5">
          <span class="font-mono font-medium">{{ row.instrument.symbol }}</span>
          <span class="text-text-muted text-sm">
            {{
              assetNameById.get(row.instrument.investmentAssetId) ||
              row.instrument.type.toUpperCase()
            }}
          </span>
        </span>
      </template>
      <template #cell-units="{ row }">
        <label class="sr-only" :for="`investment-holdings-${row.instrument.id}`">
          Títulos de {{ row.instrument.symbol }}
        </label>
        <input
          :id="`investment-holdings-${row.instrument.id}`"
          :value="row.units"
          type="number"
          min="0"
          step="0.00000001"
          class="font-display text-text-main hover:border-line-strong focus:border-primary focus:ring-primary/20 h-10 w-24 rounded-sm border border-transparent bg-transparent px-2.5 text-right text-sm tabular-nums focus:ring-3 focus:outline-none sm:w-32"
          @change="
            marketStore.updateCurrentUnits(
              row.instrument.id,
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </template>
      <template #cell-price="{ row }">
        <span class="font-display tabular-nums">
          {{ row.quote ? formatQuotePrice(row.quote.price, row.quote.currency) : '—' }}
        </span>
      </template>
      <template #cell-day="{ row }">
        <span
          class="font-display tabular-nums"
          :class="
            row.dailyChangePercent === null
              ? 'text-text-muted'
              : TONE_TEXT[toneOf(row.dailyChangePercent)]
          "
        >
          {{ row.dailyChangePercent === null ? '—' : signedPercent(row.dailyChangePercent) }}
        </span>
      </template>
      <template #cell-value="{ row }">
        <span class="font-display font-medium tabular-nums">{{ formatMoney(row.value) }}</span>
      </template>
      <template #cell-status="{ row }">
        <StatusDot
          class="text-text-muted text-sm"
          :tone="QUOTE_STATUS[row.status].tone"
          :label="QUOTE_STATUS[row.status].label"
        />
      </template>
    </LedgerTable>
  </NumberedBlock>
</template>
