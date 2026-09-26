<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import ChartCanvas from '../charts/ChartCanvas.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { renderMultiLineChart } from '../../scripts/charts'
import { MONTHS } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'

defineProps<{ isActive: boolean }>()

const emit = defineEmits<{
  openWorkflow: []
  requestDelete: [date: string]
}>()

const investmentStore = useInvestmentStore()
const financialStateStore = useFinancialStateStore()
const { contributionRows } = storeToRefs(investmentStore)
const { formatMoney } = useMoneyFormatter()

/** Newest close first; the base row (index 0 in time order) lands last. */
const rows = computed(() =>
  contributionRows.value.map((row, index) => ({ ...row, isBase: index === 0 })).reverse(),
)

function decimal(value: number, digits: number): string {
  return value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function returnText(value: number | null): string {
  if (value === null) return '—'
  const pct = value * 100
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${decimal(Math.abs(pct), 2)} %`
}

function returnClass(value: number | null): string {
  if (value === null) return 'inv-muted'
  return value >= 0 ? 'inv-gain' : 'inv-loss'
}

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(parsed)
    .replace('.', '')
}

const facts = computed(() => {
  const chronological = contributionRows.value
  const last = chronological.at(-1)
  const year = String(financialStateStore.state.year)
  return {
    twr: last?.cumulativeReturn ?? null,
    contributed: chronological
      .filter((row) => String(row.date).startsWith(year))
      .reduce((sum, row) => sum + (Number(row.flow) || 0), 0),
    nav: last ? (chronological.length === 1 ? 100 : last.nav) : null,
    units: last?.unitsAfter ?? null,
  }
})

const drawNavChart = computed(() => {
  const chronological = contributionRows.value
  const labels = chronological.map((row) => MONTHS[Number(String(row.date).slice(5, 7)) - 1]?.slice(0, 3) ?? '')
  const values = chronological.map((row, index) => (index === 0 ? 100 : row.nav))
  return (canvas: HTMLCanvasElement) => {
    renderMultiLineChart(canvas, [{ name: 'Valor liquidativo', color: '#0e9f6e', values }], {
      labels,
      formatValue: (value) => decimal(value, 4),
    })
  }
})

function onFlowInput(date: string, event: Event): void {
  investmentStore.setContributionFlow(date, Number((event.target as HTMLInputElement).value) || 0)
}
</script>

<template>
  <div
    id="investment-tab-contributions"
    class="inv-page"
    :hidden="!isActive"
    data-investment-tab-panel="contributions"
    role="tabpanel"
  >
    <div class="inv-toolbar">
      <p class="inv-toolbar__intro">
        Cada cierre de mes fija el valor de la cartera. Lo que aportas compra participaciones al valor
        liquidativo del día, así la rentabilidad TWR no se infla con tus propios ingresos.
      </p>
      <button id="open-contribution-workflow" type="button" class="inv-primary" @click="emit('openWorkflow')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Añadir aporte
      </button>
    </div>

    <section class="inv-facts" aria-label="Resumen de aportes">
      <div>
        <p>Rentabilidad TWR</p>
        <strong :class="returnClass(facts.twr)">{{ returnText(facts.twr) }}</strong>
      </div>
      <div>
        <p>Aportado en {{ financialStateStore.state.year }}</p>
        <strong>{{ formatMoney(facts.contributed) }}</strong>
      </div>
      <div>
        <p>Valor liquidativo</p>
        <strong>{{ facts.nav === null ? '—' : decimal(facts.nav, 4) }}</strong>
      </div>
      <div>
        <p>Participaciones</p>
        <strong>{{ facts.units === null ? '—' : decimal(facts.units, 4) }}</strong>
      </div>
    </section>

    <div class="inv-doc">
      <section v-if="contributionRows.length > 1" class="inv-block" aria-labelledby="inv-nav-title">
        <header class="inv-block__title">
          <span class="inv-block__num">01</span>
          <div>
            <h3 id="inv-nav-title">Valor liquidativo</h3>
            <p>Base 100 en el primer cierre. Si la línea sube, la cartera gana; los aportes no la mueven.</p>
          </div>
        </header>
        <div class="inv-chart inv-chart--short">
          <ChartCanvas id="investment-nav-chart" :draw="drawNavChart" aria-label="Evolución del valor liquidativo" />
        </div>
      </section>

      <section class="inv-block" aria-labelledby="inv-log-title">
        <header class="inv-block__title">
          <span class="inv-block__num">{{ contributionRows.length > 1 ? '02' : '01' }}</span>
          <div>
            <h3 id="inv-log-title">Registro</h3>
            <p>Del cierre más reciente al primero. El aporte del día se puede corregir en la propia fila.</p>
          </div>
        </header>
        <div class="inv-ledger-wrap">
          <table class="inv-ledger">
            <thead>
              <tr>
                <th scope="col">Cierre</th>
                <th scope="col" class="is-right">Valor cartera</th>
                <th scope="col" class="is-right">Aporte</th>
                <th scope="col" class="is-right">VLE</th>
                <th scope="col" class="is-right inv-hide-sm inv-hide-md">Participaciones</th>
                <th scope="col" class="is-right inv-hide-sm">Periodo</th>
                <th scope="col" class="is-right">Acumulado</th>
                <th scope="col" class="is-right">Origen</th>
              </tr>
            </thead>
            <tbody id="contribution-body">
              <tr v-if="!rows.length">
                <td colspan="8" class="inv-empty">Sin snapshots de inversión disponibles.</td>
              </tr>
              <tr v-for="row in rows" v-else :key="row.id" :data-contribution-date="row.date">
                <td><time :datetime="row.date" style="font-weight: 600">{{ dayLabel(row.date) }}</time></td>
                <td class="is-right inv-num">{{ formatMoney(row.portfolioValue) }}</td>
                <td class="is-right">
                  <input
                    class="inv-silent-input"
                    type="number"
                    step="0.01"
                    :value="row.flow"
                    :data-contribution-flow-date="row.date"
                    :aria-label="`Aporte del ${row.date}`"
                    @input="onFlowInput(row.date, $event)"
                  />
                </td>
                <td class="is-right inv-num">{{ decimal(row.isBase ? 100 : row.nav, 4) }}</td>
                <td class="is-right inv-num inv-hide-sm inv-hide-md">
                  <span class="inv-muted">{{ row.isBase ? '—' : decimal(row.unitsBefore, 4) }}</span>
                  <span aria-hidden="true" class="inv-muted"> → </span>{{ decimal(row.unitsAfter, 4) }}
                </td>
                <td class="is-right inv-num inv-hide-sm" :class="returnClass(row.periodReturn)">{{ returnText(row.periodReturn) }}</td>
                <td class="is-right inv-num" :class="returnClass(row.cumulativeReturn)" style="font-weight: 500">{{ returnText(row.cumulativeReturn) }}</td>
                <td class="is-right">
                  <span v-if="investmentStore.isManualDate(row.date)" class="inv-actions" style="align-items: center">
                    <span class="inv-pill">Manual</span>
                    <button
                      type="button"
                      class="inv-icon-btn is-danger"
                      :data-delete-contribution-date="row.date"
                      :aria-label="`Eliminar aporte manual del ${row.date}`"
                      @click="emit('requestDelete', row.date)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
                    </button>
                  </span>
                  <span v-else class="inv-muted" style="font-size: 0.85rem">{{ row.isBase ? 'Inicio' : 'Snapshot' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
