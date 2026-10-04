<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import BitvavoMovementDetails from './BitvavoMovementDetails.vue'
import InvestmentMovementPanel from './InvestmentMovementPanel.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import FigureStrip, { type FigureStripItem } from '../ui/FigureStrip.vue'
import FilterChip from '../ui/FilterChip.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn, type LedgerGroup } from '../ui/LedgerTable.vue'
import PillTag from '../ui/PillTag.vue'
import { TONE_TEXT } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { InvestmentMovementRow } from '../../domain/investment/view-model'
import type { Transaction } from '../../scripts/types'
import { formatDayMonth, formatMonthYear, formatNumber } from '../../lib/format'
import { useInvestmentStore } from '../../stores/investment'
import { useStockEventsStore } from '../../stores/stockevents'
import { useUiStore } from '../../stores/ui'

// The Movimientos tab: the year and the "only undeclared" filter, the year's
// figures and its movements by month, each month with its count and net.
// Creating and editing happen in the side panel.
defineProps<{ isActive: boolean }>()

const investmentStore = useInvestmentStore()
const stockEventsStore = useStockEventsStore()
const ui = useUiStore().ui
const { movementMonthGroups, yearSummary, yearOptions } = storeToRefs(investmentStore)
const { formatMoney } = useMoneyFormatter()

const panel = ref<InstanceType<typeof InvestmentMovementPanel> | null>(null)
const pendingDelete = ref<InvestmentMovementRow | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

const year = computed({
  get: () => ui.investmentYearFilter,
  set: (value: number) => investmentStore.setYearFilter(value),
})
const onlyUndeclared = computed({
  get: () => ui.investmentOnlyUndeclared,
  set: (value: boolean) => investmentStore.setOnlyUndeclared(value),
})
const yearSelectOptions = computed(() =>
  yearOptions.value.map((value) => ({ value, label: String(value) })),
)

const figures = computed<FigureStripItem[]>(() => [
  { label: `Comprado en ${ui.investmentYearFilter}`, value: formatMoney(yearSummary.value.bought) },
  { label: 'Vendido', value: formatMoney(yearSummary.value.sold) },
  { label: 'Comisiones', value: formatMoney(yearSummary.value.fees) },
  {
    label: 'Sin declarar',
    value: String(yearSummary.value.pending),
    suffix: yearSummary.value.pending === 1 ? 'movimiento' : 'movimientos',
  },
])

const groups = computed<LedgerGroup<InvestmentMovementRow>[]>(() =>
  movementMonthGroups.value.map((group) => ({
    key: String(group.month),
    title: formatMonthYear(group.month, ui.investmentYearFilter),
    summary: `${group.count} ${group.count === 1 ? 'movimiento' : 'movimientos'} · ${
      group.net >= 0 ? 'neto invertido' : 'neto retirado'
    } ${formatMoney(Math.abs(group.net))}`,
    rows: group.rows,
  })),
)

const columns: LedgerColumn<InvestmentMovementRow>[] = [
  { key: 'date', label: 'Fecha', hideBelow: 'sm' },
  { key: 'asset', label: 'Activo', rowHeader: true },
  { key: 'units', label: 'Títulos', align: 'right', hideBelow: 'lg' },
  { key: 'currency', label: 'Moneda', hideBelow: 'lg' },
  { key: 'fee', label: 'Comisión', align: 'right', hideBelow: 'lg' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'broker', label: 'Broker', hideBelow: 'md', value: (row) => row.account },
  { key: 'declared', label: 'Declaración' },
  { key: 'actions', label: 'Acciones', align: 'right', hideBelow: 'sm' },
]

const emptyText = computed(() =>
  ui.investmentOnlyUndeclared
    ? `Todo declarado en ${ui.investmentYearFilter}. No queda ningún movimiento pendiente.`
    : `Aún no hay movimientos de inversión en ${ui.investmentYearFilter}.`,
)

function nameOf(row: InvestmentMovementRow): string {
  return `${row.sideLabel.toLowerCase()} de ${row.symbol} del ${formatDayMonth(row.tx.date)}`
}

function formatUnits(value: number | undefined): string {
  const units = Number(value) || 0
  const digits = units > 0 && units < 1 ? 5 : 4
  return formatNumber(units, digits)
}

function requestDelete(tx: Transaction): void {
  if (tx.remoteOperation) return
  pendingDelete.value = investmentStore.movementRows.find((row) => row.tx.id === tx.id) ?? null
}

function confirmDelete(): void {
  if (pendingDelete.value) investmentStore.deleteMovement(pendingDelete.value.tx.id)
}
</script>

<template>
  <div
    id="investment-tab-movements"
    class="grid content-start gap-6"
    :hidden="!isActive"
    data-investment-tab-panel="movements"
    role="tabpanel"
  >
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <BaseSelect
          id="investment-year-filter"
          v-model="year"
          label="Año"
          name="investmentYearFilter"
          :options="yearSelectOptions"
          class="w-28"
        />
        <FilterChip
          v-model="onlyUndeclared"
          label="Solo no declarados"
          data-investment-only-undeclared
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <BaseButton
          id="investment-movement-new"
          variant="primary"
          class="max-sm:w-full"
          @click="panel?.openNew()"
        >
          <svg
            class="size-4.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo movimiento
        </BaseButton>
      </div>
    </div>

    <section
      class="border-line bg-panel rounded-lg border px-5 py-5 sm:px-7 sm:py-6"
      :aria-label="`Resumen de ${ui.investmentYearFilter}`"
      data-investment-year-summary
    >
      <FigureStrip :items="figures" />
    </section>

    <section
      class="border-line bg-panel shadow-soft grid gap-3 rounded-lg border px-2 pt-2 pb-4 sm:px-7 sm:pt-4"
      :aria-label="`Movimientos de inversión de ${ui.investmentYearFilter}`"
      data-investment-ledger
    >
      <LedgerTable
        :columns="columns"
        :groups="groups"
        :row-key="(row) => row.tx.id"
        :label="`Movimientos de inversión de ${ui.investmentYearFilter}`"
        :empty-text="emptyText"
        :row-attrs="
          (row) => ({
            'data-investment-tx-id': row.tx.id,
            'data-investment-operation': row.sideLabel,
          })
        "
      >
        <template #cell-date="{ row }">
          <span class="grid gap-0.5 whitespace-nowrap">
            <span class="font-semibold">{{ formatDayMonth(row.tx.date) }}</span>
            <span class="font-display text-text-muted text-sm tabular-nums">
              {{ row.tx.time || '--:--' }}
            </span>
          </span>
        </template>
        <template #cell-asset="{ row }">
          <div v-if="row.tx.remoteOperation" class="grid gap-1 sm:hidden">
            <span class="font-mono font-medium">{{ row.symbol }} <PillTag>Bitvavo</PillTag></span>
            <span class="text-text-muted text-sm"
              >{{ formatDayMonth(row.tx.date) }} · {{ row.account }}</span
            >
            <span v-if="!row.tx.instrumentId" class="text-text-muted text-sm"
              >Pendiente de vincular</span
            >
            <BitvavoMovementDetails :transaction="row.tx" />
          </div>
          <!-- On small screens the actions column is hidden: the asset opens
               the movement, with its date, broker and currency below. -->
          <button
            v-if="!row.tx.remoteOperation"
            type="button"
            class="grid min-h-11 w-full min-w-0 gap-1 text-left sm:hidden"
            :disabled="Boolean(row.tx.remoteOperation)"
            :aria-label="`Editar ${nameOf(row)}`"
            @click="panel?.openEdit(row.tx)"
          >
            <span class="flex items-center gap-2">
              <span class="font-mono font-medium">{{ row.symbol }}</span>
              <PillTag v-if="row.tx.remoteOperation">Bitvavo</PillTag>
              <PillTag :tone="row.tx.side === 'sell' ? 'accent' : 'invest'">
                {{ row.sideLabel }}
              </PillTag>
            </span>
            <span class="text-text-muted text-sm">
              {{ formatDayMonth(row.tx.date) }} · {{ row.account }} · {{ row.currency }}
            </span>
          </button>
          <span class="hidden min-w-0 gap-0.5 sm:grid">
            <span class="flex items-center gap-2">
              <span class="font-mono font-medium">{{ row.symbol }}</span>
              <PillTag v-if="row.tx.remoteOperation">Bitvavo</PillTag>
              <PillTag :tone="row.tx.side === 'sell' ? 'accent' : 'invest'">
                {{ row.sideLabel }}
              </PillTag>
            </span>
            <span class="text-text-muted text-sm">{{
              row.tx.remoteOperation && !row.tx.instrumentId
                ? 'Pendiente de vincular'
                : row.tx.category || 'Sin categoría'
            }}</span>
          </span>
        </template>
        <template #cell-units="{ row }">
          <span class="font-display tabular-nums">{{ formatUnits(row.tx.units) }}</span>
        </template>
        <template #cell-currency="{ row }">
          <PillTag>{{ row.currency }}</PillTag>
        </template>
        <template #cell-fee="{ row }">
          <span class="font-display text-text-muted text-sm tabular-nums">
            {{ formatMoney(row.tx.fee) }}
          </span>
        </template>
        <template #cell-total="{ row }">
          <span class="grid justify-items-end gap-0.5 whitespace-nowrap">
            <span
              class="font-display tabular-nums"
              :class="row.tx.side === 'sell' ? TONE_TEXT.gain : 'text-text-main'"
              data-investment-total
            >
              {{ row.tx.side === 'sell' ? '+' : '' }}{{ formatMoney(Math.abs(row.tx.amount)) }}
            </span>
            <span class="font-display text-text-muted text-xs tabular-nums">
              {{ formatUnits(row.tx.units) }} × {{ formatMoney(row.tx.unitPrice) }}
            </span>
          </span>
        </template>
        <template #cell-declared="{ row }">
          <button
            type="button"
            class="focus-visible:outline-primary desk:min-h-9 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-bold whitespace-nowrap focus-visible:outline-2"
            :class="
              row.declared
                ? 'bg-income/12 text-gain border-transparent'
                : 'border-accent bg-panel text-text-main'
            "
            :aria-pressed="row.declared"
            :aria-label="`Declaración de ${row.symbol} del ${formatDayMonth(row.tx.date)}: ${
              row.declared ? 'declarado' : 'pendiente'
            }`"
            :data-investment-declared="row.declared ? 'yes' : 'no'"
            @click="investmentStore.toggleDeclared(row.tx.id)"
          >
            <span
              class="size-2 rounded-full"
              :class="row.declared ? 'bg-income' : 'bg-accent'"
              aria-hidden="true"
            ></span>
            {{ row.declared ? 'Declarado' : 'Pendiente' }}
          </button>
        </template>
        <template #cell-actions="{ row }">
          <span class="flex justify-end">
            <BitvavoMovementDetails v-if="row.tx.remoteOperation" :transaction="row.tx" />
            <IconButton
              v-if="stockEventsStore.canSyncSymbol(row.tx.symbol || '')"
              icon="resend"
              :label="`Reenviar ${nameOf(row)} a Stock Events`"
              title="Reenviar a Stock Events"
              data-investment-resend
              @click="investmentStore.resyncMovement(row.tx.id)"
            />
            <IconButton
              v-if="!row.tx.remoteOperation"
              icon="edit"
              :label="`Editar ${nameOf(row)}`"
              @click="panel?.openEdit(row.tx)"
            />
            <IconButton
              v-if="!row.tx.remoteOperation"
              icon="trash"
              tone="danger"
              :label="`Eliminar ${nameOf(row)}`"
              @click="requestDelete(row.tx)"
            />
          </span>
        </template>
      </LedgerTable>
    </section>

    <InvestmentMovementPanel ref="panel" @delete="requestDelete" />
    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar este movimiento?"
      title-id="investment-movement-delete-title"
      confirm-label="Eliminar"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ pendingDelete.sideLabel }} de {{ pendingDelete.symbol }} del
        {{ formatDayMonth(pendingDelete.tx.date) }} por
        {{ formatMoney(Math.abs(pendingDelete.tx.amount)) }}. No se puede deshacer y cambiará tus
        posiciones.
      </template>
    </ConfirmDialog>
  </div>
</template>
