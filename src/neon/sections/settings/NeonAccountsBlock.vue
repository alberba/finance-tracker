<script setup lang="ts">
import { ref } from 'vue'

import { formatMoney } from '../../../lib/format'
import { useToast } from '../../../composables/useToast'
import { useSettingsStore } from '../../../stores/settings'
import NeonButton from '../../ui/NeonButton.vue'
import NeonSettingsBlock from './NeonSettingsBlock.vue'
import NeonSettingsField from './NeonSettingsField.vue'
import { DATA_ROW, HEAD_ROW, PLAIN_ROW, TABLE_SCROLL, TOTAL_FIGURE } from './table-styles'
import { openingBalanceText, parseAmount, type AccountRow, type AccountsTable } from './view-model'
import type { PendingDeletion } from './deletion'

// Cuentas: the starting balance of each account and whether its cash counts as
// liquidity of the portfolio. Name and balance are edited in place.
defineProps<{ table: AccountsTable }>()
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()

const settingsStore = useSettingsStore()
const { showToast } = useToast()
const COLUMNS = 'grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)_190px_112px]'

function rename(row: AccountRow, name: string): void {
  settingsStore.saveEntity('accounts', row.id, name, row.openingBalance)
}

function rebalance(row: AccountRow, text: string): void {
  const value = parseAmount(text)
  if (value !== null) settingsStore.saveEntity('accounts', row.id, row.name, value)
}

function askDelete(row: AccountRow): void {
  emit('ask', {
    title: '¿Eliminar esta cuenta?',
    confirmLabel: 'Eliminar cuenta',
    message: `${row.name}, con su saldo inicial de ${formatMoney(row.openingBalance)}. Se eliminan también sus movimientos y suscripciones. No se puede deshacer.`,
    run: () => settingsStore.removeEntity('accounts', row.id),
  })
}

const name = ref('')
const balance = ref('')

function add(): void {
  const opening = openingBalanceText(balance.value)
  if (opening === null) return void showToast('El saldo inicial no es un número.')
  if (settingsStore.addEntity('accounts', name.value, opening)) {
    name.value = ''
    balance.value = ''
  }
}
</script>

<template>
  <NeonSettingsBlock
    id="cuentas"
    title="Cuentas"
    description="Saldo de partida de cada cuenta y si cuenta como liquidez de la cartera."
  >
    <div :class="TABLE_SCROLL">
      <div role="table" aria-label="Cuentas de liquidez" class="grid min-w-[760px]">
        <div role="row" :class="[HEAD_ROW, COLUMNS]">
          <span role="columnheader">Nombre</span>
          <span role="columnheader">Liquidez</span>
          <span role="columnheader">Lista de efectivo</span>
          <span role="columnheader" class="text-end">Saldo inicial</span>
          <span />
        </div>
        <div
          v-for="row in table.rows"
          :key="row.id"
          role="row"
          :class="[DATA_ROW, COLUMNS]"
          :data-account-id="row.id"
        >
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              :model-value="row.name"
              label="Nombre de la cuenta"
              @commit="rename(row, $event)"
            />
          </span>
          <span role="cell" class="text-[15px]" :class="row.liquidity === '—' ? 'text-muted' : ''">
            {{ row.liquidity }}
          </span>
          <span
            role="cell"
            class="min-w-0 truncate text-[15px]"
            :class="row.list === '—' ? 'text-muted' : ''"
          >
            {{ row.list }}
          </span>
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              :model-value="formatMoney(row.openingBalance)"
              :label="`Saldo inicial de ${row.name}`"
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
          <span role="cell" class="text-soft text-[15px] font-bold">Saldo inicial total</span>
          <span role="cell" class="text-muted text-[15px]">{{ table.liquidityNote }}</span>
          <span role="cell" />
          <span role="cell" :class="TOTAL_FIGURE" data-settings-total="cuentas">
            {{ formatMoney(table.total) }}
          </span>
          <span role="cell" />
        </div>
        <div role="row" :class="[PLAIN_ROW, COLUMNS]">
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              v-model="name"
              label="Nombre de la nueva cuenta"
              placeholder="Nueva cuenta"
              @keydown.enter="add"
            />
          </span>
          <span role="cell" />
          <span role="cell" />
          <span role="cell">
            <NeonSettingsField
              v-model="balance"
              label="Saldo inicial de la nueva cuenta"
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
