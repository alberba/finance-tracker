<script setup lang="ts">
import type { StockEventsWatchlist, SymbolCheckResult } from '../../services/stockevents-api'
import type { StockEventsSymbolRow } from '../../stores/stockevents'

interface Props {
  rows: StockEventsSymbolRow[]
  watchlists: StockEventsWatchlist[]
  label: string
  hidden: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  toggleSync: [symbol: string, checked: boolean]
  selectWatchlist: [symbol: string, watchlistId: string]
  changeTargetSymbol: [symbol: string, targetSymbol: string]
  setHidden: [symbol: string, hidden: boolean]
}>()

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
</script>

<template>
  <div class="stockevents-table-wrap">
    <table class="stockevents-table" :aria-label="label">
      <thead>
        <tr>
          <th scope="col">Símbolo</th>
          <th scope="col">Sincronizar</th>
          <th scope="col">Lista de seguimiento</th>
          <th scope="col">Símbolo en Stock Events</th>
          <th scope="col">Comprobación</th>
          <th scope="col"><span class="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.symbol">
          <td>
            <strong>{{ row.symbol }}</strong>
            <small v-if="!row.hasInstrument">sin instrumento</small>
          </td>
          <td>
            <input
              type="checkbox"
              :checked="row.sync"
              :aria-label="`Sincronizar ${row.symbol}`"
              @change="emit('toggleSync', row.symbol, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td>
            <select
              :value="row.watchlistId"
              :aria-label="`Lista de seguimiento de ${row.symbol}`"
              :disabled="!watchlists.length"
              @change="
                emit('selectWatchlist', row.symbol, ($event.target as HTMLSelectElement).value)
              "
            >
              <option value="">Sin lista</option>
              <option v-for="watchlist in watchlists" :key="watchlist.id" :value="watchlist.id">
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
              @input="
                emit('changeTargetSymbol', row.symbol, ($event.target as HTMLInputElement).value)
              "
            />
          </td>
          <td>
            <span class="stockevents-status" :class="checkResultClass(row.checkResult)">
              {{ checkResultLabel(row.checkResult) }}
            </span>
          </td>
          <td>
            <button
              type="button"
              class="stockevents-row-action"
              :aria-label="`${hidden ? 'Mostrar' : 'Ocultar'} ${row.symbol}`"
              @click="emit('setHidden', row.symbol, !hidden)"
            >
              {{ hidden ? 'Mostrar' : 'Ocultar' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
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

.stockevents-row-action {
  border: 0;
  background: transparent;
  padding: 0.35rem 0.45rem;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.stockevents-row-action:hover,
.stockevents-row-action:focus-visible {
  color: var(--text-main);
  text-decoration: underline;
}
</style>
