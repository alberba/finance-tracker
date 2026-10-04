<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import ContributionWorkflowPanel from './ContributionWorkflowPanel.vue'
import ChartCanvas from '../charts/ChartCanvas.vue'
import BaseButton from '../ui/BaseButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import FigureStrip, { type FigureStripItem } from '../ui/FigureStrip.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import PillTag from '../ui/PillTag.vue'
import { TONE_TEXT, toneOf } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { ContributionLedgerRow } from '../../domain/investment/view-model'
import { formatDayMonth, formatNumber, formatPercent, formatShortDate } from '../../lib/format'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import { renderMultiLineChart } from '../../scripts/charts'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'

// The Aportes tab: the year's contribution figures, the net asset value since
// the first close and the register of closes, with each close's contribution
// editable in place. New contributions go through the two-step side panel.
defineProps<{ isActive: boolean }>()

const investmentStore = useInvestmentStore()
const financialStateStore = useFinancialStateStore()
const { contributionRows, contributionLedger, contributionSummary } = storeToRefs(investmentStore)
const { formatMoney } = useMoneyFormatter()

const panel = ref<InstanceType<typeof ContributionWorkflowPanel> | null>(null)
const pendingDelete = ref<ContributionLedgerRow | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

const ORIGIN_LABEL = { base: 'Inicio', monthEnd: 'Cierre de mes', manual: 'Manual' } as const

function formatNav(value: number | null): string {
  return value === null ? '—' : formatNumber(value, 4)
}

function formatReturn(value: number | null): string {
  return value === null ? '—' : formatPercent(value * 100, { signed: true })
}

function returnClass(value: number | null): string {
  return value === null ? 'text-text-muted' : TONE_TEXT[toneOf(value)]
}

const figures = computed<FigureStripItem[]>(() => {
  const summary = contributionSummary.value
  return [
    {
      label: 'Rentabilidad TWR',
      value: formatReturn(summary.cumulativeReturn),
      tone: summary.cumulativeReturn === null ? undefined : toneOf(summary.cumulativeReturn),
    },
    {
      label: `Aportado en ${financialStateStore.state.year}`,
      value: formatMoney(summary.contributed),
    },
    { label: 'Valor liquidativo', value: formatNav(summary.nav) },
    { label: 'Participaciones', value: formatNav(summary.units) },
  ]
})

const drawNavChart = computed(() => {
  const rows = contributionRows.value
  const labels = rows.map((row) => formatDayMonth(row.date))
  const series = [
    { name: 'Valor liquidativo', color: 'var(--gain)', values: rows.map((row) => row.nav) },
    {
      name: 'Base 100',
      color: 'var(--text-muted)',
      values: rows.map(() => 100),
      dashed: true,
    },
  ]
  return (canvas: HTMLCanvasElement) =>
    renderMultiLineChart(canvas, series, { labels, formatValue: (value) => formatNav(value) })
})

const columns: LedgerColumn<ContributionLedgerRow>[] = [
  { key: 'date', label: 'Cierre', rowHeader: true },
  { key: 'value', label: 'Valor cartera', align: 'right', hideBelow: 'md' },
  { key: 'flow', label: 'Aporte', align: 'right' },
  { key: 'nav', label: 'VL', align: 'right', hideBelow: 'lg' },
  { key: 'units', label: 'Participaciones', align: 'right', hideBelow: 'lg' },
  { key: 'period', label: 'Periodo', align: 'right', hideBelow: 'sm' },
  { key: 'cumulative', label: 'Acumulado', align: 'right', hideBelow: 'md' },
  { key: 'origin', label: 'Origen', align: 'right' },
]

function onFlowChange(date: string, event: Event): void {
  const value = parseDecimal((event.target as HTMLInputElement).value)
  investmentStore.setContributionFlow(date, Number.isFinite(value) ? value : 0)
}

function confirmDelete(): void {
  if (pendingDelete.value) investmentStore.deleteContribution(pendingDelete.value.date)
}
</script>

<template>
  <div
    id="investment-tab-contributions"
    class="grid content-start gap-6"
    :hidden="!isActive"
    data-investment-tab-panel="contributions"
    role="tabpanel"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <p class="text-text-muted max-w-[64ch] text-[0.9375rem] leading-relaxed">
        Cada cierre de mes fija el valor de la cartera. Lo que aportas compra participaciones al
        valor liquidativo del día, así la rentabilidad no se infla con tus propios ingresos.
      </p>
      <BaseButton
        id="open-contribution-workflow"
        variant="primary"
        class="max-sm:w-full"
        @click="panel?.open()"
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
        Nuevo aporte
      </BaseButton>
    </div>

    <section
      class="border-line bg-panel rounded-lg border px-5 py-5 sm:px-7 sm:py-6"
      aria-label="Resumen de aportes"
      data-contribution-summary
    >
      <FigureStrip :items="figures" />
    </section>

    <DocumentSurface>
      <NumberedBlock
        number="01"
        title="Valor liquidativo"
        title-id="contribution-nav-title"
        description="Base 100 en el primer cierre. Si la línea sube, la cartera gana; los aportes no la mueven."
      >
        <p
          v-if="contributionRows.length < 2"
          class="border-line text-text-muted rounded-md border border-dashed p-4 text-sm"
        >
          Hacen falta al menos dos cierres para dibujar la evolución.
        </p>
        <div v-else class="h-56 sm:h-64">
          <ChartCanvas
            id="contribution-nav-chart"
            class="block size-full"
            :draw="drawNavChart"
            aria-label="Evolución del valor liquidativo de la cartera"
          />
        </div>
      </NumberedBlock>

      <NumberedBlock
        number="02"
        title="Registro de cierres"
        title-id="contribution-ledger-title"
        description="Del cierre más reciente al primero. El aporte se corrige en la propia fila."
      >
        <LedgerTable
          :columns="columns"
          :rows="contributionLedger"
          :row-key="(row) => row.date"
          label="Registro de cierres"
          empty-text="Sin cierres de inversión todavía. Guarda un aporte o un snapshot mensual."
          :row-attrs="(row) => ({ 'data-contribution-date': row.date })"
        >
          <template #cell-date="{ row }">
            <span class="grid gap-0.5 whitespace-nowrap">
              <span class="font-semibold">{{ formatShortDate(row.date) }}</span>
              <span class="font-display text-text-muted text-sm tabular-nums md:hidden">
                {{ formatMoney(row.portfolioValue) }}
              </span>
            </span>
          </template>
          <template #cell-value="{ row }">
            <span class="font-display tabular-nums" data-contribution-value>
              {{ formatMoney(row.portfolioValue) }}
            </span>
          </template>
          <template #cell-flow="{ row }">
            <input
              type="text"
              inputmode="decimal"
              class="font-display text-text-main hover:border-line-strong hover:bg-panel focus:border-primary focus:bg-panel h-10 w-28 rounded-sm border border-transparent bg-transparent px-2.5 text-right tabular-nums outline-none focus:shadow-[0_0_0_3px_var(--ring)]"
              :value="formatDecimalInput(row.flow)"
              :data-contribution-flow-date="row.date"
              :aria-label="`Aporte del cierre del ${formatShortDate(row.date)}`"
              @click.stop
              @change="onFlowChange(row.date, $event)"
            />
          </template>
          <template #cell-nav="{ row }">
            <span class="font-display tabular-nums" data-contribution-nav>{{
              formatNav(row.nav)
            }}</span>
          </template>
          <template #cell-units="{ row }">
            <span class="font-display inline-flex items-baseline gap-2 text-sm tabular-nums">
              <span class="text-text-muted">{{ formatNav(row.unitsBefore) }}</span>
              <span class="text-text-muted" aria-hidden="true">→</span>
              <span>{{ formatNav(row.unitsAfter) }}</span>
            </span>
          </template>
          <template #cell-period="{ row }">
            <span
              class="font-display tabular-nums"
              :class="returnClass(row.periodReturn)"
              data-contribution-period
            >
              {{ formatReturn(row.periodReturn) }}
            </span>
          </template>
          <template #cell-cumulative="{ row }">
            <span
              class="font-display font-medium tabular-nums"
              :class="returnClass(row.cumulativeReturn)"
              data-contribution-cumulative
            >
              {{ formatReturn(row.cumulativeReturn) }}
            </span>
          </template>
          <template #cell-origin="{ row }">
            <span
              class="flex items-center justify-end gap-1"
              :data-contribution-origin="row.origin"
            >
              <template v-if="row.origin === 'manual'">
                <PillTag tone="invest">Manual</PillTag>
                <IconButton
                  icon="trash"
                  tone="danger"
                  :label="`Eliminar aporte manual del ${formatShortDate(row.date)}`"
                  :data-delete-contribution-date="row.date"
                  @click="pendingDelete = row"
                />
              </template>
              <span v-else class="text-text-muted text-sm whitespace-nowrap">
                {{ ORIGIN_LABEL[row.origin] }}
              </span>
            </span>
          </template>
        </LedgerTable>
      </NumberedBlock>
    </DocumentSurface>

    <ContributionWorkflowPanel ref="panel" />
    <ConfirmDialog
      id="contribution-delete-dialog"
      v-model:open="confirmOpen"
      title="¿Eliminar este aporte?"
      title-id="contribution-delete-title"
      confirm-label="Eliminar aporte"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        Aporte manual del {{ formatShortDate(pendingDelete.date) }} por
        {{ formatMoney(pendingDelete.flow) }}. Se recalcularán las participaciones y la rentabilidad
        desde ese cierre.
      </template>
    </ConfirmDialog>
  </div>
</template>
