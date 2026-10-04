<script setup lang="ts">
import { computed } from 'vue'

import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import PillTag from '../ui/PillTag.vue'
import { dueLabel, monthsLabel } from './goal-text'
import type { GoalRowViewModel } from '../../domain/goals/view-model'
import { formatPercent } from '../../lib/format'
import type { GoalKey } from '../../scripts/types'

// The goals of one block as a ledger. With a `cursor` the bars share one scale
// (each track as long as its target, the cursor where the measured figure
// stands, crossing every row); without it, each bar runs on its own target.
const props = defineProps<{
  rows: GoalRowViewModel[]
  label: string
  formatMoney: (value: number) => string
  /** Shared scale: where the measured figure sits on it (0–100) and its label. */
  cursor?: { left: number; label: string }
}>()

defineEmits<{ edit: [key: GoalKey] }>()

const columns = computed<LedgerColumn<GoalRowViewModel>[]>(() => [
  { key: 'name', label: 'Objetivo', rowHeader: true },
  { key: 'due', label: 'Plazo', hideBelow: 'md' },
  { key: 'scale', label: props.cursor ? 'Escala común' : 'Valor actual' },
  { key: 'progress', label: 'Progreso', align: 'right', hideBelow: 'sm' },
  { key: 'target', label: 'Meta', align: 'right', hideBelow: 'lg' },
  { key: 'remaining', label: 'Faltan', align: 'right', hideBelow: 'md' },
  { key: 'monthly', label: 'Al mes', align: 'right', hideBelow: 'md' },
  { key: 'action', label: 'Acción', align: 'right' },
])

// The cursor chip starts at the cursor line and grows away from the nearer
// edge, so it never leaves its column nor covers the header beside it.
const chipAnchor = computed(() =>
  (props.cursor?.left ?? 0) > 60 ? 'sm:-translate-x-full' : 'sm:translate-x-0',
)

// Below md the hidden columns fold under the name: progress and monthly amount.
function compactDetail(row: GoalRowViewModel): string {
  const progress = formatPercent(row.progress)
  if (row.met) return `${progress} · cumplida`
  return `${progress} · ${props.formatMoney(row.monthlyNeeded)}/mes`
}

function rowAttrs(row: GoalRowViewModel): Record<string, string> {
  return {
    'data-goal-row': row.key,
    'data-goal-state': row.defined ? (row.met ? 'met' : 'pending') : 'undefined',
  }
}
</script>

<template>
  <LedgerTable
    :columns="columns"
    :rows="rows"
    :row-key="(row) => row.key"
    :label="label"
    :row-attrs="rowAttrs"
  >
    <template v-if="cursor" #head-scale>
      <!-- On a phone the column is too narrow to place the chip on the scale. -->
      <span class="relative block sm:h-6 sm:min-w-32 lg:min-w-40">
        <span class="sr-only">Escala común</span>
        <span
          class="bg-text-main text-panel font-display inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-normal whitespace-nowrap normal-case tabular-nums sm:absolute sm:bottom-0"
          :class="chipAnchor"
          :style="{ left: `${cursor.left}%` }"
          data-goal-cursor
        >
          {{ cursor.label }}
        </span>
      </span>
    </template>
    <template #head-action><span class="sr-only">Acción</span></template>

    <template #cell-name="{ row }">
      <span class="flex min-w-0 items-center gap-2.5" :class="row.child ? 'pl-1.5' : ''">
        <span
          v-if="row.child"
          class="border-line-strong -mt-2.5 h-3.5 w-2.5 shrink-0 rounded-bl-sm border-b-[1.5px] border-l-[1.5px]"
          aria-hidden="true"
        ></span>
        <span class="grid min-w-0 gap-0.5">
          <span class="text-text-main" :class="row.child ? 'font-medium' : 'font-semibold'">
            {{ row.name }}
          </span>
          <span class="text-text-muted text-sm">
            <span class="hidden md:inline">{{ row.slot }}</span>
            <span class="font-display grid md:hidden" data-goal-compact>
              <span>{{ row.defined ? dueLabel(row.goal.targetYear) : 'Sin definir' }}</span>
              <span v-if="row.defined">{{ compactDetail(row) }}</span>
            </span>
          </span>
        </span>
      </span>
    </template>

    <template #cell-due="{ row }">
      <span class="grid gap-0.5 whitespace-nowrap">
        <span class="font-display tabular-nums">{{ dueLabel(row.goal.targetYear) }}</span>
        <span class="text-text-muted text-sm">{{ monthsLabel(row.monthsLeft) }}</span>
      </span>
    </template>

    <template #cell-scale="{ row }">
      <span
        v-if="cursor"
        class="relative -my-2 block h-14 min-w-24 sm:min-w-32 lg:min-w-40"
        :aria-hidden="row.defined"
      >
        <span
          v-if="!row.defined"
          class="text-text-muted absolute top-1/2 -translate-y-1/2 pl-3 text-sm"
        >
          Sin definir
        </span>
        <span
          v-if="row.defined"
          class="bg-line absolute top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full"
          :style="{ width: `${row.track}%` }"
        >
          <span
            class="bg-text-muted block h-full rounded-full"
            :style="{ width: `${row.progress}%` }"
          ></span>
        </span>
        <span
          v-if="row.defined"
          class="bg-text-muted absolute top-1/2 -ml-px h-4 w-0.5 -translate-y-1/2 rounded-full"
          :style="{ left: `${row.track}%` }"
        ></span>
        <span
          class="border-text-main absolute inset-y-0 border-l-[1.5px] border-dashed"
          :style="{ left: `${cursor.left}%` }"
          data-goal-cursor-line
        ></span>
      </span>
      <span v-else-if="!row.defined" class="text-text-muted text-sm">Sin definir</span>
      <span v-else class="flex min-w-24 items-center gap-3.5 sm:min-w-32">
        <span class="bg-line h-1.5 grow overflow-hidden rounded-full" aria-hidden="true">
          <span
            class="bg-text-muted block h-full rounded-full"
            :style="{ width: `${row.progress}%` }"
          ></span>
        </span>
        <span
          class="font-display text-text-muted hidden text-sm whitespace-nowrap tabular-nums sm:inline"
        >
          {{ formatMoney(row.current) }}
        </span>
      </span>
    </template>

    <template #cell-progress="{ row }">
      <span class="font-display font-medium whitespace-nowrap tabular-nums">
        {{ row.defined ? formatPercent(row.progress) : '—' }}
      </span>
    </template>

    <template #cell-target="{ row }">
      <span class="font-display text-text-muted whitespace-nowrap tabular-nums">
        {{ row.defined ? formatMoney(row.target) : '—' }}
      </span>
    </template>

    <template #cell-remaining="{ row }">
      <span v-if="row.met" class="grid justify-items-end gap-0.5">
        <PillTag tone="gain">Cumplida</PillTag>
        <span class="font-display text-gain text-sm whitespace-nowrap tabular-nums">
          +{{ formatMoney(-row.remaining) }}
        </span>
      </span>
      <span v-else class="font-display font-medium whitespace-nowrap tabular-nums">
        {{ row.defined ? formatMoney(row.remaining) : '—' }}
      </span>
    </template>

    <template #cell-monthly="{ row }">
      <span class="font-display font-medium whitespace-nowrap tabular-nums">
        {{ row.defined && !row.met ? formatMoney(row.monthlyNeeded) : '—' }}
      </span>
    </template>

    <template #cell-action="{ row }">
      <IconButton
        :label="row.defined ? `Editar ${row.name}` : `Definir ${row.name}`"
        icon="edit"
        @click="$emit('edit', row.key)"
      />
    </template>
  </LedgerTable>
</template>
