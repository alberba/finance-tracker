<script setup lang="ts">
import { computed, ref } from 'vue'

import SettingsEntityPanel from './SettingsEntityPanel.vue'
import SettingsTabIntro from './SettingsTabIntro.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import LedgerSurface from '../ui/LedgerSurface.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { Entity } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSettingsStore } from '../../stores/settings'

// Pasivos: loans and debts with the amount they started from.
defineProps<{ isActive: boolean }>()

const financialStateStore = useFinancialStateStore()
const settingsStore = useSettingsStore()
const { formatMoney } = useMoneyFormatter()

const panel = ref<InstanceType<typeof SettingsEntityPanel> | null>(null)
const pendingDelete = ref<Entity | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

const rows = computed(() => financialStateStore.state.liabilities)
const total = computed(() => rows.value.reduce((sum, row) => sum + row.openingBalance, 0))

const columns: LedgerColumn<Entity>[] = [
  { key: 'name', label: 'Pasivo', rowHeader: true },
  { key: 'balance', label: 'Importe inicial', align: 'right' },
]

function confirmDelete(): void {
  if (pendingDelete.value) settingsStore.removeEntity('liabilities', pendingDelete.value.id)
}
</script>

<template>
  <section
    id="settings-tab-liabilities"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-liabilities-button"
    data-settings-liabilities
  >
    <SettingsTabIntro
      title="Pasivos y deudas"
      description="Préstamos y deudas con el importe del que parten."
      action="Nuevo pasivo"
      @action="panel?.openNew()"
    />

    <LedgerSurface>
      <LedgerTable
        :columns="columns"
        :rows="rows"
        :row-key="(row) => row.id"
        label="Pasivos y deudas"
        empty-text="Aún no hay pasivos. Añade un préstamo o una deuda si tienes alguno."
        :row-attrs="(row) => ({ 'data-liability-id': row.id })"
      >
        <template #cell-name="{ row }">
          <button
            type="button"
            class="hover:text-primary min-h-11 w-full text-left font-semibold"
            :aria-label="`Abrir la ficha de ${row.name}`"
            @click="panel?.openEdit(row)"
          >
            {{ row.name }}
          </button>
        </template>
        <template #cell-balance="{ row }">
          <span class="font-display whitespace-nowrap tabular-nums">
            {{ formatMoney(row.openingBalance) }}
          </span>
        </template>
        <template #total-name>
          <span class="text-text-muted text-sm font-semibold">Deuda inicial total</span>
        </template>
        <template #total-balance>
          <span class="font-display font-semibold whitespace-nowrap tabular-nums">
            {{ formatMoney(total) }}
          </span>
        </template>
      </LedgerTable>
    </LedgerSurface>

    <SettingsEntityPanel
      ref="panel"
      entity-key="liabilities"
      panel-id="settings-liability-panel"
      kicker="Pasivo"
      new-title="Nuevo pasivo"
      create-label="Crear pasivo"
      balance-label="Importe inicial"
      @delete="pendingDelete = $event"
    />

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar este pasivo?"
      title-id="settings-liability-delete-title"
      confirm-label="Eliminar pasivo"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ pendingDelete.name }}, con su importe inicial de
        {{ formatMoney(pendingDelete.openingBalance) }}. No se puede deshacer.
      </template>
    </ConfirmDialog>
  </section>
</template>
