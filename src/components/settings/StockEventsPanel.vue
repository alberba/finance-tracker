<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'

import { useStockEventsStore } from '../../stores/stockevents'
import type { SymbolCheckResult } from '../../services/stockevents-api'

const stockEventsStore = useStockEventsStore()

const apiKeyInput = shallowRef(stockEventsStore.settings.apiKey)

watch(
  () => stockEventsStore.settings.apiKey,
  (apiKey) => {
    apiKeyInput.value = apiKey
  },
)

const hasApiKey = computed(() => Boolean(stockEventsStore.settings.apiKey))
const syncedCount = computed(
  () => stockEventsStore.symbolRows.filter((row) => row.sync && row.watchlistId).length,
)

function onSaveApiKey(): void {
  stockEventsStore.saveApiKey(apiKeyInput.value)
  if (apiKeyInput.value.trim()) {
    void stockEventsStore.loadWatchlists()
  }
}

function onToggleEnabled(event: Event): void {
  stockEventsStore.setEnabled((event.target as HTMLInputElement).checked)
}

function onToggleSync(symbol: string, event: Event): void {
  stockEventsStore.updateMapping(symbol, { sync: (event.target as HTMLInputElement).checked })
}

function onSelectWatchlist(symbol: string, event: Event): void {
  stockEventsStore.updateMapping(symbol, {
    watchlistId: (event.target as HTMLSelectElement).value,
  })
}

function onChangeTargetSymbol(symbol: string, event: Event): void {
  stockEventsStore.updateMapping(symbol, {
    targetSymbol: (event.target as HTMLInputElement).value,
  })
}

function checkResultLabel(result: SymbolCheckResult | null): string {
  if (!result) return '—'
  if (result.status === 'in-watchlist') return 'En la lista'
  if (result.status === 'detected') return 'Detectado'
  if (result.status === 'not-detected') return 'No detectado'
  return result.message || 'Error'
}

function checkResultClass(result: SymbolCheckResult | null): string {
  if (!result) return ''
  if (result.status === 'in-watchlist' || result.status === 'detected') return 'is-ok'
  return 'is-bad'
}

onMounted(() => {
  if (hasApiKey.value) {
    void stockEventsStore.loadWatchlists()
  }
})
</script>

<template>
  <section id="cfg-stockevents" class="settings-block">
    <header>
      <span class="settings-block__num">09</span>
      <h3>Stock Events</h3>
      <p>
        Sincroniza los nuevos movimientos de inversión con Stock Events. La API key se crea en la
        web de Stock Events, en Settings &gt; Data &gt; API Keys (requiere suscripción Pro).
      </p>
    </header>
    <div class="settings-block__body">
      <label class="tx-checkbox-option">
        <input
          type="checkbox"
          :checked="stockEventsStore.settings.enabled"
          @change="onToggleEnabled"
        />
        <span>Sincronizar nuevos movimientos con Stock Events</span>
      </label>

      <div class="stockevents-key">
        <label class="stockevents-key__field">
          API key
          <input
            v-model="apiKeyInput"
            type="password"
            placeholder="se_live_…"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <button type="button" class="primary-btn" @click="onSaveApiKey">Guardar API key</button>
        <button
          type="button"
          class="secondary-btn"
          :disabled="!hasApiKey || stockEventsStore.isLoadingWatchlists"
          @click="stockEventsStore.loadWatchlists()"
        >
          {{ stockEventsStore.isLoadingWatchlists ? 'Cargando…' : 'Cargar listas' }}
        </button>
      </div>

      <p v-if="stockEventsStore.connectionError" class="stockevents-error">
        {{ stockEventsStore.connectionError }}
      </p>
      <p v-else-if="hasApiKey && stockEventsStore.watchlists.length" class="stockevents-hint">
        Conectado: {{ stockEventsStore.watchlists.length }} lista(s) de seguimiento disponibles.
      </p>

      <p v-if="!stockEventsStore.symbolRows.length" class="stockevents-hint">
        No hay símbolos en finance-tracker todavía. Añade instrumentos o movimientos de inversión.
      </p>
      <div v-else class="stockevents-table-wrap">
        <table class="stockevents-table" aria-label="Sincronización de símbolos con Stock Events">
          <thead>
            <tr>
              <th scope="col">Símbolo</th>
              <th scope="col">Sincronizar</th>
              <th scope="col">Lista de seguimiento</th>
              <th scope="col">Símbolo en Stock Events</th>
              <th scope="col">Comprobación</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in stockEventsStore.symbolRows" :key="row.symbol">
              <td>
                <strong>{{ row.symbol }}</strong>
                <small v-if="!row.hasInstrument">sin instrumento</small>
              </td>
              <td>
                <input
                  type="checkbox"
                  :checked="row.sync"
                  :aria-label="`Sincronizar ${row.symbol}`"
                  @change="onToggleSync(row.symbol, $event)"
                />
              </td>
              <td>
                <select
                  :value="row.watchlistId"
                  :aria-label="`Lista de seguimiento de ${row.symbol}`"
                  :disabled="!stockEventsStore.watchlists.length"
                  @change="onSelectWatchlist(row.symbol, $event)"
                >
                  <option value="">Sin lista</option>
                  <option
                    v-for="watchlist in stockEventsStore.watchlists"
                    :key="watchlist.id"
                    :value="watchlist.id"
                  >
                    {{ watchlist.name }}
                  </option>
                </select>
              </td>
              <td>
                <input
                  class="stockevents-target"
                  type="text"
                  :value="row.targetSymbol"
                  :placeholder="row.symbol"
                  :aria-label="`Símbolo en Stock Events de ${row.symbol}`"
                  spellcheck="false"
                  @input="onChangeTargetSymbol(row.symbol, $event)"
                />
              </td>
              <td>
                <span class="stockevents-status" :class="checkResultClass(row.checkResult)">
                  {{ checkResultLabel(row.checkResult) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="stockevents-actions">
        <button
          type="button"
          class="secondary-btn"
          :disabled="!hasApiKey || !syncedCount || stockEventsStore.isChecking"
          @click="stockEventsStore.checkSymbols()"
        >
          {{ stockEventsStore.isChecking ? 'Comprobando…' : 'Comprobar símbolos' }}
        </button>
        <small>
          {{ syncedCount }} símbolo(s) con sincronización activada. La comprobación valida que Stock
          Events reconoce cada símbolo en su lista. Si un símbolo no se detecta, indica el ticker
          que usa Stock Events (p. ej. AGED.MI) en «Símbolo en Stock Events».
        </small>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stockevents-key {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.stockevents-key__field {
  display: grid;
  flex: 1;
  gap: 0.35rem;
  min-width: 14rem;
}

.stockevents-key__field input {
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  background: var(--bg-card);
  padding: 0.65rem 0.75rem;
  color: var(--text-main);
  font-family: var(--font-mono, monospace);
  font-size: 0.9rem;
}

.stockevents-error {
  margin-top: 0.6rem;
  color: var(--expense);
  font-size: 0.85rem;
}

.stockevents-hint {
  margin-top: 0.6rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.stockevents-table-wrap {
  overflow-x: auto;
  margin-top: 0.85rem;
}

.stockevents-table {
  width: 100%;
  border-collapse: collapse;
}

.stockevents-table th,
.stockevents-table td {
  padding: 0.55rem 0.65rem;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  text-align: left;
  vertical-align: middle;
}

.stockevents-table th {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stockevents-table td small {
  display: block;
  color: var(--text-muted);
}

.stockevents-table select {
  min-height: 2.1rem;
  min-width: 9rem;
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  background: var(--bg-card);
  padding: 0.35rem 0.55rem;
  color: var(--text-main);
}

.stockevents-target {
  min-width: 7.5rem;
  width: 8.5rem;
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  background: var(--bg-card);
  padding: 0.35rem 0.55rem;
  color: var(--text-main);
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
  text-transform: uppercase;
}

.stockevents-status {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.stockevents-status.is-ok {
  color: var(--income, #2e9e5b);
}

.stockevents-status.is-bad {
  color: var(--expense);
}

.stockevents-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.85rem;
}

.stockevents-actions small {
  color: var(--text-muted);
}
</style>
