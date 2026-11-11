<script setup lang="ts">
import { ref } from 'vue'

import { formatMoney } from '../../../lib/format'
import type { Entity } from '../../../scripts/types'
import { useSettingsStore } from '../../../stores/settings'
import NeonButton from '../../ui/NeonButton.vue'
import type { PendingDeletion } from './deletion'
import NeonSettingsBlock from './NeonSettingsBlock.vue'
import NeonSettingsField from './NeonSettingsField.vue'
import { DATA_ROW, HEAD_ROW, PLAIN_ROW, TABLE_SCROLL, TOTAL_FIGURE } from './table-styles'
import { parseAmount, type LiabilitiesTable } from './view-model'

// Pasivos: loans and debts with the amount they start from, edited in place.
defineProps<{ table: LiabilitiesTable }>()
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()

const settingsStore = useSettingsStore()
const COLUMNS = 'grid-cols-[minmax(0,2fr)_190px_112px]'

function rename(row: Entity, name: string): void {
  settingsStore.saveEntity('liabilities', row.id, name, row.openingBalance)
}

function rebalance(row: Entity, text: string): void {
  const value = parseAmount(text)
  if (value !== null) settingsStore.saveEntity('liabilities', row.id, row.name, value)
}

function askDelete(row: Entity): void {
  emit('ask', {
    title: '¿Eliminar este pasivo?',
    confirmLabel: 'Eliminar pasivo',
    message: `${row.name}, con su importe inicial de ${formatMoney(row.openingBalance)}. No se puede deshacer.`,
    run: () => settingsStore.removeEntity('liabilities', row.id),
  })
}

const name = ref('')
const balance = ref('')

function add(): void {
  if (settingsStore.addEntity('liabilities', name.value, String(parseAmount(balance.value) ?? 0))) {
    name.value = ''
    balance.value = ''
  }
}
</script>

<template>
  <NeonSettingsBlock
    id="pasivos"
    title="Pasivos"
    description="Préstamos y deudas con el importe del que parten."
  >
    <div :class="TABLE_SCROLL">
      <div role="table" aria-label="Pasivos y deudas" class="grid min-w-[560px]">
        <div role="row" :class="[HEAD_ROW, COLUMNS]">
          <span role="columnheader">Pasivo</span>
          <span role="columnheader" class="text-end">Importe inicial</span>
          <span />
        </div>
        <div
          v-for="row in table.rows"
          :key="row.id"
          role="row"
          :class="[DATA_ROW, COLUMNS]"
          :data-liability-id="row.id"
        >
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              :model-value="row.name"
              label="Nombre del pasivo"
              @commit="rename(row, $event)"
            />
          </span>
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              :model-value="formatMoney(row.openingBalance)"
              :label="`Importe inicial de ${row.name}`"
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
          <span role="cell" class="text-soft text-[15px] font-bold">Deuda inicial total</span>
          <span role="cell" :class="TOTAL_FIGURE" data-settings-total="pasivos">
            {{ formatMoney(table.total) }}
          </span>
          <span role="cell" />
        </div>
        <div role="row" :class="[PLAIN_ROW, COLUMNS]">
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              v-model="name"
              label="Nombre del nuevo pasivo"
              placeholder="Nuevo pasivo"
              @keydown.enter="add"
            />
          </span>
          <span role="cell">
            <NeonSettingsField
              v-model="balance"
              label="Importe inicial del nuevo pasivo"
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
