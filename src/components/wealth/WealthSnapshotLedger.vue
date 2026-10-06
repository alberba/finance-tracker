<script setup lang="ts">
import { computed } from 'vue'

import {
  formatSnapshotInput,
  GROUP_SIGN,
  parseSnapshotInput,
  snapshotKey,
  type SnapshotGroupViewModel,
  type SnapshotRowViewModel,
  type SnapshotTotals,
} from '../../domain/wealth/view-model'
import type { SnapshotKind } from '../../scripts/types'
import IconButton from '../ui/IconButton.vue'
import LedgerInput from '../ui/LedgerInput.vue'
import LedgerTable, { type LedgerColumn, type LedgerGroup } from '../ui/LedgerTable.vue'
import { GROUP_SWATCH } from './group-swatch'

// The snapshot of a month as one editable ledger grouped into liquidity,
// investment and debt. The snapshot cell reads as text until hovered or
// focused; an empty cell falls back to the calculated balance.
const props = defineProps<{
  groups: SnapshotGroupViewModel[]
  inputs: Record<string, string>
  totals: SnapshotTotals
  formatMoney: (value: number) => string
}>()

const emit = defineEmits<{
  update: [key: string, value: string]
  calculate: [kind: SnapshotKind, row: SnapshotRowViewModel]
}>()

interface Row extends SnapshotRowViewModel {
  kind: SnapshotKind
  key: string
}

const columns: LedgerColumn<Row>[] = [
  { key: 'name', label: 'Cuenta o activo', rowHeader: true },
  { key: 'opening', label: 'Apertura', align: 'right', hideBelow: 'md' },
  { key: 'calculated', label: 'Calculado', align: 'right', hideBelow: 'sm' },
  { key: 'snapshot', label: 'Snapshot', align: 'right' },
  { key: 'actions', label: 'Acciones', align: 'right' },
]

const ledgerGroups = computed<LedgerGroup<Row>[]>(() =>
  props.groups.map((group) => {
    const count = group.rows.length
    const noun = count === 1 ? group.unit[0] : group.unit[1]
    return {
      key: group.kind,
      title: group.title,
      summary: `${count} ${noun} · ${props.formatMoney(GROUP_SIGN[group.kind] * props.totals[group.kind])}`,
      rows: group.rows.map((row) => ({
        ...row,
        kind: group.kind,
        key: snapshotKey(group.kind, row.id),
      })),
    }
  }),
)

function isInvalid(key: string): boolean {
  return Number.isNaN(parseSnapshotInput(props.inputs[key] ?? ''))
}
</script>

<template>
  <LedgerTable
    :columns="columns"
    :groups="ledgerGroups"
    :row-key="(row) => row.key"
    :row-attrs="(row) => ({ 'data-snapshot-row': row.kind, 'data-snapshot-id': row.id })"
    label="Saldos del snapshot"
    empty-text="Aún no hay cuentas, activos ni deudas. Añádelos en Configuración."
  >
    <template #head-actions><span class="sr-only">Acciones</span></template>
    <template #cell-name="{ row }">
      <span class="flex min-w-0 items-center gap-2.5 font-semibold">
        <span
          class="size-2 shrink-0 rounded-xs"
          :class="GROUP_SWATCH[row.kind]"
          aria-hidden="true"
        ></span>
        <span class="truncate">{{ row.name }}</span>
      </span>
    </template>
    <template #cell-opening="{ row }">
      <span class="font-display text-text-muted tabular-nums">{{ formatMoney(row.opening) }}</span>
    </template>
    <template #cell-calculated="{ row }">
      <span class="font-display tabular-nums">{{ formatMoney(row.calculated) }}</span>
    </template>
    <template #cell-snapshot="{ row }">
      <span class="ml-auto flex max-w-52 min-w-28 items-center gap-1.5">
        <LedgerInput
          :label="`Snapshot de ${row.name}`"
          :value="inputs[row.key]"
          :name="`snapshot-${row.key}`"
          :placeholder="formatSnapshotInput(row.calculated)"
          :aria-invalid="isInvalid(row.key)"
          data-snapshot-input
          @input="emit('update', row.key, ($event.target as HTMLInputElement).value)"
        />
        <span class="font-display text-text-muted text-sm" aria-hidden="true">€</span>
      </span>
    </template>
    <template #cell-actions="{ row }">
      <IconButton
        :label="`Calcular el saldo de ${row.name}`"
        icon="calculator"
        @click="emit('calculate', row.kind, row)"
      />
    </template>
    <template #total-name>
      <span class="font-display text-lg font-bold">Total del snapshot</span>
    </template>
    <template #total-snapshot>
      <span class="font-display pr-5 text-lg font-semibold whitespace-nowrap tabular-nums">
        {{ formatMoney(totals.net) }}
      </span>
    </template>
  </LedgerTable>
</template>
