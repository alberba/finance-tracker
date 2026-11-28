<script setup lang="ts">
import { ref } from 'vue'

import { formatMoney } from '../../../lib/format'
import { useSettingsStore } from '../../../stores/settings'
import NeonButton from '../../ui/NeonButton.vue'
import type { PendingDeletion } from './deletion'
import { useEntityActions } from './entity-actions'
import NeonSettingsBlock from './NeonSettingsBlock.vue'
import NeonSettingsField from './NeonSettingsField.vue'
import { useTickerSuggestions } from './ticker-suggestions'
import { DATA_ROW, HEAD_ROW, PLAIN_ROW, TABLE_SCROLL, TOTAL_FIGURE } from './table-styles'
import { parseAmount, type AssetRow, type AssetsTable } from './view-model'

// Activos: the starting value of each investment grouping, where its price
// comes from and how it reaches Stock Events. Name and value are edited in place.
const props = defineProps<{ table: AssetsTable }>()
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()

const settingsStore = useSettingsStore()
const actions = useEntityActions('investmentAssets')
// A proposal for each asset whose movements carry a symbol but that has none to be quoted by.
const suggestions = useTickerSuggestions(() =>
  props.table.rows.filter((row) => !row.ticker && row.symbol).map((row) => row.symbol),
)
const COLUMNS = 'grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_130px_minmax(0,1.3fr)_190px_112px]'

function rename(row: AssetRow, name: string): void {
  settingsStore.saveEntity('investmentAssets', row.id, name, row.openingBalance)
}

function rebalance(row: AssetRow, text: string): void {
  const value = parseAmount(text)
  if (value !== null) settingsStore.saveEntity('investmentAssets', row.id, row.name, value)
}

function askDelete(row: AssetRow): void {
  emit('ask', actions.deletion(row))
}

const name = ref('')
const symbol = ref('')
const balance = ref('')

/** Creates the asset and, if a symbol was typed, the quote that prices it. */
function add(): void {
  if (!actions.add(name.value, balance.value, symbol.value)) return
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
          <span role="cell" class="grid min-w-0">
            <NeonSettingsField
              :model-value="row.ticker"
              :label="`Símbolo de cotización de ${row.name}`"
              placeholder="Sin símbolo"
              @commit="actions.setTicker(row.id, $event, row.symbol)"
            />
            <span v-if="row.provider" class="text-muted text-meta truncate px-2.5">{{
              row.provider
            }}</span>
            <button
              v-else-if="suggestions[row.symbol]"
              type="button"
              class="text-accent-text text-meta outline-accent justify-self-start rounded-xs px-2.5 font-bold underline underline-offset-2 focus-visible:outline-2"
              :aria-label="`Usar ${suggestions[row.symbol]} como símbolo de cotización de ${row.name}`"
              data-ticker-suggestion
              @click="actions.setTicker(row.id, suggestions[row.symbol], row.symbol)"
            >
              Usar {{ suggestions[row.symbol] }}
            </button>
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
