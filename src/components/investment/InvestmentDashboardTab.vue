<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'

import InvestmentPositionsBlock from './InvestmentPositionsBlock.vue'
import InvestmentQuotesBlock from './InvestmentQuotesBlock.vue'
import ChartCanvas from '../charts/ChartCanvas.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import InkBand, { type InkBandFact } from '../ui/InkBand.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import { toneOf } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { ReturnMode } from '../../domain/investment/view-model'
import { formatMonthYear, formatPercent, formatShortDate } from '../../lib/format'
import { renderMultiLineChart } from '../../scripts/charts'
import { MONTHS } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'
import { useMarketStore } from '../../stores/market'
import { useUiStore } from '../../stores/ui'

defineProps<{ isActive: boolean }>()

const investmentStore = useInvestmentStore()
const marketStore = useMarketStore()
const financialStateStore = useFinancialStateStore()
const ui = useUiStore().ui
const { dashboardViewModel: vm } = storeToRefs(investmentStore)
const { formatMoney, formatSignedMoney, formatMoneyCompact } = useMoneyFormatter()

type ChartUnit = 'eur' | 'pct'
const unit = shallowRef<ChartUnit>('eur')

const RETURN_MODES: SegmentedOption<ReturnMode>[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'twr', label: 'TWR' },
]
const CHART_UNITS: SegmentedOption<ChartUnit>[] = [
  { value: 'eur', label: '€' },
  { value: 'pct', label: '%' },
]

const returnMode = computed({
  get: () => ui.investmentReturnMode as ReturnMode,
  set: (mode: ReturnMode) => investmentStore.setReturnMode(mode),
})
const month = computed({
  get: () => String(ui.investmentMonth),
  set: (value: string) => investmentStore.setMonth(Number(value)),
})
const monthOptions = computed(() =>
  MONTHS.map((_, index) => ({
    value: String(index),
    label: formatMonthYear(index, financialStateStore.state.year),
  })),
)

const signedPercent = (value: number) => formatPercent(value, { signed: true })

const dailyChange = computed(() => marketStore.valuation.dailyChangePercent)
const dailyChip = computed(() =>
  dailyChange.value === null
    ? null
    : { text: `${signedPercent(dailyChange.value)} hoy`, tone: toneOf(dailyChange.value) },
)

const heroFacts = computed<InkBandFact[]>(() => [
  {
    label: 'Capital invertido',
    value: formatMoney(vm.value.investedCapital),
    valueId: 'inv-capital',
  },
  { label: 'Resultado', value: formatSignedMoney(vm.value.gain), tone: toneOf(vm.value.gain) },
  {
    label: vm.value.returnLabel,
    value: signedPercent(vm.value.displayReturn),
    tone: toneOf(vm.value.displayReturn),
    labelId: 'inv-return-label',
    valueId: 'inv-return',
  },
])

const drawPortfolioChart = computed(() => {
  const labels = vm.value.chartLabels
  if (unit.value === 'eur') {
    const series = vm.value.valueSeries
    return (canvas: HTMLCanvasElement) =>
      renderMultiLineChart(canvas, series, {
        labels,
        formatValue: formatMoney,
        formatAxisValue: formatMoneyCompact,
      })
  }
  const series = vm.value.percentSeries
  return (canvas: HTMLCanvasElement) =>
    renderMultiLineChart(canvas, series, {
      labels,
      formatValue: (value) => formatPercent(value),
      forceZeroTick: true,
    })
})
</script>

<template>
  <div
    id="investment-tab-dashboard"
    class="grid min-w-0 gap-6 sm:gap-7"
    :hidden="!isActive"
    data-investment-tab-panel="dashboard"
    role="tabpanel"
    aria-label="Resumen"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <BaseSelect
        id="investment-month"
        v-model="month"
        name="investmentMonth"
        label="Mes de análisis"
        :options="monthOptions"
        class="grow sm:flex sm:grow-0 sm:items-center sm:gap-3 [&_select]:font-semibold max-sm:[&>label]:sr-only"
      />
      <div class="flex items-center gap-3">
        <span class="text-text-muted hidden text-sm font-semibold sm:inline" aria-hidden="true">
          Rentabilidad
        </span>
        <SegmentedControl
          v-model="returnMode"
          :options="RETURN_MODES"
          label="Modo de cálculo de rentabilidad"
          data-key="return-mode"
        />
      </div>
    </div>

    <InkBand
      aria-label="Situación de la cartera"
      :label="`Valor de la cartera · ${formatShortDate(vm.asOf)}`"
      :value="formatMoney(vm.portfolioValue)"
      value-id="inv-total-value"
      :chip="dailyChip"
      :facts="heroFacts"
    />

    <DocumentSurface>
      <NumberedBlock
        number="01"
        title="Evolución"
        title-id="inv-evo-title"
        :description="
          unit === 'eur'
            ? 'Valor de la cartera frente al capital aportado, mes a mes.'
            : 'Rentabilidad acumulada de la cartera, mes a mes.'
        "
      >
        <template #actions>
          <SegmentedControl
            v-model="unit"
            :options="CHART_UNITS"
            label="Unidad del gráfico"
            variant="soft"
          />
        </template>
        <div class="relative h-64 sm:h-72">
          <ChartCanvas
            id="investment-portfolio-chart"
            class="block size-full"
            :draw="drawPortfolioChart"
            :aria-label="
              unit === 'eur'
                ? 'Valor de cartera frente a capital aportado'
                : 'Evolución cartera total'
            "
          />
        </div>
      </NumberedBlock>

      <InvestmentPositionsBlock :vm="vm" />

      <InvestmentQuotesBlock />
    </DocumentSurface>
  </div>
</template>
