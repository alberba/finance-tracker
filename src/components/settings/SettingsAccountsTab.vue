<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'

import SettingsAccountLiquidity from './SettingsAccountLiquidity.vue'
import SettingsEntityPanel from './SettingsEntityPanel.vue'
import SettingsTabIntro from './SettingsTabIntro.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import LedgerSurface from '../ui/LedgerSurface.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { buildAccountRows, type AccountRowViewModel } from '../../domain/settings/view-model'
import type { Entity } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useUiStore } from '../../stores/ui'
import { useSettingsStore } from '../../stores/settings'
import { useStockEventsStore } from '../../stores/stockevents'

// Cuentas: each liquidity account with its opening balance, whether its cash
// is portfolio liquidity for TWR and where Stock Events books that cash. The
// card opens in the side panel.
defineProps<{ isActive: boolean }>()

const financialStateStore = useFinancialStateStore()
const settingsStore = useSettingsStore()
const stockEventsStore = useStockEventsStore()
const { formatMoney } = useMoneyFormatter()

const panel = ref<InstanceType<typeof SettingsEntityPanel> | null>(null)
const uiStore = useUiStore()
function consumeSetupAction(): void {
  if (uiStore.setupAction !== 'account' || !panel.value) return
  uiStore.setupAction = null
  panel.value.openNew()
}
onMounted(consumeSetupAction)
watch(() => uiStore.setupAction, consumeSetupAction)

const pendingDelete = ref<Entity | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

const rows = computed(() => buildAccountRows(financialStateStore.state))
const total = computed(() => rows.value.reduce((sum, row) => sum + row.openingBalance, 0))
const liquidityCount = computed(() => rows.value.filter((row) => row.twrLiquidity).length)

const columns: LedgerColumn<AccountRowViewModel>[] = [
  { key: 'name', label: 'Cuenta', rowHeader: true },
  { key: 'balance', label: 'Saldo inicial', align: 'right' },
  { key: 'liquidity', label: 'Liquidez TWR', hideBelow: 'md' },
  { key: 'cash', label: 'Efectivo en Stock Events', hideBelow: 'lg' },
]

function cashListName(id: string): string {
  if (!id) return 'Sin lista'
  return stockEventsStore.watchlistName(id) || 'Lista guardada'
}

function openCard(row: AccountRowViewModel): void {
  const account = financialStateStore.accounts.find((item) => item.id === row.id)
  if (account) panel.value?.openEdit(account)
}

function confirmDelete(): void {
  if (pendingDelete.value) settingsStore.removeEntity('accounts', pendingDelete.value.id)
}
</script>

<template>
  <section
    id="settings-tab-accounts"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-accounts-button"
    data-settings-accounts
  >
    <SettingsTabIntro
      title="Cuentas de liquidez"
      description="Saldo de partida de cada cuenta y su papel en la cartera."
      action="Nueva cuenta"
      @action="panel?.openNew()"
    />

    <LedgerSurface>
      <LedgerTable
        :columns="columns"
        :rows="rows"
        :row-key="(row) => row.id"
        label="Cuentas de liquidez"
        empty-text="Aún no hay cuentas. Crea una para registrar movimientos."
        :row-attrs="(row) => ({ 'data-account-id': row.id })"
      >
        <template #cell-name="{ row }">
          <button
            type="button"
            class="hover:text-primary min-h-11 w-full text-left font-semibold"
            :aria-label="`Abrir la ficha de ${row.name}`"
            @click="openCard(row)"
          >
            {{ row.name }}
          </button>
        </template>
        <template #cell-balance="{ row }">
          <span class="font-display whitespace-nowrap tabular-nums">
            {{ formatMoney(row.openingBalance) }}
          </span>
        </template>
        <template #cell-liquidity="{ row }">
          <span :class="row.twrLiquidity ? 'text-text-main' : 'text-text-muted'">
            {{ row.twrLiquidity ? 'Incluida' : '—' }}
          </span>
        </template>
        <template #cell-cash="{ row }">
          <span :class="row.cashWatchlistId ? 'text-text-main' : 'text-text-muted'">
            {{ row.twrLiquidity ? cashListName(row.cashWatchlistId) : '—' }}
          </span>
        </template>
        <template #total-name>
          <span class="text-text-muted text-sm font-semibold">Saldo inicial total</span>
        </template>
        <template #total-balance>
          <span class="font-display font-semibold whitespace-nowrap tabular-nums">
            {{ formatMoney(total) }}
          </span>
        </template>
        <template #total-liquidity>
          <span class="text-text-muted text-sm">
            {{ liquidityCount === 1 ? '1 cuenta' : `${liquidityCount} cuentas` }} en cartera
          </span>
        </template>
      </LedgerTable>
    </LedgerSurface>

    <SettingsEntityPanel
      ref="panel"
      entity-key="accounts"
      panel-id="settings-account-panel"
      kicker="Cuenta de liquidez"
      new-title="Nueva cuenta"
      create-label="Crear cuenta"
      balance-label="Saldo inicial"
      @delete="pendingDelete = $event"
    >
      <template #default="{ entity }">
        <SettingsAccountLiquidity :account-id="entity.id" />
      </template>
    </SettingsEntityPanel>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar esta cuenta?"
      title-id="settings-account-delete-title"
      confirm-label="Eliminar cuenta"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ pendingDelete.name }}, con su saldo inicial de
        {{ formatMoney(pendingDelete.openingBalance) }}. También se borran sus movimientos y
        suscripciones. No se puede deshacer.
      </template>
    </ConfirmDialog>
  </section>
</template>
