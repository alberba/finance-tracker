<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import ChartCanvas from '../charts/ChartCanvas.vue'
import AllocationBar from '../ui/AllocationBar.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import { TONE_TEXT, toneOf } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type {
  InvestmentDashboardViewModel,
  InvestmentPosition,
} from '../../domain/investment/view-model'
import { formatPercent, formatShortDate } from '../../lib/format'
import { renderMultiLineChart } from '../../scripts/charts'

// "02 Posiciones": allocation bar and the positions ledger, whose rows expand
// to the asset's return chart and its detail.
const props = defineProps<{ vm: InvestmentDashboardViewModel }>()

const { formatMoney, formatSignedMoney } = useMoneyFormatter()
const openPositionId = shallowRef<string | null>(null)

const signedPercent = (value: number) => formatPercent(value, { signed: true })
const share = (value: number) => formatPercent(value, { digits: 1 })

const openPosition = computed(
  () => props.vm.positions.find((position) => position.id === openPositionId.value) ?? null,
)

const drawPositionChart = computed(() => {
  const series = openPosition.value ? [openPosition.value.series] : []
  const labels = props.vm.chartLabels
  return (canvas: HTMLCanvasElement) =>
    renderMultiLineChart(canvas, series, {
      labels,
      formatValue: (value) => formatPercent(value),
      forceZeroTick: true,
    })
})

const allocation = computed(() =>
  props.vm.positions.map((position) => ({
    id: position.id,
    label: position.name,
    weight: position.weight,
    color: position.color,
    detail: formatMoney(position.value),
  })),
)
const maxWeight = computed(() => props.vm.positions[0]?.weight || 100)

const columns: LedgerColumn<InvestmentPosition>[] = [
  { key: 'name', label: 'Activo', rowHeader: true },
  { key: 'weight', label: 'Peso', hideBelow: 'md' },
  { key: 'value', label: 'Valor', align: 'right' },
  { key: 'invested', label: 'Invertido', align: 'right', hideBelow: 'sm' },
  { key: 'gain', label: 'Resultado', align: 'right', hideBelow: 'sm' },
  { key: 'return', label: 'Rentab.', align: 'right' },
]

function formatUnits(units: number | null): string {
  return units === null ? '—' : units.toLocaleString('es-ES', { maximumFractionDigits: 8 })
}
</script>

<template>
  <NumberedBlock
    number="02"
    title="Posiciones"
    title-id="inv-pos-title"
    :description="`Peso, valor y resultado de cada activo a ${formatShortDate(vm.asOf)}. Abre una fila para ver su evolución.`"
  >
    <AllocationBar
      v-if="vm.positions.length"
      id="investment-allocation"
      :segments="allocation"
      label="Distribución de la cartera por activo"
    />
    <LedgerTable
      v-model:expanded="openPositionId"
      :columns="columns"
      :rows="vm.positions"
      :row-key="(position) => position.id"
      :row-attrs="(position) => ({ 'data-position': position.id })"
      :expand-label="
        (position, open) => `${open ? 'Ocultar' : 'Ver'} evolución de ${position.name}`
      "
      label="Posiciones"
      empty-text="Aún no hay posiciones con valor en este mes."
    >
      <template #cell-name="{ row }">
        <span class="flex items-center gap-3 font-semibold">
          <span
            class="size-2.5 shrink-0 rounded-xs"
            :style="{ background: row.color }"
            aria-hidden="true"
          ></span>
          {{ row.name }}
        </span>
      </template>
      <template #cell-weight="{ row }">
        <span class="flex items-center gap-3">
          <span class="bg-line h-1.5 grow overflow-hidden rounded-full">
            <span
              class="block h-full rounded-full"
              :style="{ width: `${(row.weight / maxWeight) * 100}%`, background: row.color }"
            ></span>
          </span>
          <span class="font-display text-text-muted w-14 text-right text-sm tabular-nums">
            {{ share(row.weight) }}
          </span>
        </span>
      </template>
      <template #cell-value="{ row }">
        <span class="font-display font-medium tabular-nums">{{ formatMoney(row.value) }}</span>
      </template>
      <template #cell-invested="{ row }">
        <span class="font-display text-text-muted tabular-nums">{{ formatMoney(row.invested) }}</span>
      </template>
      <template #cell-gain="{ row }">
        <span class="font-display tabular-nums" :class="TONE_TEXT[toneOf(row.gain)]">
          {{ formatSignedMoney(row.gain) }}
        </span>
      </template>
      <template #cell-return="{ row }">
        <span class="font-display font-medium tabular-nums" :class="TONE_TEXT[toneOf(row.returnPct)]">
          {{ signedPercent(row.returnPct) }}
        </span>
      </template>

      <template #detail="{ row }">
        <div class="grid items-center gap-6 pt-2 md:grid-cols-[minmax(0,1fr)_17rem] md:gap-10">
          <div class="relative h-36">
            <ChartCanvas
              id="investment-asset-chart"
              class="block size-full"
              :draw="drawPositionChart"
              :aria-label="`Rentabilidad acumulada de ${row.name}`"
            />
          </div>
          <dl class="grid grid-cols-[auto_auto] gap-x-5 gap-y-3 text-sm" data-position-detail>
            <dt class="text-text-muted">Instrumento</dt>
            <dd class="text-right font-mono">{{ row.symbol ?? '—' }}</dd>
            <dt class="text-text-muted">Títulos</dt>
            <dd class="font-display text-right tabular-nums">{{ formatUnits(row.units) }}</dd>
            <dt class="text-text-muted">Precio medio</dt>
            <dd class="font-display text-right tabular-nums">
              {{ row.averagePrice === null ? '—' : formatMoney(row.averagePrice) }}
            </dd>
            <dt class="text-text-muted">Último movimiento</dt>
            <dd class="font-display text-right tabular-nums">
              {{ row.lastMovementDate ? formatShortDate(row.lastMovementDate) : '—' }}
            </dd>
          </dl>
        </div>
      </template>

      <template #total-name><span class="font-bold">Total</span></template>
      <template #total-weight>
        <span class="font-display text-text-muted text-sm tabular-nums">
          {{ vm.positions.length }} {{ vm.positions.length === 1 ? 'activo' : 'activos' }}
        </span>
      </template>
      <template #total-value>
        <span class="font-display font-bold tabular-nums">{{ formatMoney(vm.portfolioValue) }}</span>
      </template>
      <template #total-invested>
        <span class="font-display text-text-muted tabular-nums">
          {{ formatMoney(vm.investedCapital) }}
        </span>
      </template>
      <template #total-gain>
        <span class="font-display font-semibold tabular-nums" :class="TONE_TEXT[toneOf(vm.gain)]">
          {{ formatSignedMoney(vm.gain) }}
        </span>
      </template>
      <template #total-return>
        <span class="font-display font-bold tabular-nums" :class="TONE_TEXT[toneOf(vm.displayReturn)]">
          {{ signedPercent(vm.displayReturn) }}
        </span>
      </template>
    </LedgerTable>
  </NumberedBlock>
</template>
