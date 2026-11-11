<script setup lang="ts">
import { ref } from 'vue'

import { formatMoney } from '../../../lib/format'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMarketStore } from '../../../stores/market'
import { useToast } from '../../../composables/useToast'
import { useSettingsStore } from '../../../stores/settings'
import NeonButton from '../../ui/NeonButton.vue'
import type { PendingDeletion } from './deletion'
import NeonSettingsBlock from './NeonSettingsBlock.vue'
import NeonSettingsField from './NeonSettingsField.vue'
import { DATA_ROW, HEAD_ROW, PLAIN_ROW, TABLE_SCROLL, TOTAL_FIGURE } from './table-styles'
import { openingBalanceText, parseAmount, type AssetRow, type AssetsTable } from './view-model'

// Activos: the starting value of each investment grouping, where its price
// comes from and how it reaches Stock Events. Name and value are edited in place.
defineProps<{ table: AssetsTable }>()
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()

const settingsStore = useSettingsStore()
const { showToast } = useToast()
const financialStateStore = useFinancialStateStore()
const marketStore = useMarketStore()
const COLUMNS = 'grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_130px_minmax(0,1.3fr)_190px_112px]'

function rename(row: AssetRow, name: string): void {
  settingsStore.saveEntity('investmentAssets', row.id, name, row.openingBalance)
}

function rebalance(row: AssetRow, text: string): void {
  const value = parseAmount(text)
  if (value !== null) settingsStore.saveEntity('investmentAssets', row.id, row.name, value)
}

function askDelete(row: AssetRow): void {
  emit('ask', {
    title: '¿Eliminar este activo?',
    confirmLabel: 'Eliminar activo',
    message: `${row.name}, con su valor inicial de ${formatMoney(row.openingBalance)}. Se quitan también sus instrumentos de cotización; sus movimientos se conservan. No se puede deshacer.`,
    run: () => settingsStore.removeEntity('investmentAssets', row.id),
  })
}

const name = ref('')
const symbol = ref('')
const balance = ref('')

/** Creates the asset and, if a symbol was typed, the quote that prices it. */
function add(): void {
  const trimmed = name.value.trim()
  const opening = openingBalanceText(balance.value)
  if (opening === null) return void showToast('El saldo inicial no es un número.')
  if (!settingsStore.addEntity('investmentAssets', name.value, opening)) return
  const asset = financialStateStore.state.investmentAssets.find((item) => item.name === trimmed)
  if (asset && symbol.value.trim()) {
    marketStore.addInstrument({
      investmentAssetId: asset.id,
      type: 'etf',
      symbol: symbol.value,
      market: '',
      currency: financialStateStore.currency,
      provider: 'yahoo',
    })
  }
  name.value = ''
  symbol.value = ''
  balance.value = ''
}
</script>

<template>
  <NeonSettingsBlock
    id="activos"
    title="Activos"
    description="Valor de partida, de dónde sale su cotización y cómo llega a Stock Events."
  >
    <div :class="TABLE_SCROLL">
      <div role="table" aria-label="Activos de inversión" class="grid min-w-[980px]">
        <div role="row" :class="[HEAD_ROW, COLUMNS]">
          <span role="columnheader">Activo</span>
          <span role="columnheader">Cotización</span>
          <span role="columnheader">Vinculados</span>
          <span role="columnheader">Sincronización</span>
          <span role="columnheader" class="text-end">Valor inicial</span>
          <span />
        </div>
        <div
          v-for="row in table.rows"
          :key="row.id"
          role="row"
          :class="[DATA_ROW, COLUMNS]"
          :data-asset-id="row.id"
        >
          <span role="cell" class="grid min-w-0">
            <NeonSettingsField
              :model-value="row.name"
              label="Nombre del activo"
              @commit="rename(row, $event)"
            />
            <span v-if="row.kind" class="text-muted text-note px-2.5">{{ row.kind }}</span>
          </span>
          <span role="cell" class="grid min-w-0 justify-items-start ps-2.5">
            <span
              v-if="row.symbol"
              class="bg-panel2 rounded-ticker px-2 py-0.5 font-mono text-[13px] font-bold tracking-[0.04em]"
            >
              {{ row.symbol }}
            </span>
            <span v-else class="text-muted text-[15px]">—</span>
            <span v-if="row.provider" class="text-muted text-meta truncate">{{
              row.provider
            }}</span>
          </span>
          <span role="cell" class="text-soft text-[15px]">
            <span class="font-display text-text font-semibold">{{ row.linked }}</span> vinculados
          </span>
          <span
            role="cell"
            class="flex min-w-0 items-center gap-2 text-[15px]"
            :class="row.warn ? 'text-accent-text' : 'text-muted'"
          >
            <span
              v-if="row.warn"
              class="bg-accent size-2 shrink-0 rounded-full"
              aria-hidden="true"
            />
            <span class="truncate">{{ row.sync }}</span>
          </span>
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              :model-value="formatMoney(row.openingBalance)"
              :label="`Valor inicial de ${row.name}`"
              kind="figure"
              @commit="rebalance(row, $event)"
            />
          </span>
          <span role="cell" class="flex justify-end">
            <NeonButton danger :aria-label="`Eliminar ${row.name}`" @click="askDelete(row)">
              Eliminar
            </NeonButton>
          </span>
        </div>
        <div role="row" :class="[PLAIN_ROW, COLUMNS]">
          <span role="cell" class="text-soft text-[15px] font-bold">Valor inicial total</span>
          <span role="cell" />
          <span role="cell" />
          <span role="cell" />
          <span role="cell" :class="TOTAL_FIGURE" data-settings-total="activos">
            {{ formatMoney(table.total) }}
          </span>
          <span role="cell" />
        </div>
        <div role="row" :class="[PLAIN_ROW, COLUMNS]">
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              v-model="name"
              label="Nombre del nuevo activo"
              placeholder="Nuevo activo"
              @keydown.enter="add"
            />
          </span>
          <span role="cell">
            <NeonSettingsField
              v-model="symbol"
              label="Símbolo"
              placeholder="VWCE, BTC…"
              @keydown.enter="add"
            />
          </span>
          <span role="cell" />
          <span role="cell" />
          <span role="cell">
            <NeonSettingsField
              v-model="balance"
              label="Valor inicial del nuevo activo"
              kind="figure"
              placeholder="0,00 €"
              @keydown.enter="add"
            />
          </span>
          <span role="cell" class="flex justify-end">
            <NeonButton @click="add">Añadir</NeonButton>
          </span>
        </div>
      </div>
    </div>
  </NeonSettingsBlock>
</template>
