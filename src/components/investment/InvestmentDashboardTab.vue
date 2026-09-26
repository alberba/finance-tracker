<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, shallowRef } from 'vue'

import ChartCanvas from '../charts/ChartCanvas.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { ReturnMode } from '../../domain/investment/view-model'
import { renderMultiLineChart } from '../../scripts/charts'
import { MONTHS } from '../../scripts/types'
import { formatPercent, parseIntSafe } from '../../scripts/utils'
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
const { formatMoney } = useMoneyFormatter()

const unit = shallowRef<'eur' | 'pct'>('eur')
const openPositionId = shallowRef('')

const returnMode = computed(() => ui.investmentReturnMode as ReturnMode)
const monthLabel = computed(() => {
  const name = MONTHS[ui.investmentMonth] ?? ''
  return `${name.charAt(0)}${name.slice(1).toLowerCase()} ${financialStateStore.state.year}`
})

const valueParts = computed(() => {
  const text = formatMoney(vm.value.portfolioValue)
  const match = text.match(/^(.*?)([,.]\d{2}\s*€?)$/)
  return match ? { whole: match[1], rest: match[2] } : { whole: text, rest: '' }
})

const dailyChange = computed(() => marketStore.valuation.dailyChangePercent)

function signedMoney(value: number): string {
  return `${value > 0 ? '+' : ''}${formatMoney(value)}`
}

function pct(value: number, digits = 2): string {
  return `${value.toFixed(digits).replace('.', ',')} %`
}

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${pct(Math.abs(value))}`
}

function toneClass(value: number): string {
  return value >= 0 ? 'inv-gain' : 'inv-loss'
}

const drawPortfolioChart = computed(() => {
  const labels = vm.value.chartLabels
  if (unit.value === 'eur') {
    const series = vm.value.valueSeries
    return (canvas: HTMLCanvasElement) => {
      renderMultiLineChart(canvas, series, { labels, formatValue: (value) => formatMoney(value) })
    }
  }
  const series = vm.value.portfolioSeries
  return (canvas: HTMLCanvasElement) => {
    renderMultiLineChart(canvas, series, {
      labels,
      formatValue: (value) => formatPercent(value),
      forceZeroTick: true,
    })
  }
})

const openPosition = computed(
  () => vm.value.positions.find((position) => position.id === openPositionId.value) ?? null,
)

const drawAssetChart = computed(() => {
  const series = openPosition.value?.series ?? []
  const labels = vm.value.chartLabels
  return (canvas: HTMLCanvasElement) => {
    renderMultiLineChart(canvas, series, {
      labels,
      formatValue: (value) => formatPercent(value),
      forceZeroTick: true,
    })
  }
})

function togglePosition(id: string): void {
  openPositionId.value = openPositionId.value === id ? '' : id
}

function lastMovementDate(assetName: string): string {
  const dates = financialStateStore.state.transactions
    .filter((tx) => tx.type === 'investment' && tx.category === assetName)
    .map((tx) => String(tx.date))
    .sort()
  return dates.at(-1) ?? '—'
}

const allocationLabel = computed(
  () =>
    `Distribución de la cartera por activo: ${vm.value.positions
      .map((position) => `${position.name} ${pct(position.weight, 1)}`)
      .join(', ')}`,
)

const quotes = computed(() => marketStore.valuation.instruments)
const assetNameById = computed(
  () => new Map(financialStateStore.investmentAssets.map((asset) => [asset.id, asset.name])),
)

function formatQuote(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 6 }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function setReturnMode(mode: ReturnMode): void {
  investmentStore.setReturnMode(mode)
}

function onMonthChange(event: Event): void {
  investmentStore.setMonth(parseIntSafe((event.target as HTMLSelectElement).value, ui.investmentMonth))
}

onMounted(() => {
  void marketStore.refreshQuotes()
})
</script>

<template>
  <div
    id="investment-tab-dashboard"
    class="inv-page"
    :hidden="!isActive"
    data-investment-tab-panel="dashboard"
    role="tabpanel"
  >
    <div class="inv-toolbar">
      <label class="inv-field">
        Mes de análisis
        <span class="inv-select">
          <select id="investment-month" name="investmentMonth" :value="ui.investmentMonth" @change="onMonthChange">
            <option v-for="(name, index) in MONTHS" :key="name" :value="index">{{ name }}</option>
          </select>
        </span>
      </label>
      <div class="inv-toolbar__group" role="group" aria-label="Modo de cálculo de rentabilidad">
        <span class="inv-field">Rentabilidad</span>
        <div class="inv-seg">
          <button
            type="button"
            :class="{ 'is-active': returnMode === 'simple' }"
            data-return-mode="simple"
            :aria-pressed="returnMode === 'simple'"
            @click="setReturnMode('simple')"
          >
            Simple
          </button>
          <button
            type="button"
            :class="{ 'is-active': returnMode === 'twr' }"
            data-return-mode="twr"
            :aria-pressed="returnMode === 'twr'"
            @click="setReturnMode('twr')"
          >
            TWR
          </button>
        </div>
      </div>
    </div>

    <section class="inv-hero" aria-label="Situación de la cartera">
      <div class="inv-hero__main">
        <p class="inv-hero__label">Valor de la cartera · {{ monthLabel }}</p>
        <p id="inv-total-value" class="inv-hero__value">
          {{ valueParts.whole }}<small>{{ valueParts.rest }}</small>
        </p>
        <span v-if="dailyChange !== null" class="inv-hero__chip" :class="{ 'is-down': dailyChange < 0 }">
          {{ dailyChange >= 0 ? '+' : '' }}{{ dailyChange.toFixed(2).replace('.', ',') }} % hoy
        </span>
      </div>
      <div class="inv-hero__fact">
        <p>Capital invertido</p>
        <strong id="inv-capital">{{ formatMoney(vm.investedCapital) }}</strong>
      </div>
      <div class="inv-hero__fact">
        <p>Resultado</p>
        <strong :class="vm.gain >= 0 ? 'is-up' : 'is-down'">{{ signedMoney(vm.gain) }}</strong>
      </div>
      <div class="inv-hero__fact">
        <p id="inv-return-label">{{ vm.returnLabel }}</p>
        <strong id="inv-return" :class="vm.returnIsGood ? 'is-up' : 'is-down'">
          {{ signedPercent(vm.displayReturn) }}
        </strong>
      </div>
    </section>

    <div class="inv-doc">
      <section class="inv-block" aria-labelledby="inv-evo-title">
        <header class="inv-block__head">
          <div class="inv-block__title">
            <span class="inv-block__num">01</span>
            <div>
              <h3 id="inv-evo-title">Evolución</h3>
              <p>
                {{
                  unit === 'eur'
                    ? 'Valor de la cartera frente al capital aportado, mes a mes.'
                    : 'Rentabilidad acumulada de la cartera, mes a mes.'
                }}
              </p>
            </div>
          </div>
          <div class="inv-seg inv-seg--soft" role="group" aria-label="Unidad del gráfico">
            <button type="button" :class="{ 'is-active': unit === 'eur' }" :aria-pressed="unit === 'eur'" @click="unit = 'eur'">€</button>
            <button type="button" :class="{ 'is-active': unit === 'pct' }" :aria-pressed="unit === 'pct'" @click="unit = 'pct'">%</button>
          </div>
        </header>
        <div class="inv-chart">
          <ChartCanvas
            id="investment-portfolio-chart"
            :draw="drawPortfolioChart"
            :aria-label="unit === 'eur' ? 'Valor de cartera frente a capital aportado' : 'Evolución cartera total'"
          />
        </div>
      </section>

      <section class="inv-block" aria-labelledby="inv-pos-title">
        <header class="inv-block__title">
          <span class="inv-block__num">02</span>
          <div>
            <h3 id="inv-pos-title">Posiciones</h3>
            <p>Peso, valor y resultado de cada activo. Abre una fila para ver su evolución.</p>
          </div>
        </header>

        <p v-if="!vm.positions.length" class="inv-empty">Aún no hay posiciones con valor en este mes.</p>
        <template v-else>
          <div id="investment-allocation" class="inv-alloc" role="img" :aria-label="allocationLabel">
            <span
              v-for="position in vm.positions"
              :key="position.id"
              class="inv-alloc__seg"
              :style="{ flexGrow: position.weight }"
            >
              <span class="inv-alloc__bar" :style="{ background: position.color }"></span>
              <span class="inv-alloc__tip" aria-hidden="true">
                <span><i class="inv-swatch" :style="{ background: position.color }"></i>{{ position.name }}</span>
                <strong>{{ pct(position.weight, 1) }}<small>{{ formatMoney(position.value) }}</small></strong>
              </span>
            </span>
          </div>

          <div class="inv-ledger-wrap">
            <table class="inv-ledger">
              <thead>
                <tr>
                  <th scope="col">Activo</th>
                  <th scope="col" class="inv-hide-sm">Peso</th>
                  <th scope="col" class="is-right">Valor</th>
                  <th scope="col" class="is-right inv-hide-sm">Invertido</th>
                  <th scope="col" class="is-right inv-hide-sm">Resultado</th>
                  <th scope="col" class="is-right">Rentab.</th>
                  <th scope="col"><span class="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="position in vm.positions" :key="position.id">
                  <tr
                    class="inv-pos-row"
                    :class="{ 'is-open': openPositionId === position.id }"
                    :data-position="position.id"
                  >
                    <th scope="row">
                      <span class="inv-cell-name">
                        <i class="inv-swatch" :style="{ background: position.color }"></i>{{ position.name }}
                      </span>
                    </th>
                    <td class="inv-hide-sm">
                      <span class="inv-weight">
                        <span class="inv-weight__track">
                          <span :style="{ width: `${(position.weight / (vm.positions[0]?.weight || 1)) * 100}%`, background: position.color }"></span>
                        </span>
                        <span class="inv-weight__pct inv-num">{{ pct(position.weight, 1) }}</span>
                      </span>
                    </td>
                    <td class="is-right inv-num">{{ formatMoney(position.value) }}</td>
                    <td class="is-right inv-num inv-muted inv-hide-sm">{{ formatMoney(position.invested) }}</td>
                    <td class="is-right inv-num inv-hide-sm" :class="toneClass(position.gain)">{{ signedMoney(position.gain) }}</td>
                    <td class="is-right inv-num" :class="toneClass(position.returnPct)">{{ signedPercent(position.returnPct) }}</td>
                    <td class="is-right">
                      <button
                        type="button"
                        class="inv-icon-btn inv-row-toggle"
                        :aria-expanded="openPositionId === position.id"
                        :aria-label="`${openPositionId === position.id ? 'Ocultar' : 'Ver'} evolución de ${position.name}`"
                        @click="togglePosition(position.id)"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                    </td>
                  </tr>
                  <tr v-if="openPositionId === position.id" class="inv-pos-detail">
                    <td colspan="7">
                      <div class="inv-pos-detail__body">
                        <div class="inv-chart inv-chart--mini">
                          <ChartCanvas
                            id="investment-asset-chart"
                            :draw="drawAssetChart"
                            :aria-label="`Rentabilidad acumulada de ${position.name}`"
                          />
                        </div>
                        <dl class="inv-dl">
                          <dt>Invertido</dt>
                          <dd>{{ formatMoney(position.invested) }}</dd>
                          <dt>Valor</dt>
                          <dd>{{ formatMoney(position.value) }}</dd>
                          <dt>Peso</dt>
                          <dd>{{ pct(position.weight, 1) }}</dd>
                          <dt>Último movimiento</dt>
                          <dd>{{ lastMovementDate(position.name) }}</dd>
                        </dl>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td class="inv-num inv-muted inv-hide-sm">{{ vm.positions.length }} activos</td>
                  <td class="is-right inv-num">{{ formatMoney(vm.portfolioValue) }}</td>
                  <td class="is-right inv-num inv-muted inv-hide-sm">{{ formatMoney(vm.investedCapital) }}</td>
                  <td class="is-right inv-num inv-hide-sm" :class="toneClass(vm.gain)">{{ signedMoney(vm.gain) }}</td>
                  <td class="is-right inv-num" :class="toneClass(vm.displayReturn)">{{ signedPercent(vm.displayReturn) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </template>
      </section>

      <section v-if="quotes.length" class="inv-block" aria-labelledby="inv-mkt-title" data-investment-quotes>
        <header class="inv-block__head">
          <div class="inv-block__title">
            <span class="inv-block__num">03</span>
            <div>
              <h3 id="inv-mkt-title">Cotizaciones</h3>
              <p>Precio orientativo; no sustituye a los snapshots confirmados. Corrige los títulos si no cuadran.</p>
            </div>
          </div>
          <div class="inv-block__aside">
            <strong>{{ formatMoney(marketStore.valuation.totalValue) }}</strong>
            <span v-if="dailyChange !== null" class="inv-num" :class="toneClass(dailyChange)">
              {{ dailyChange >= 0 ? '+' : '' }}{{ dailyChange.toFixed(2).replace('.', ',') }} % hoy
            </span>
          </div>
        </header>
        <p v-if="marketStore.isLoading" class="inv-muted" role="status">Actualizando cotizaciones…</p>
        <p v-else-if="marketStore.errorMessage" class="inv-loss" role="alert">
          {{ marketStore.errorMessage }}. Se conserva el último dato válido si existe.
        </p>
        <div class="inv-ledger-wrap">
          <table class="inv-ledger" aria-label="Cotizaciones de cartera">
            <thead>
              <tr>
                <th scope="col">Instrumento</th>
                <th scope="col" class="is-right">Títulos</th>
                <th scope="col" class="is-right">Precio</th>
                <th scope="col" class="is-right inv-hide-sm">Hoy</th>
                <th scope="col" class="is-right">Valor</th>
                <th scope="col" class="inv-hide-sm">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in quotes" :key="row.instrument.id">
                <th scope="row">
                  <span class="inv-cell-stack">
                    <span style="font-family: 'DM Mono', monospace">{{ row.instrument.symbol }}</span>
                    <small>{{ assetNameById.get(row.instrument.investmentAssetId) || row.instrument.type.toUpperCase() }}</small>
                  </span>
                </th>
                <td class="is-right">
                  <label class="sr-only" :for="`investment-holdings-${row.instrument.id}`">Títulos de {{ row.instrument.symbol }}</label>
                  <input
                    :id="`investment-holdings-${row.instrument.id}`"
                    class="inv-silent-input"
                    :value="row.units"
                    type="number"
                    min="0"
                    step="0.00000001"
                    @change="marketStore.updateCurrentUnits(row.instrument.id, ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td class="is-right inv-num">{{ row.quote ? formatQuote(row.quote.price, row.quote.currency) : '—' }}</td>
                <td class="is-right inv-num inv-hide-sm" :class="row.dailyChangePercent === null ? 'inv-muted' : toneClass(row.dailyChangePercent)">
                  {{ row.dailyChangePercent === null ? '—' : `${row.dailyChangePercent >= 0 ? '+' : ''}${row.dailyChangePercent.toFixed(2).replace('.', ',')} %` }}
                </td>
                <td class="is-right inv-num">{{ formatMoney(row.value) }}</td>
                <td class="inv-hide-sm">
                  <span class="inv-state" :class="{ 'is-stale': row.status === 'stale', 'is-missing': row.status !== 'fresh' && row.status !== 'stale' }">
                    <i></i>{{ row.status === 'fresh' ? 'Actualizado' : row.status === 'stale' ? 'Retrasado' : 'Sin cotización' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
