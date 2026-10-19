<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import SettingsInstrumentEditor from './SettingsInstrumentEditor.vue'
import SettingsInstrumentForm from './SettingsInstrumentForm.vue'
import SettingsTabIntro from './SettingsTabIntro.vue'
import BaseButton from '../ui/BaseButton.vue'
import LedgerSurface from '../ui/LedgerSurface.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import SidePanel from '../ui/SidePanel.vue'
import { providerLabel } from '../../domain/investment/instrument-labels'
import { buildQuoteSymbolRows, type QuoteSymbolRow } from '../../domain/settings/view-model'
import { useFinancialStateStore } from '../../stores/financial-state'

defineProps<{ isActive: boolean }>()

const financialStateStore = useFinancialStateStore()
const rows = computed(() => buildQuoteSymbolRows(financialStateStore.state))
const panelOpen = ref(false)
const selectedId = ref('')
const initialSymbol = ref('')
const initialAssetId = ref('')
const initialCurrency = ref('EUR')
const formKey = ref(0)
const selected = computed(() => rows.value.find((row) => row.id === selectedId.value))

const columns: LedgerColumn<QuoteSymbolRow>[] = [
  { key: 'symbol', label: 'Símbolo', rowHeader: true },
  { key: 'provider', label: 'Proveedor' },
  { key: 'currency', label: 'Moneda', hideBelow: 'md' },
  { key: 'movements', label: 'Movimientos', align: 'right', hideBelow: 'md' },
  { key: 'action', label: 'Cotización', align: 'right' },
]

function open(row?: QuoteSymbolRow): void {
  selectedId.value = row?.instrument ? row.id : ''
  initialSymbol.value = row?.symbol ?? ''
  initialAssetId.value = row?.assetId ?? ''
  initialCurrency.value = row?.currency ?? financialStateStore.currency
  formKey.value += 1
  panelOpen.value = true
}

watch(selected, (value, previous) => {
  if (previous?.instrument && !value) panelOpen.value = false
})
</script>

<template>
  <section
    id="settings-tab-quotes"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-quotes-button"
    data-settings-quotes
  >
    <SettingsTabIntro
      title="Cotizaciones por símbolo"
      description="Configura el ticker y el proveedor de cada símbolo. También aparecen los símbolos de tus movimientos que aún no tienen cotización."
      action="Nuevo símbolo"
      @action="open()"
    />

    <LedgerSurface>
      <LedgerTable
        :columns="columns"
        :rows="rows"
        :row-key="(row) => row.id"
        label="Cotizaciones por símbolo"
        empty-text="Aún no hay símbolos. Añade uno o registra un movimiento de inversión con símbolo."
        :row-attrs="(row) => ({ 'data-quote-symbol': row.symbol })"
      >
        <template #cell-symbol="{ row }">
          <span class="grid gap-0.5">
            <span class="font-mono font-medium">{{ row.symbol }}</span>
            <span v-if="row.categories.length" class="text-text-muted text-sm">
              {{ row.categories.join(', ') }}
            </span>
          </span>
        </template>
        <template #cell-provider="{ row }">
          <span class="grid gap-0.5">
            <span :class="row.instrument ? 'text-text-main' : 'text-text-muted'">
              {{ row.instrument ? providerLabel(row.instrument.provider) : 'Sin configurar' }}
            </span>
            <span v-if="row.instrument?.quoteSymbol" class="text-text-muted font-mono text-sm">{{
              row.instrument.quoteSymbol
            }}</span>
          </span>
        </template>
        <template #cell-currency="{ row }">
          <span class="font-mono text-sm">{{ row.currency }}</span>
        </template>
        <template #cell-movements="{ row }">
          <span class="font-display tabular-nums">{{ row.movements }}</span>
        </template>
        <template #cell-action="{ row }">
          <BaseButton
            variant="ghost"
            :aria-label="`${row.instrument ? 'Editar' : 'Configurar'} cotización de ${row.symbol}`"
            @click="open(row)"
          >
            {{ row.instrument ? 'Editar' : 'Configurar' }}
          </BaseButton>
        </template>
      </LedgerTable>
    </LedgerSurface>

    <SidePanel
      v-model:open="panelOpen"
      kicker="Cotización por símbolo"
      :title="selected?.symbol || initialSymbol || 'Nuevo símbolo'"
      title-id="settings-quote-panel-title"
    >
      <SettingsInstrumentEditor
        v-if="selected?.instrument"
        :key="selected.id"
        :instrument="selected.instrument"
      />
      <SettingsInstrumentForm
        v-else-if="panelOpen"
        :key="formKey"
        :asset-id="initialAssetId"
        :initial-symbol="initialSymbol"
        :currency="initialCurrency"
        @added="selectedId = $event"
      />
      <template #footer>
        <BaseButton @click="panelOpen = false">Cerrar</BaseButton>
      </template>
    </SidePanel>
  </section>
</template>
