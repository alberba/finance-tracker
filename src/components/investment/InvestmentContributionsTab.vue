<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { formatPercent } from '../../scripts/utils'
import { useInvestmentStore } from '../../stores/investment'

defineProps<{ isActive: boolean }>()

const emit = defineEmits<{
  openWorkflow: []
  requestDelete: [date: string]
}>()

const investmentStore = useInvestmentStore()
const { contributionRows } = storeToRefs(investmentStore)
const { formatMoney } = useMoneyFormatter()

function returnText(value: number | null): string {
  return value === null ? '--' : formatPercent(value * 100)
}

function returnClass(value: number | null): string {
  if (value === null) return ''
  return value >= 0 ? 'text-(--income)' : 'text-(--expense)'
}

function onFlowInput(date: string, event: Event): void {
  investmentStore.setContributionFlow(date, Number((event.target as HTMLInputElement).value) || 0)
}
</script>

<template>
  <div
    id="investment-tab-contributions"
    class="investment-subtab-panel"
    :class="{ 'is-active': isActive }"
    :hidden="!isActive"
    data-investment-tab-panel="contributions"
    role="tabpanel"
  >
    <article class="card">
      <div class="contribution-head">
        <h3>Aportes y TWR</h3>
        <button
          id="open-contribution-workflow"
          type="button"
          class="primary-btn"
          @click="emit('openWorkflow')"
        >
          Añadir aporte
        </button>
      </div>
      <div class="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Valor cartera (cierre)</th>
              <th>Flujo del día</th>
              <th>VLE</th>
              <th>Participaciones antes</th>
              <th>Participaciones después</th>
              <th>Retorno período</th>
              <th>Retorno acumulado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="contribution-body">
            <tr v-if="!contributionRows.length">
              <td colspan="9">Sin snapshots de inversión disponibles.</td>
            </tr>
            <tr v-for="(row, index) in contributionRows" v-else :key="row.id">
              <td>{{ row.date }}</td>
              <td>{{ formatMoney(row.portfolioValue) }}</td>
              <td>
                <input
                  class="contribution-flow-input"
                  type="number"
                  step="0.01"
                  :value="row.flow"
                  :data-contribution-flow-date="row.date"
                  :aria-label="`Flujo del día ${row.date}`"
                  @input="onFlowInput(row.date, $event)"
                />
              </td>
              <td>{{ index === 0 ? '100' : row.nav.toFixed(6) }}</td>
              <td>{{ row.unitsBefore.toFixed(4) }}</td>
              <td>{{ row.unitsAfter.toFixed(7) }}</td>
              <td :class="returnClass(row.periodReturn)">{{ returnText(row.periodReturn) }}</td>
              <td :class="returnClass(row.cumulativeReturn)">{{ returnText(row.cumulativeReturn) }}</td>
              <td>
                <button
                  v-if="investmentStore.isManualDate(row.date)"
                  type="button"
                  class="delete-btn icon-action-btn"
                  :data-delete-contribution-date="row.date"
                  :aria-label="`Eliminar aporte manual del ${row.date}`"
                  @click="emit('requestDelete', row.date)"
                >
                  <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 7h12l-1 14H7L6 7z"></path><path d="M9 4h6l1 2H8l1-2z"></path></svg>
                </button>
                <span v-else class="muted">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </div>
</template>
