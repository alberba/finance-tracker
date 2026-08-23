<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import StockEventsSymbolTable from './StockEventsSymbolTable.vue'
import { useStockEventsStore } from '../../stores/stockevents'

const stockEventsStore = useStockEventsStore()

const apiKeyInput = shallowRef(stockEventsStore.settings.apiKey)
const showHiddenSymbols = shallowRef(false)

watch(
  () => stockEventsStore.settings.apiKey,
  (apiKey) => {
    apiKeyInput.value = apiKey
    if (apiKey) {
      void stockEventsStore.loadWatchlists()
    }
  },
  { immediate: true },
)

const hasApiKey = computed(() => Boolean(stockEventsStore.settings.apiKey))
const syncedCount = computed(
  () => stockEventsStore.symbolRows.filter((row) => row.sync && row.watchlistId).length,
)
const visibleRows = computed(() => stockEventsStore.symbolRows.filter((row) => !row.hidden))
const hiddenRows = computed(() => stockEventsStore.symbolRows.filter((row) => row.hidden))

function onSaveApiKey(): void {
  stockEventsStore.saveApiKey(apiKeyInput.value)
  if (apiKeyInput.value.trim()) {
    void stockEventsStore.loadWatchlists()
  }
}

function onToggleSync(symbol: string, checked: boolean): void {
  stockEventsStore.updateMapping(symbol, { sync: checked })
}

function onSelectWatchlist(symbol: string, watchlistId: string): void {
  stockEventsStore.updateMapping(symbol, { watchlistId })
}

function onChangeTargetSymbol(symbol: string, targetSymbol: string): void {
  stockEventsStore.updateMapping(symbol, { targetSymbol })
}

function onSetHidden(symbol: string, hidden: boolean): void {
  stockEventsStore.updateMapping(symbol, { hidden })
}

function onSelectCashWatchlist(accountId: string, watchlistId: string): void {
  stockEventsStore.updateCashMapping(accountId, watchlistId)
}
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
          @change="stockEventsStore.setEnabled(($event.target as HTMLInputElement).checked)"
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

      <section class="stockevents-cash-mappings" aria-labelledby="stockevents-cash-title">
        <div>
          <h4 id="stockevents-cash-title">Efectivo de aportes</h4>
          <p>
            Relaciona cada cuenta con la lista donde Stock Events debe registrar el efectivo de sus
            aportes.
          </p>
        </div>
        <div class="stockevents-cash-grid">
          <label v-for="row in stockEventsStore.cashMappingRows" :key="row.accountId">
            <span>{{ row.accountName }}</span>
            <select
              :value="row.watchlistId"
              :disabled="!hasApiKey || !stockEventsStore.watchlists.length"
              :aria-label="`Lista de efectivo de ${row.accountName}`"
              @change="
                onSelectCashWatchlist(row.accountId, ($event.target as HTMLSelectElement).value)
              "
            >
              <option value="">No sincronizar efectivo</option>
              <option
                v-for="watchlist in stockEventsStore.watchlists"
                :key="watchlist.id"
                :value="watchlist.id"
              >
                {{ watchlist.name }}
              </option>
            </select>
          </label>
        </div>
        <p v-if="!stockEventsStore.cashMappingRows.length" class="stockevents-hint">
          Añade una cuenta para poder relacionarla con Stock Events.
        </p>
        <p v-else-if="!stockEventsStore.watchlists.length" class="stockevents-hint">
          Guarda la API key y carga las listas para configurar las relaciones.
        </p>
      </section>

      <p v-if="!stockEventsStore.symbolRows.length" class="stockevents-hint">
        No hay símbolos en finance-tracker todavía. Añade instrumentos o movimientos de inversión.
      </p>
      <template v-else>
        <StockEventsSymbolTable
          v-if="visibleRows.length"
          :rows="visibleRows"
          :watchlists="stockEventsStore.watchlists"
          label="Símbolos visibles de Stock Events"
          :hidden="false"
          @toggle-sync="onToggleSync"
          @select-watchlist="onSelectWatchlist"
          @change-target-symbol="onChangeTargetSymbol"
          @set-hidden="onSetHidden"
        />
        <p v-else class="stockevents-hint">No hay símbolos visibles.</p>

        <div v-if="hiddenRows.length" class="stockevents-hidden-toggle">
          <button
            type="button"
            class="secondary-btn"
            :aria-expanded="showHiddenSymbols"
            @click="showHiddenSymbols = !showHiddenSymbols"
          >
            {{ showHiddenSymbols ? 'Ocultar ocultos' : `Mostrar ocultos (${hiddenRows.length})` }}
          </button>
        </div>

        <section v-if="showHiddenSymbols && hiddenRows.length" class="stockevents-hidden">
          <h4>Símbolos ocultos</h4>
          <StockEventsSymbolTable
            :rows="hiddenRows"
            :watchlists="stockEventsStore.watchlists"
            label="Símbolos ocultos de Stock Events"
            hidden
            @toggle-sync="onToggleSync"
            @select-watchlist="onSelectWatchlist"
            @change-target-symbol="onChangeTargetSymbol"
            @set-hidden="onSetHidden"
          />
        </section>
      </template>

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

.stockevents-cash-mappings {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--bg-subtle);
  padding: 1rem;
}

.stockevents-cash-mappings h4,
.stockevents-cash-mappings p {
  margin: 0;
}

.stockevents-cash-mappings h4 {
  color: var(--text-main);
  font-size: 0.95rem;
}

.stockevents-cash-mappings p {
  margin-top: 0.25rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.stockevents-cash-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.65rem;
}

.stockevents-cash-grid label {
  display: grid;
  gap: 0.35rem;
  color: var(--text-main);
  font-size: 0.85rem;
  font-weight: 600;
}

.stockevents-cash-grid select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  background: var(--bg-card);
  padding: 0.65rem 0.75rem;
  color: var(--text-main);
}

.stockevents-hint {
  margin-top: 0.6rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.stockevents-hidden-toggle {
  margin-top: 0.85rem;
}

.stockevents-hidden {
  margin-top: 0.85rem;
  border-top: 1px solid var(--line);
  padding-top: 0.85rem;
}

.stockevents-hidden h4 {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
