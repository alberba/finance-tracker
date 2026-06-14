<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import ChartCanvas from '../charts/ChartCanvas.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { renderDonutChart, renderMultiLineChart } from '../../scripts/charts'
import { formatPercent } from '../../scripts/utils'
import { useInvestmentStore } from '../../stores/investment'

defineProps<{ isActive: boolean }>()

const investmentStore = useInvestmentStore()
const { dashboardViewModel } = storeToRefs(investmentStore)
const { formatMoney } = useMoneyFormatter()

const drawPortfolioChart = computed(() => {
  const series = dashboardViewModel.value.portfolioSeries
  const labels = dashboardViewModel.value.chartLabels
  return (canvas: HTMLCanvasElement) => {
    renderMultiLineChart(canvas, series, {
      labels,
      formatValue: (value) => formatPercent(value),
      forceZeroTick: true,
    })
  }
})

const drawAssetsChart = computed(() => {
  const series = dashboardViewModel.value.assetsSeries
  const labels = dashboardViewModel.value.chartLabels
  return (canvas: HTMLCanvasElement) => {
    renderMultiLineChart(canvas, series, {
      labels,
      formatValue: (value) => formatPercent(value),
      forceZeroTick: true,
    })
  }
})

const drawAllocationChart = computed(() => {
  const allocation = dashboardViewModel.value.allocation
  return (canvas: HTMLCanvasElement) => {
    renderDonutChart(canvas, allocation, formatMoney)
  }
})
</script>

<template>
  <div
    id="investment-tab-dashboard"
    class="investment-subtab-panel"
    :class="{ 'is-active': isActive }"
    :hidden="!isActive"
    data-investment-tab-panel="dashboard"
    role="tabpanel"
  >
    <div class="cards-grid slim">
      <article class="kpi-card">
        <p>Valor cartera</p>
        <strong id="inv-total-value">{{ formatMoney(dashboardViewModel.portfolioValue) }}</strong>
      </article>
      <article class="kpi-card">
        <p>Capital invertido</p>
        <strong id="inv-capital">{{ formatMoney(dashboardViewModel.investedCapital) }}</strong>
      </article>
      <article class="kpi-card">
        <p id="inv-return-label">{{ dashboardViewModel.returnLabel }}</p>
        <strong id="inv-return" :class="dashboardViewModel.returnIsGood ? 'text-(--income)' : 'text-(--expense)'">
          {{ formatPercent(dashboardViewModel.displayReturn) }}
        </strong>
      </article>
    </div>

    <div class="chart-grid-inv">
      <article class="card">
        <h3>Evolución de la cartera</h3>
        <div class="chart-canvas-wrap">
          <ChartCanvas
            id="investment-portfolio-chart"
            :draw="drawPortfolioChart"
            aria-label="Evolución cartera total"
          />
        </div>
      </article>
      <article class="card">
        <h3>Evolución por activo</h3>
        <div class="chart-canvas-wrap">
          <ChartCanvas
            id="investment-assets-chart"
            :draw="drawAssetsChart"
            aria-label="Evolución por activo"
          />
        </div>
      </article>
    </div>

    <div class="dual-grid">
      <article class="card">
        <h3>Distribución de activos</h3>
        <div class="chart-canvas-wrap">
          <ChartCanvas
            id="investment-allocation"
            :draw="drawAllocationChart"
            aria-label="Distribución de cartera"
          />
        </div>
      </article>
    </div>
  </div>
</template>
