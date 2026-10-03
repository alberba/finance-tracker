<script setup lang="ts">
import { computed, ref } from 'vue'

import SettingsAssetDetails from './SettingsAssetDetails.vue'
import SettingsEntityPanel from './SettingsEntityPanel.vue'
import SettingsSymbolSync from './SettingsSymbolSync.vue'
import SettingsTabIntro from './SettingsTabIntro.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import FilterChip from '../ui/FilterChip.vue'
import LedgerSurface from '../ui/LedgerSurface.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import StatusDot from '../ui/StatusDot.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useSettingsAssets, type SettingsAssetRow } from '../../composables/useSettingsAssets'
import { INSTRUMENT_TYPE_LABEL, providerLabel } from '../../domain/investment/instrument-labels'
import type { Entity } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSettingsStore } from '../../stores/settings'
import { useStockEventsStore } from '../../stores/stockevents'

// Activos: each investment asset with its opening value, where its quote comes
// from, its movements and how it reaches Stock Events. Its card, in the side
// panel, gathers all of it. Symbols in movements that no asset claims are
// listed apart so they can still be synced or hidden.
defineProps<{ isActive: boolean }>()

const financialStateStore = useFinancialStateStore()
const settingsStore = useSettingsStore()
const stockEventsStore = useStockEventsStore()
const { formatMoney } = useMoneyFormatter()
const { assets, orphanRows } = useSettingsAssets()

const panel = ref<InstanceType<typeof SettingsEntityPanel> | null>(null)
const pendingDelete = ref<Entity | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})
const showHidden = ref(false)

const total = computed(() => assets.value.reduce((sum, asset) => sum + asset.openingBalance, 0))
const visibleOrphans = computed(() => orphanRows.value.filter((row) => !row.hidden))
const hiddenOrphans = computed(() => orphanRows.value.filter((row) => row.hidden))

const columns: LedgerColumn<SettingsAssetRow>[] = [
  { key: 'name', label: 'Activo', rowHeader: true },
  { key: 'quote', label: 'Cotización', hideBelow: 'md' },
  { key: 'movements', label: 'Movimientos', align: 'right', hideBelow: 'lg' },
  { key: 'sync', label: 'Stock Events', hideBelow: 'lg' },
  { key: 'balance', label: 'Valor inicial', align: 'right' },
]

function kindOf(asset: SettingsAssetRow): string {
  const first = asset.instruments[0]
  return first ? `${INSTRUMENT_TYPE_LABEL[first.type]} · ${first.currency}` : 'Sin cotización'
}

function listsOf(asset: SettingsAssetRow): string {
  const names = asset.syncRows
    .filter((row) => row.sync && row.watchlistId)
    .map((row) => stockEventsStore.watchlistName(row.watchlistId))
  return [...new Set(names.filter(Boolean))].join(', ')
}

function openCard(asset: SettingsAssetRow): void {
  const entity = financialStateStore.investmentAssets.find((item) => item.id === asset.id)
  if (entity) panel.value?.openEdit(entity)
}

function confirmDelete(): void {
  if (pendingDelete.value) settingsStore.removeEntity('investmentAssets', pendingDelete.value.id)
}
</script>

<template>
  <section
    id="settings-tab-assets"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-assets-button"
    data-settings-assets
  >
    <SettingsTabIntro
      title="Activos de inversión"
      description="Valor de partida, de dónde sale su cotización y cómo llega a Stock Events."
      action="Nuevo activo"
      @action="panel?.openNew()"
    />

    <LedgerSurface>
      <LedgerTable
        :columns="columns"
        :rows="assets"
        :row-key="(asset) => asset.id"
        label="Activos de inversión"
        empty-text="Aún no hay activos. Crea uno para registrar inversiones."
        :row-attrs="(asset) => ({ 'data-asset-id': asset.id })"
      >
        <template #cell-name="{ row }">
          <button
            type="button"
            class="group grid min-h-11 w-full gap-0.5 text-left"
            :aria-label="`Abrir la ficha de ${row.name}`"
            @click="openCard(row)"
          >
            <span class="group-hover:text-primary font-semibold">{{ row.name }}</span>
            <span class="text-text-muted text-sm">{{ kindOf(row) }}</span>
          </button>
        </template>
        <template #cell-quote="{ row }">
          <span v-if="row.instruments.length" class="grid gap-0.5">
            <span class="font-mono font-medium">
              {{ row.instruments[0].symbol }}
              <span v-if="row.instruments.length > 1" class="text-text-muted text-sm font-normal">
                +{{ row.instruments.length - 1 }}
              </span>
            </span>
            <span class="text-text-muted text-sm">{{
              providerLabel(row.instruments[0].provider)
            }}</span>
          </span>
          <span v-else class="text-text-muted">Sin cotización</span>
        </template>
        <template #cell-movements="{ row }">
          <span class="grid justify-items-end gap-0.5 whitespace-nowrap">
            <span>
              <span class="font-display tabular-nums">{{ row.linked }}</span>
              <span class="text-text-muted text-sm"> vinculados</span>
            </span>
            <span v-if="row.pending" class="text-sm">
              <StatusDot tone="warn" :label="`${row.pending} por vincular`" />
            </span>
          </span>
        </template>
        <template #cell-sync="{ row }">
          <span class="grid gap-0.5">
            <span class="text-sm font-semibold">
              <StatusDot v-if="row.sync.tone" :tone="row.sync.tone" :label="row.sync.label" />
              <span v-else class="text-text-muted font-normal">{{ row.sync.label }}</span>
            </span>
            <span v-if="listsOf(row)" class="text-text-muted text-sm">{{ listsOf(row) }}</span>
          </span>
        </template>
        <template #cell-balance="{ row }">
          <span class="font-display whitespace-nowrap tabular-nums">
            {{ formatMoney(row.openingBalance) }}
          </span>
        </template>
        <template #total-name>
          <span class="text-text-muted text-sm font-semibold">Valor inicial total</span>
        </template>
        <template #total-balance>
          <span class="font-display font-semibold whitespace-nowrap tabular-nums">
            {{ formatMoney(total) }}
          </span>
        </template>
      </LedgerTable>
    </LedgerSurface>

    <section
      v-if="orphanRows.length"
      class="grid gap-4"
      aria-labelledby="settings-orphan-symbols-title"
      data-orphan-symbols
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="grid gap-1">
          <h4
            id="settings-orphan-symbols-title"
            class="font-display text-text-main text-lg font-bold"
          >
            Símbolos sin activo
          </h4>
          <p class="text-text-muted text-sm">
            Aparecen en movimientos cuya categoría no es ningún activo. Puedes sincronizarlos u
            ocultarlos.
          </p>
        </div>
        <FilterChip
          v-if="hiddenOrphans.length"
          v-model="showHidden"
          :label="`Mostrar ocultos (${hiddenOrphans.length})`"
        />
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <SettingsSymbolSync
          v-for="row in showHidden ? orphanRows : visibleOrphans"
          :key="row.symbol"
          :row="row"
          hideable
        />
      </div>
      <p v-if="!showHidden && !visibleOrphans.length" class="text-text-muted text-sm">
        Todos están ocultos.
      </p>
    </section>

    <SettingsEntityPanel
      ref="panel"
      entity-key="investmentAssets"
      panel-id="settings-asset-panel"
      kicker="Activo de inversión"
      new-title="Nuevo activo"
      create-label="Crear activo"
      balance-label="Valor inicial"
      @delete="pendingDelete = $event"
    >
      <template #default="{ entity }">
        <SettingsAssetDetails :asset-id="entity.id" />
      </template>
    </SettingsEntityPanel>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar este activo?"
      title-id="settings-asset-delete-title"
      confirm-label="Eliminar activo"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ pendingDelete.name }}, con su valor inicial de
        {{ formatMoney(pendingDelete.openingBalance) }}. Se quitan también sus instrumentos de
        cotización; sus movimientos se conservan. No se puede deshacer.
      </template>
    </ConfirmDialog>
  </section>
</template>
