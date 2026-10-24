<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import type { SavingGoalRowViewModel } from '../../domain/goals/view-model'
import { formatPercent } from '../../lib/format'

// The user's savings goals as a ledger: what each category has saved against its target.
defineProps<{
  rows: SavingGoalRowViewModel[]
  formatMoney: (value: number) => string
}>()

defineEmits<{ add: []; edit: [id: string] }>()

const columns: LedgerColumn<SavingGoalRowViewModel>[] = [
  { key: 'name', label: 'Objetivo', rowHeader: true },
  { key: 'progress', label: 'Progreso' },
  { key: 'saved', label: 'Ahorrado', align: 'right', hideBelow: 'sm' },
  { key: 'target', label: 'Meta', align: 'right', hideBelow: 'md' },
  { key: 'remaining', label: 'Faltan', align: 'right', hideBelow: 'md' },
  { key: 'action', label: 'Acción', align: 'right' },
]

function rowAttrs(row: SavingGoalRowViewModel): Record<string, string> {
  return { 'data-saving-goal-row': row.id, 'data-goal-state': row.met ? 'met' : 'pending' }
}
</script>

<template>
  <div class="grid gap-4" data-saving-goals>
    <LedgerTable
      v-if="rows.length"
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      label="Objetivos de ahorro"
      :row-attrs="rowAttrs"
    >
      <template #head-action><span class="sr-only">Acción</span></template>

      <template #cell-name="{ row }">
        <span class="grid min-w-0 gap-0.5">
          <span class="text-text-main font-semibold">{{ row.name }}</span>
          <span class="text-text-muted text-sm">{{ row.category }}</span>
        </span>
      </template>

      <template #cell-progress="{ row }">
        <span class="flex min-w-24 items-center gap-3.5 sm:min-w-32">
          <span class="bg-line h-1.5 grow overflow-hidden rounded-full" aria-hidden="true">
            <span
              class="bg-saving block h-full rounded-full"
              :style="{ width: `${row.progress}%` }"
            ></span>
          </span>
          <span class="font-display text-text-muted text-sm whitespace-nowrap tabular-nums">
            {{ formatPercent(row.progress) }}
          </span>
        </span>
      </template>

      <template #cell-saved="{ row }">
        <span class="font-display whitespace-nowrap tabular-nums">{{
          formatMoney(row.saved)
        }}</span>
      </template>

      <template #cell-target="{ row }">
        <span class="font-display text-text-muted whitespace-nowrap tabular-nums">
          {{ formatMoney(row.target) }}
        </span>
      </template>

      <template #cell-remaining="{ row }">
        <span class="font-display text-text-muted whitespace-nowrap tabular-nums">
          {{ row.met ? 'Cumplido' : formatMoney(row.remaining) }}
        </span>
      </template>

      <template #cell-action="{ row }">
        <IconButton :label="`Editar ${row.name}`" @click="$emit('edit', row.id)">
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
          </svg>
        </IconButton>
      </template>
    </LedgerTable>
    <p v-else class="text-text-muted text-sm" data-saving-goals-empty>
      Aún no tienes objetivos de ahorro. Crea uno y se medirá con los ahorros de su categoría.
    </p>
    <div>
      <BaseButton data-saving-goal-add @click="$emit('add')">Nuevo objetivo de ahorro</BaseButton>
    </div>
  </div>
</template>
