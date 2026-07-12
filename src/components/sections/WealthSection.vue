<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, reactive, ref, watch } from 'vue'

import AppSection from '../ui/AppSection.vue'
import ChartCanvas from '../charts/ChartCanvas.vue'
import WealthSnapshotTable from '../wealth/WealthSnapshotTable.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useToast } from '../../composables/useToast'
import type { SnapshotRowViewModel } from '../../domain/wealth/view-model'
import { renderLineChart } from '../../scripts/charts'
import { evaluateNumericExpression } from '../../scripts/math-expression'
import { MONTHS, type SnapshotKind } from '../../scripts/types'
import { parseIntSafe, round2 } from '../../scripts/utils'
import { useWealthStore } from '../../stores/wealth'
import MarketQuotesPanel from '../market/MarketQuotesPanel.vue'

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const wealthStore = useWealthStore()
const { viewModel, snapshotMonth } = storeToRefs(wealthStore)
const { formatMoney, formatMoneyCompact } = useMoneyFormatter()
const { showToast } = useToast()

// Snapshot inputs are transient (editable) until "Guardar snapshot" commits
// them. Re-initialise from the view model whenever the month or committed
// snapshots change.
const inputs = reactive<Record<string, string>>({})

function keyOf(kind: SnapshotKind, id: string): string {
  return `${kind}:${id}`
}

function seedInputs(kind: SnapshotKind, rows: SnapshotRowViewModel[]): void {
  rows.forEach((row) => {
    inputs[keyOf(kind, row.id)] = row.snapshot === null ? '' : String(row.snapshot)
  })
}

watch(
  viewModel,
  (vm) => {
    for (const key of Object.keys(inputs)) {
      delete inputs[key]
    }
    seedInputs('accounts', vm.accountRows)
    seedInputs('investments', vm.investmentRows)
    seedInputs('liabilities', vm.liabilityRows)
  },
  { immediate: true },
)

const drawWealthChart = computed(() => {
  const series = viewModel.value.netSeries
  const labels = viewModel.value.chartLabels
  return (canvas: HTMLCanvasElement) => {
    renderLineChart(canvas, series, {
      color: '#1f6feb',
      fill: 'rgba(37, 99, 235, 0.13)',
      labels,
      formatValue: formatMoney,
      formatAxisValue: formatMoneyCompact,
    })
  }
})

function onMonthChange(event: Event): void {
  wealthStore.setMonth(parseIntSafe((event.target as HTMLSelectElement).value, snapshotMonth.value))
}

function onSaveSnapshot(): void {
  const edits = Object.entries(inputs).map(([key, value]) => {
    const [kind, id] = key.split(':') as [SnapshotKind, string]
    return { kind, id, value }
  })
  wealthStore.saveSnapshot(edits)
}

// Wealth-calc dialog (investment snapshots only).
const calcDialogRef = ref<HTMLDialogElement | null>(null)
const calcExpressionInput = ref<HTMLInputElement | null>(null)
const calcTargetId = ref('')
const calcTargetName = ref('')
const calcExpression = ref('')
const calcTitle = computed(() =>
  calcTargetName.value ? `Calcular snapshot · ${calcTargetName.value}` : 'Calcular snapshot',
)

function openCalc(row: SnapshotRowViewModel): void {
  calcTargetId.value = row.id
  calcTargetName.value = row.name
  calcExpression.value = ''
  calcDialogRef.value?.showModal?.()
  void nextTick(() => calcExpressionInput.value?.focus())
}

function closeCalc(): void {
  if (calcDialogRef.value?.open) {
    calcDialogRef.value.close()
  }
  calcTargetId.value = ''
  calcTargetName.value = ''
  calcExpression.value = ''
}

function applyCalc(): void {
  if (!calcTargetId.value) {
    closeCalc()
    return
  }
  const evaluated = evaluateNumericExpression(calcExpression.value)
  if (evaluated === null) {
    showToast('El cálculo no es válido.')
    calcExpressionInput.value?.focus()
    return
  }
  inputs[keyOf('investments', calcTargetId.value)] = String(round2(evaluated))
  showToast('Resultado aplicado al snapshot.')
  closeCalc()
}
</script>

<template>
  <AppSection id="wealth" :is-active="isActive">
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Balance patrimonial</p>
        <h2 id="wealth-title">Patrimonio total</h2>
        <p>Liquidez + inversión - deuda, con snapshots mensuales manuales.</p>
      </div>
      <div class="inline-controls">
        <label>
          Mes snapshot
          <select
            id="snapshot-month"
            name="snapshotMonth"
            :value="snapshotMonth"
            @change="onMonthChange"
          >
            <option v-for="(name, index) in MONTHS" :key="name" :value="index">{{ name }}</option>
          </select>
        </label>
        <button id="save-snapshot" class="primary-btn" type="button" @click="onSaveSnapshot">
          Guardar snapshot
        </button>
      </div>
    </div>

    <MarketQuotesPanel title="Valoración de patrimonio en mercado" />

    <div class="dual-grid">
      <WealthSnapshotTable
        title="Liquidez"
        header-label="Cuenta"
        kind="accounts"
        list-id="snapshot-accounts"
        :rows="viewModel.accountRows"
        :inputs="inputs"
        :format-money="formatMoney"
        @update-snapshot="(key: string, value: string) => (inputs[key] = value)"
      />
      <WealthSnapshotTable
        title="Inversión"
        header-label="Activo"
        kind="investments"
        list-id="snapshot-investments"
        :rows="viewModel.investmentRows"
        :inputs="inputs"
        :format-money="formatMoney"
        @open-calc="openCalc"
        @update-snapshot="(key: string, value: string) => (inputs[key] = value)"
      />
      <WealthSnapshotTable
        title="Deuda / Pasivos"
        header-label="Item"
        kind="liabilities"
        list-id="snapshot-liabilities"
        :rows="viewModel.liabilityRows"
        :inputs="inputs"
        :format-money="formatMoney"
        @update-snapshot="(key: string, value: string) => (inputs[key] = value)"
      />
      <article class="card">
        <h3>Evolución mensual</h3>
        <div class="chart-canvas-wrap">
          <ChartCanvas
            id="chart-wealth"
            :draw="drawWealthChart"
            aria-label="Evolución mensual patrimonio"
          />
        </div>
        <div class="table-wrap compact">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Liquidez</th>
                <th>Inversión</th>
                <th>Deuda</th>
                <th>Neto</th>
              </tr>
            </thead>
            <tbody id="wealth-timeline-body">
              <tr v-for="row in viewModel.timeline" :key="row.label">
                <td>{{ row.label }}</td>
                <td>{{ formatMoney(row.liquidity) }}</td>
                <td>{{ formatMoney(row.investment) }}</td>
                <td>{{ formatMoney(row.liabilities) }}</td>
                <td><strong>{{ formatMoney(row.net) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <dialog id="wealth-calc-dialog" ref="calcDialogRef" class="wealth-calc-dialog">
      <form id="wealth-calc-form" class="wealth-calc-form" autocomplete="off" @submit.prevent="applyCalc">
        <div class="wealth-calc-head">
          <h3 id="wealth-calc-title">{{ calcTitle }}</h3>
          <button
            id="wealth-calc-close"
            type="button"
            class="tx-close-btn"
            aria-label="Cerrar cálculo"
            @click="closeCalc"
          >
            ✕
          </button>
        </div>
        <label>
          Cálculo numérico
          <input
            id="wealth-calc-expression"
            ref="calcExpressionInput"
            v-model="calcExpression"
            name="wealthCalcExpression"
            type="text"
            placeholder="Ej: 1200+35,5*2"
            autocomplete="off"
          />
        </label>
        <div class="wealth-calc-actions">
          <button id="wealth-calc-apply" type="submit" class="tx-btn-primary">
            Aplicar al snapshot
          </button>
        </div>
      </form>
    </dialog>
  </AppSection>
</template>
