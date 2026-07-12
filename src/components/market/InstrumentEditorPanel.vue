<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue'

import { useFinancialStateStore } from '../../stores/financial-state'
import { searchMarketSymbols, type MarketSearchResult } from '../../services/market-api'
import { useMarketStore, type NewInstrumentInput } from '../../stores/market'
import type { InstrumentType } from '../../scripts/types'

const financialStateStore = useFinancialStateStore()
const marketStore = useMarketStore()
const sourceSymbols = reactive<Record<string, string>>({})
const searchResults = shallowRef<MarketSearchResult[]>([])
const searchInstrumentId = shallowRef('')
const isSearching = shallowRef(false)
const searchError = shallowRef('')
const form = reactive<NewInstrumentInput>({ investmentAssetId: '', type: 'etf', symbol: '', market: '', currency: 'EUR', provider: 'twelve-data' })
const types: Array<{ value: InstrumentType; label: string }> = [
  { value: 'stock', label: 'Acción' }, { value: 'etf', label: 'ETF' }, { value: 'fund', label: 'Fondo' }, { value: 'crypto', label: 'Cripto' },
]

function submit(): void {
  if (!form.investmentAssetId) form.investmentAssetId = financialStateStore.investmentAssets[0]?.id || ''
  if (marketStore.addInstrument(form)) {
    form.symbol = ''
  }
}

function linkMovements(instrumentId: string): void {
  marketStore.linkExistingMovements(instrumentId)
}

function initializeSourceSymbols(): void {
  marketStore.instruments.forEach((instrument) => {
    if (!(instrument.id in sourceSymbols)) sourceSymbols[instrument.id] = instrument.symbol
  })
}

function saveSourceSymbol(instrumentId: string): void {
  if (marketStore.updateInstrumentSymbol(instrumentId, sourceSymbols[instrumentId] || '')) {
    searchInstrumentId.value = ''
    searchResults.value = []
    searchError.value = ''
  }
}

async function searchSourceSymbols(instrumentId: string): Promise<void> {
  const instrument = marketStore.instruments.find((item) => item.id === instrumentId)
  const query = sourceSymbols[instrumentId]?.trim() || instrument?.symbol || ''
  if (!query || !instrument) return
  isSearching.value = true
  searchInstrumentId.value = instrumentId
  searchError.value = ''
  try {
    searchResults.value = await searchMarketSymbols(query, instrument.provider)
  } catch (error) {
    searchResults.value = []
    searchError.value = error instanceof Error ? error.message : 'No se pudieron buscar símbolos'
  } finally {
    isSearching.value = false
  }
}

function selectSearchResult(instrumentId: string, result: MarketSearchResult): void {
  sourceSymbols[instrumentId] = result.symbol
  searchResults.value = []
}

watch(
  () => marketStore.instruments.map((instrument) => `${instrument.id}:${instrument.symbol}`).join('|'),
  initializeSourceSymbols,
  { immediate: true },
)
</script>

<template>
  <article class="card" data-instrument-editor>
    <h3 class="font-display text-xl">Instrumentos de mercado</h3>
    <p class="text-text-muted text-sm">Configura el instrumento y vincula sus movimientos existentes. La tenencia actual se edita en la valoración de cartera.</p>
    <form class="mt-4 grid gap-3 md:grid-cols-2" @submit.prevent="submit">
      <label>Activo<select v-model="form.investmentAssetId" required><option value="">Selecciona un activo</option><option v-for="asset in financialStateStore.investmentAssets" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select></label>
      <label>Tipo<select v-model="form.type"><option v-for="item in types" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label>Símbolo<input v-model="form.symbol" required placeholder="VWCE, BTC…" /></label>
      <label>Mercado / MIC<input v-model="form.market" placeholder="XETRA (opcional)" /></label>
      <label>Moneda<input v-model="form.currency" maxlength="3" required /></label>
      <label>Proveedor<select v-model="form.provider"><option value="twelve-data">Twelve Data</option><option value="yahoo">Yahoo Finance</option><option value="coingecko">CoinGecko</option></select></label>
      <button type="submit" class="primary-btn md:col-span-2">Añadir instrumento</button>
    </form>
    <ul v-if="marketStore.instruments.length" class="instrument-list" aria-label="Instrumentos configurados">
      <li v-for="instrument in marketStore.instruments" :key="instrument.id" class="instrument-card">
        <div class="instrument-card__header">
          <div>
            <div class="instrument-card__title">
              <strong>{{ instrument.symbol }}</strong>
              <span>{{ instrument.type }} · {{ instrument.currency }}</span>
            </div>
            <div class="instrument-card__stats">
              <span>{{ marketStore.linkedMovementCount(instrument.id) }} vinculados</span>
              <span>{{ marketStore.matchingMovementCount(instrument.id) }} por vincular</span>
            </div>
          </div>
          <span class="instrument-card__provider">{{ instrument.provider }}</span>
        </div>

        <div class="instrument-card__source">
          <div class="instrument-card__source-heading">
            <span class="instrument-card__eyebrow">Fuente de cotización</span>
            <span class="instrument-card__hint">Ticker exacto del proveedor</span>
          </div>
          <div class="instrument-card__source-row">
            <label class="sr-only" :for="`instrument-symbol-${instrument.id}`">Símbolo fuente de {{ instrument.symbol }}</label>
            <input
              :id="`instrument-symbol-${instrument.id}`"
              v-model="sourceSymbols[instrument.id]"
              :aria-label="`Símbolo fuente de ${instrument.symbol}`"
              type="text"
              spellcheck="false"
            />
            <button type="button" class="primary-btn" @click="saveSourceSymbol(instrument.id)">
              Guardar
            </button>
          </div>
        </div>

        <ul v-if="searchInstrumentId === instrument.id && searchResults.length" class="instrument-card__results" aria-label="Resultados de búsqueda">
          <li v-for="result in searchResults" :key="result.symbol" class="instrument-card__result">
            <div>
              <strong>{{ result.symbol }}</strong>
              <small>{{ result.exchange }} · {{ result.name }}</small>
            </div>
            <button type="button" class="secondary-btn" :aria-label="`Usar símbolo ${result.symbol}`" @click="selectSearchResult(instrument.id, result)">
              Usar este
            </button>
          </li>
        </ul>
        <small v-if="searchInstrumentId === instrument.id && searchError" class="instrument-card__error">{{ searchError }}</small>

        <div class="instrument-card__actions">
          <button
            v-if="instrument.provider === 'yahoo'"
            type="button"
            class="secondary-btn"
            :disabled="isSearching && searchInstrumentId === instrument.id"
            @click="searchSourceSymbols(instrument.id)"
          >
            {{ isSearching && searchInstrumentId === instrument.id ? 'Buscando…' : 'Buscar aproximados' }}
          </button>
          <label class="sr-only" :for="`instrument-provider-${instrument.id}`">Proveedor de {{ instrument.symbol }}</label>
          <select
            :id="`instrument-provider-${instrument.id}`"
            :value="instrument.provider"
            :aria-label="`Proveedor de ${instrument.symbol}`"
            @change="marketStore.setInstrumentProvider(instrument.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="twelve-data">Twelve Data</option>
            <option value="yahoo">Yahoo Finance</option>
            <option value="coingecko">CoinGecko</option>
          </select>
          <button
            v-if="marketStore.matchingMovementCount(instrument.id)"
            type="button"
            class="secondary-btn"
            @click="linkMovements(instrument.id)"
          >
            Vincular movimientos
          </button>
          <button type="button" class="danger-btn" @click="marketStore.removeInstrument(instrument.id)">Eliminar</button>
        </div>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.instrument-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.instrument-card {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 82%, var(--primary));
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--primary));
}

.instrument-card__header,
.instrument-card__source,
.instrument-card__actions {
  padding: 0.85rem 1rem;
}

.instrument-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.instrument-card__title {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  color: var(--text-main);
}

.instrument-card__title strong {
  font-family: var(--font-display, inherit);
  font-size: 1.05rem;
}

.instrument-card__title span,
.instrument-card__hint,
.instrument-card__stats,
.instrument-card__result small {
  color: var(--text-muted);
}

.instrument-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.3rem;
  font-size: 0.78rem;
}

.instrument-card__stats span + span::before {
  margin-right: 0.75rem;
  content: '·';
  color: var(--primary);
}

.instrument-card__provider,
.instrument-card__eyebrow {
  color: var(--primary);
  font-family: var(--font-mono, monospace);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.instrument-card__provider {
  padding: 0.35rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.instrument-card__source {
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  background: color-mix(in srgb, var(--bg-subtle) 70%, transparent);
}

.instrument-card__source-heading {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  margin-bottom: 0.45rem;
}

.instrument-card__hint {
  font-size: 0.75rem;
}

.instrument-card__source-row {
  display: flex;
  gap: 0.55rem;
}

.instrument-card__source-row input {
  min-width: 0;
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  background: var(--bg-card);
  padding: 0.65rem 0.75rem;
  color: var(--text-main);
  font-family: var(--font-mono, monospace);
  font-size: 0.9rem;
}

.instrument-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.instrument-card__actions select {
  min-height: 2.25rem;
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  background: var(--bg-card);
  padding: 0.45rem 0.65rem;
  color: var(--text-main);
}

.instrument-card__results {
  display: grid;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  background: color-mix(in srgb, var(--primary) 5%, var(--bg-card));
}

.instrument-card__result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0;
}

.instrument-card__result div {
  min-width: 0;
}

.instrument-card__result small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instrument-card__error {
  display: block;
  padding: 0 1rem 0.75rem;
  color: var(--expense);
}

@media (max-width: 540px) {
  .instrument-card__header {
    display: block;
  }

  .instrument-card__provider {
    display: inline-block;
    margin-top: 0.65rem;
  }

  .instrument-card__source-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .instrument-card__source-row button,
  .instrument-card__actions > * {
    width: 100%;
  }

  .instrument-card__result {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
