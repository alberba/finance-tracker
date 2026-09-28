<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMarketStore } from '../../stores/market'

withDefaults(
  defineProps<{ title?: string }>(),
  { title: 'Valoración de mercado' },
)

const marketStore = useMarketStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()
const rows = computed(() => marketStore.valuation.instruments)
const totalValue = computed(() => marketStore.valuation.totalValue)
const dailyChange = computed(() => marketStore.valuation.dailyChangePercent)
const assetNameById = computed(() => new Map(financialStateStore.investmentAssets.map((asset) => [asset.id, asset.name])))

onMounted(() => {
  void marketStore.refreshQuotes()
})

watch(
  () => marketStore.instruments.map((instrument) => `${instrument.id}:${instrument.provider}:${instrument.symbol}:${instrument.currency}`).join('|'),
  (signature, previousSignature) => {
    if (signature && signature !== previousSignature) void marketStore.refreshQuotes(true)
  },
)

function formatQuote(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 6 }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function formatTimestamp(value: string): string {
  if (!value) return 'Sin actualización'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin actualización'
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
</script>

<template>
  <article v-if="marketStore.instruments.length" class="card" data-market-panel>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-primary font-mono text-[0.65rem] tracking-[0.18em] uppercase">Mercado</p>
        <h3 class="font-display text-text-main text-xl tracking-normal normal-case">{{ title }}</h3>
        <p class="text-text-muted text-sm">Precio orientativo; no sustituye snapshots confirmados.</p>
      </div>
      <div class="text-right">
        <strong class="block text-2xl">{{ formatMoney(totalValue) }}</strong>
        <span v-if="dailyChange !== null" :class="dailyChange >= 0 ? 'text-income' : 'text-expense'">
          {{ dailyChange >= 0 ? '+' : '' }}{{ dailyChange.toFixed(2) }}% hoy
        </span>
      </div>
    </div>

    <div v-if="marketStore.isLoading" class="mt-4 text-sm text-text-muted" role="status">
      Actualizando cotizaciones…
    </div>
    <p v-else-if="marketStore.errorMessage" class="mt-4 text-sm text-expense" role="alert">
      {{ marketStore.errorMessage }}. Se conserva el último dato válido si existe.
    </p>
    <p v-else-if="!rows.length" class="mt-4 rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-text-muted">
      Configura un instrumento en Configuración para ver su valoración.
    </p>

    <div v-else class="mt-4 overflow-x-auto">
      <table class="w-full text-left text-sm" aria-label="Cotizaciones de cartera">
        <thead class="text-text-muted text-xs uppercase">
          <tr>
            <th class="pb-2 pr-4">Instrumento</th>
            <th class="pb-2 pr-4">Títulos</th>
            <th class="pb-2 pr-4">Precio</th>
            <th class="pb-2 pr-4">Valor</th>
            <th class="pb-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.instrument.id" class="border-t border-[var(--line)]">
            <td class="py-3 pr-4">
              <strong>{{ row.instrument.symbol }}</strong>
              <small class="block text-text-muted">{{ assetNameById.get(row.instrument.investmentAssetId) || row.instrument.type.toUpperCase() }}</small>
            </td>
            <td class="py-3 pr-4">
              <label class="sr-only" :for="`market-holdings-${row.instrument.id}`">
                Títulos de {{ row.instrument.symbol }}
              </label>
              <input
                :id="`market-holdings-${row.instrument.id}`"
                :value="row.units"
                type="number"
                min="0"
                step="0.00000001"
                class="w-28 rounded-md border border-[var(--line)] bg-[var(--bg-card)] px-2 py-1 text-[var(--text-main)]"
                @change="marketStore.updateCurrentUnits(row.instrument.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="py-3 pr-4">
              <span v-if="row.quote">{{ formatQuote(row.quote.price, row.quote.currency) }}</span>
              <span v-else>—</span>
              <small class="block text-text-muted">{{ row.quote ? `Última actualización: ${formatTimestamp(row.quote.timestamp)}` : 'Sin dato' }}</small>
              <small v-if="row.dailyChangePercent !== null" :class="row.dailyChangePercent >= 0 ? 'text-income' : 'text-expense'">{{ row.dailyChangePercent >= 0 ? '+' : '' }}{{ row.dailyChangePercent.toFixed(2) }}%</small>
            </td>
            <td class="py-3 pr-4 font-semibold">{{ formatMoney(row.value) }}</td>
            <td class="py-3">
              <span v-if="row.status === 'fresh'" class="text-income">Actualizado</span>
              <span v-else-if="row.status === 'stale'" class="text-accent" title="La cotización supera el intervalo recomendado">Retrasado</span>
              <span v-else class="text-expense">Sin cotización</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
