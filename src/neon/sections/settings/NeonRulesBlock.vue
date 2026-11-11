<script setup lang="ts">
import { ref } from 'vue'

import { useAccountRequirement } from '../../../composables/useAccountRequirement'
import { useRecurringStore } from '../../../stores/recurring'
import NeonButton from '../../ui/NeonButton.vue'
import NeonSwitch from '../../ui/NeonSwitch.vue'
import type { PendingDeletion } from './deletion'
import NeonRuleFormPanel from './NeonRuleFormPanel.vue'
import NeonSettingsBlock from './NeonSettingsBlock.vue'
import NeonSettingsField from './NeonSettingsField.vue'
import { DATA_ROW, HEAD_ROW, PLAIN_ROW, TABLE_SCROLL, TOTAL_FIGURE } from './table-styles'
import type { RuleRow, RulesTable } from './view-model'

// Recurrentes: the income, expense and saving rules that keep generating
// pending movements. They are paused or resumed in place; a new one is made in
// a panel. The investment purchases that repeat live in Inversión.
defineProps<{ table: RulesTable }>()
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()

const recurringStore = useRecurringStore()
const { needsAccount } = useAccountRequirement()
const COLUMNS = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px_170px_150px_112px]'

function askDelete(row: RuleRow): void {
  emit('ask', {
    title: '¿Eliminar esta regla?',
    confirmLabel: 'Eliminar regla',
    message: `${row.name}, ${row.amount}. Deja de generar pendientes; los movimientos ya registrados se mantienen. Si solo quieres detenerla, páusala.`,
    run: () => recurringStore.removeRule(row.id),
  })
}

const description = ref('')
const panelOpen = ref(false)

function startNew(): void {
  if (needsAccount.value) return
  panelOpen.value = true
}
</script>

<template>
  <NeonSettingsBlock
    id="recurrentes"
    title="Recurrentes"
    description="Reglas que generan movimientos pendientes. Las compras recurrentes viven en Inversión."
  >
    <p v-if="needsAccount" class="text-muted text-note">
      Crea una cuenta para añadir reglas recurrentes.
    </p>
    <div :class="TABLE_SCROLL">
      <div role="table" aria-label="Reglas recurrentes" class="grid min-w-[1000px]">
        <div role="row" :class="[HEAD_ROW, COLUMNS]">
          <span role="columnheader">Regla</span>
          <span role="columnheader">Frecuencia</span>
          <span role="columnheader">Próximo</span>
          <span role="columnheader" class="text-end">Importe</span>
          <span role="columnheader">Estado</span>
          <span />
        </div>
        <div
          v-for="row in table.rows"
          :key="row.id"
          role="row"
          :class="[DATA_ROW, COLUMNS]"
          :data-settings-rule-id="row.id"
        >
          <span role="cell" class="grid min-w-0">
            <span class="text-[16px] font-bold" :class="row.active ? '' : 'opacity-60'">
              {{ row.name }}
            </span>
            <span class="text-muted text-note truncate px-0">{{ row.detail }}</span>
          </span>
          <span role="cell" class="text-soft text-[15px]">{{ row.frequency }}</span>
          <span role="cell" class="text-soft text-[15px]">{{ row.next }}</span>
          <span
            role="cell"
            class="font-display justify-self-end text-[16px] font-semibold whitespace-nowrap"
            :class="row.income ? 'text-gain' : 'text-text'"
            data-settings-rule-amount
          >
            {{ row.amount }}
          </span>
          <span role="cell" class="flex items-center gap-2.5">
            <NeonSwitch
              :model-value="row.active"
              :label="`Regla ${row.name} activa`"
              @update:model-value="recurringStore.toggleRule(row.id, $event)"
            />
            <span class="text-[14px] font-bold" :class="row.active ? 'text-text' : 'text-muted'">
              {{ row.active ? 'Activa' : 'Pausada' }}
            </span>
          </span>
          <span role="cell" class="flex justify-end">
            <NeonButton
              danger
              :aria-label="`Eliminar la regla ${row.name}`"
              @click="askDelete(row)"
            >
              Eliminar
            </NeonButton>
          </span>
        </div>
        <div role="row" :class="[PLAIN_ROW, COLUMNS]">
          <span role="cell" class="text-soft text-[15px] font-bold"
            >Neto al mes de las activas</span
          >
          <span role="cell" />
          <span role="cell" />
          <span
            role="cell"
            :class="[TOTAL_FIGURE, table.net >= 0 ? 'text-gain' : 'text-loss']"
            data-settings-rules-net
          >
            {{ table.netText }}
          </span>
          <span role="cell" />
          <span role="cell" />
        </div>
        <div v-if="!needsAccount" role="row" :class="[PLAIN_ROW, COLUMNS]">
          <span role="cell" class="min-w-0">
            <NeonSettingsField
              v-model="description"
              label="Descripción de la nueva regla"
              placeholder="Nueva regla, p. ej. Alquiler"
              @keydown.enter.prevent="startNew"
            />
          </span>
          <span role="cell" />
          <span role="cell" />
          <span role="cell" />
          <span role="cell" />
          <span role="cell" class="flex justify-end">
            <NeonButton @click="startNew">Añadir</NeonButton>
          </span>
        </div>
      </div>
    </div>
    <NeonRuleFormPanel
      v-model:open="panelOpen"
      :description="description"
      @created="description = ''"
    />
  </NeonSettingsBlock>
</template>
