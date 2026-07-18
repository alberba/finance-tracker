<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { useToast } from '../../composables/useToast'
import type {
  AllocationInputValue,
  SnapshotInputValue,
} from '../../domain/investment/contributions'
import { toSnapshotDate } from '../../scripts/contribution-workflow'
import { evaluateNumericExpression } from '../../scripts/math-expression'
import { MONTHS, type SnapshotKind } from '../../scripts/types'
import { monthFromISO, round2, todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useInvestmentStore } from '../../stores/investment'
import { useUiStore } from '../../stores/ui'

const investmentStore = useInvestmentStore()
const financialStateStore = useFinancialStateStore()
const uiStore = useUiStore()
const ui = uiStore.ui
const { formatMoney } = useMoneyFormatter()
const { showToast } = useToast()

const dialogRef = ref<HTMLDialogElement | null>(null)
const calcDialogRef = ref<HTMLDialogElement | null>(null)
const calcExpressionInput = ref<HTMLInputElement | null>(null)

const step = ref<1 | 2>(1)
const month = ref(0)
const date = ref('')
const total = ref('0')

interface NamedItem {
  id: string
  name: string
}

const investmentsList = ref<NamedItem[]>([])
const liquidityList = ref<NamedItem[]>([])
const missingLiquidity = ref<string[]>([])
const snapValues = reactive<Record<string, string>>({})
const allocValues = reactive<Record<string, string>>({})

// Recuerda qué campos ha tocado el usuario para no pisarlos al recalcular el
// snapshot tras un cambio de fecha o mes (ver issue #48: se perdían todos los
// importes introducidos en el paso 1/2 al ajustar la fecha).
const touchedSnapshots = reactive<Record<string, boolean>>({})
const touchedAllocations = reactive<Record<string, boolean>>({})
const touchedTotal = ref(false)

const calcTargetKind = ref<SnapshotKind | ''>('')
const calcTargetId = ref('')
const calcTargetName = ref('')
const calcExpression = ref('')
const calcTitle = computed(() =>
  calcTargetName.value ? `Calcular snapshot · ${calcTargetName.value}` : 'Calcular snapshot',
)

function snapKey(kind: SnapshotKind, id: string): string {
  return `${kind}:${id}`
}

function markSnapshotTouched(kind: SnapshotKind, id: string): void {
  touchedSnapshots[snapKey(kind, id)] = true
}

function markAllocationTouched(accountId: string): void {
  touchedAllocations[accountId] = true
}

function markTotalTouched(): void {
  touchedTotal.value = true
}

function resetTouched(): void {
  for (const key of Object.keys(touchedSnapshots)) {
    delete touchedSnapshots[key]
  }
  for (const key of Object.keys(touchedAllocations)) {
    delete touchedAllocations[key]
  }
  touchedTotal.value = false
}

/**
 * Recalcula las listas y valores por defecto del snapshot para el mes/fecha
 * seleccionados. Los campos que el usuario ya ha editado a mano (marcados en
 * `touchedSnapshots`/`touchedAllocations`/`touchedTotal`) se conservan tal
 * cual: cambiar de fecha o mes nunca debe borrar importes ya introducidos.
 */
function seed(): void {
  const workflow = investmentStore.buildWorkflowState(month.value, date.value)
  investmentsList.value = workflow.investments.map((item) => ({ id: item.id, name: item.name }))
  liquidityList.value = workflow.liquidity.map((item) => ({ id: item.id, name: item.name }))
  missingLiquidity.value = workflow.missingLiquidity

  const nextSnapKeys = new Set<string>()
  workflow.investments.forEach((item) => {
    const key = snapKey('investments', item.id)
    nextSnapKeys.add(key)
    if (!touchedSnapshots[key]) {
      snapValues[key] = item.value
    }
  })
  workflow.liquidity.forEach((item) => {
    const key = snapKey('accounts', item.id)
    nextSnapKeys.add(key)
    if (!touchedSnapshots[key]) {
      snapValues[key] = item.value
    }
  })
  for (const key of Object.keys(snapValues)) {
    if (!nextSnapKeys.has(key)) {
      delete snapValues[key]
      delete touchedSnapshots[key]
    }
  }

  const nextAllocKeys = new Set<string>()
  workflow.allocations.forEach((item) => {
    nextAllocKeys.add(item.accountId)
    if (!touchedAllocations[item.accountId]) {
      allocValues[item.accountId] = item.amount
    }
  })
  for (const key of Object.keys(allocValues)) {
    if (!nextAllocKeys.has(key)) {
      delete allocValues[key]
      delete touchedAllocations[key]
    }
  }

  if (!touchedTotal.value) {
    const allocatedTotal = workflow.allocations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    total.value = String(round2(allocatedTotal))
  }
}

function collectSnapshotInputs(): SnapshotInputValue[] {
  const inputs: SnapshotInputValue[] = []
  investmentsList.value.forEach((item) =>
    inputs.push({ kind: 'investments', id: item.id, value: snapValues[snapKey('investments', item.id)] ?? '' }),
  )
  liquidityList.value.forEach((item) =>
    inputs.push({ kind: 'accounts', id: item.id, value: snapValues[snapKey('accounts', item.id)] ?? '' }),
  )
  return inputs
}

function collectAllocations(): AllocationInputValue[] {
  return liquidityList.value.map((item) => ({
    accountId: item.id,
    amount: round2(Number(allocValues[item.id]) || 0),
  }))
}

const warnings = computed(() =>
  investmentStore.workflowWarnings(
    collectSnapshotInputs(),
    collectAllocations(),
    round2(Number(total.value) || 0),
    formatMoney,
  ),
)
const snapshotWarning = computed(() =>
  warnings.value.filter((message) => /snapshot|liquidez no configuradas/i.test(message)).join('\n'),
)
const allocationWarning = computed(() =>
  warnings.value.filter((message) => /asignar|sobreasignado/i.test(message)).join('\n'),
)

function open(): void {
  step.value = 1
  const today = todayISO()
  const currentMonth = monthFromISO(today) ?? ui.investmentMonth
  const selectedMonth = ui.investmentMonth
  month.value = selectedMonth
  date.value = selectedMonth === currentMonth ? today : toSnapshotDate(financialStateStore.year, selectedMonth)
  resetTouched()
  seed()
  dialogRef.value?.showModal?.()
}

function close(): void {
  closeCalc()
  if (dialogRef.value?.open) {
    dialogRef.value.close()
  }
}

function onMonthChange(event: Event): void {
  month.value = Number((event.target as HTMLSelectElement).value)
  date.value = toSnapshotDate(financialStateStore.year, month.value)
  seed()
}

function onDateChange(): void {
  const parsed = monthFromISO(date.value)
  if (parsed !== null) {
    month.value = parsed
  }
  seed()
}

function onSubmit(): void {
  if (step.value !== 2) {
    return
  }
  const saved = investmentStore.saveContribution(
    date.value,
    month.value,
    collectSnapshotInputs(),
    collectAllocations(),
    warnings.value,
  )
  if (saved) {
    close()
  }
}

function openCalc(kind: SnapshotKind, item: NamedItem): void {
  calcTargetKind.value = kind
  calcTargetId.value = item.id
  calcTargetName.value = item.name
  calcExpression.value = ''
  calcDialogRef.value?.showModal?.()
  void nextTick(() => calcExpressionInput.value?.focus())
}

function closeCalc(): void {
  if (calcDialogRef.value?.open) {
    calcDialogRef.value.close()
  }
  calcTargetKind.value = ''
  calcTargetId.value = ''
  calcTargetName.value = ''
  calcExpression.value = ''
}

function applyCalc(): void {
  if (!calcTargetKind.value || !calcTargetId.value) {
    closeCalc()
    return
  }
  const evaluated = evaluateNumericExpression(calcExpression.value)
  if (evaluated === null) {
    showToast('El cálculo no es válido.')
    calcExpressionInput.value?.focus()
    return
  }
  snapValues[snapKey(calcTargetKind.value, calcTargetId.value)] = String(round2(evaluated))
  touchedSnapshots[snapKey(calcTargetKind.value, calcTargetId.value)] = true
  showToast('Resultado aplicado al snapshot.')
  closeCalc()
}

defineExpose({ open })
</script>

<template>
  <dialog id="contribution-workflow-dialog" ref="dialogRef" class="contribution-workflow-dialog">
    <form
      id="contribution-workflow-form"
      class="contribution-workflow-form"
      autocomplete="off"
      novalidate
      @submit.prevent="onSubmit"
    >
      <div class="contribution-workflow-head">
        <h3 id="contribution-workflow-title">Nuevo aporte guiado</h3>
        <button
          id="contribution-workflow-close"
          type="button"
          class="tx-close-btn"
          aria-label="Cerrar recorrido"
          @click="close"
        >
          ✕
        </button>
      </div>

      <p class="contribution-workflow-intro">
        Antes de registrar el aporte, completa snapshots de inversión y liquidez. Después reparte el
        importe entre cuentas de liquidez.
      </p>

      <div class="contribution-workflow-date">
        <label>
          Mes del aporte
          <select
            id="contribution-workflow-month"
            name="contributionWorkflowMonth"
            :value="month"
            @change="onMonthChange"
          >
            <option v-for="(name, index) in MONTHS" :key="name" :value="index">{{ name }}</option>
          </select>
        </label>
        <label>
          Fecha del aporte
          <input
            id="contribution-workflow-date"
            v-model="date"
            name="contributionWorkflowDate"
            type="date"
            required
            @change="onDateChange"
          />
        </label>
      </div>

      <div
        id="contribution-workflow-step-snapshot"
        data-contribution-step="snapshot"
        :hidden="step !== 1"
      >
        <h4>Paso 1 · Snapshot previo</h4>
        <p>Actualiza el snapshot de inversiones y liquidez objetivo para el mes seleccionado.</p>
        <div
          id="contribution-workflow-snapshot-warning"
          class="workflow-warning"
          role="status"
          aria-live="polite"
        >
          {{ snapshotWarning }}
        </div>

        <div class="table-wrap compact contribution-workflow-table">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th>Snapshot inversión</th>
              </tr>
            </thead>
            <tbody id="contribution-workflow-investments-body">
              <tr v-if="!investmentsList.length">
                <td colspan="2">No hay activos de inversión configurados.</td>
              </tr>
              <tr v-for="item in investmentsList" v-else :key="item.id">
                <td>{{ item.name }}</td>
                <td>
                  <div class="snapshot-field-stack">
                    <input
                      v-model="snapValues[snapKey('investments', item.id)]"
                      type="number"
                      step="0.01"
                      data-contribution-snapshot-kind="investments"
                      :data-contribution-snapshot-id="item.id"
                      :aria-label="`Snapshot inversión ${item.name}`"
                      @input="markSnapshotTouched('investments', item.id)"
                    />
                    <button
                      type="button"
                      class="tx-btn-secondary snapshot-calc-btn"
                      :aria-label="`Calcular snapshot de ${item.name}`"
                      @click="openCalc('investments', item)"
                    >
                      Calcular
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="table-wrap compact contribution-workflow-table">
          <table>
            <thead>
              <tr>
                <th>Cuenta liquidez</th>
                <th>Snapshot liquidez</th>
              </tr>
            </thead>
            <tbody id="contribution-workflow-liquidity-body">
              <tr v-if="!liquidityList.length && !missingLiquidity.length">
                <td colspan="2">No hay cuentas de liquidez configuradas.</td>
              </tr>
              <tr v-for="item in liquidityList" :key="item.id">
                <td>{{ item.name }}</td>
                <td>
                  <div class="snapshot-field-stack">
                    <input
                      v-model="snapValues[snapKey('accounts', item.id)]"
                      type="number"
                      step="0.01"
                      data-contribution-snapshot-kind="accounts"
                      :data-contribution-snapshot-id="item.id"
                      :aria-label="`Snapshot liquidez ${item.name}`"
                      @input="markSnapshotTouched('accounts', item.id)"
                    />
                    <button
                      type="button"
                      class="tx-btn-secondary snapshot-calc-btn"
                      :aria-label="`Calcular snapshot de ${item.name}`"
                      @click="openCalc('accounts', item)"
                    >
                      Calcular
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-for="name in missingLiquidity" :key="name">
                <td>{{ name }}</td>
                <td class="text-(--expense)">Cuenta no configurada</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        id="contribution-workflow-step-allocation"
        data-contribution-step="allocation"
        :hidden="step !== 2"
      >
        <h4>Paso 2 · Reparto del aporte</h4>
        <p>Indica el importe total y reparte cuánto entra en cada cuenta de liquidez.</p>

        <label>
          Importe total del aporte
          <input
            id="contribution-workflow-total"
            v-model="total"
            name="contributionWorkflowTotal"
            type="number"
            min="0"
            step="0.01"
            @input="markTotalTouched"
          />
        </label>

        <div class="table-wrap compact contribution-workflow-table">
          <table>
            <thead>
              <tr>
                <th>Cuenta liquidez</th>
                <th>Importe asignado</th>
              </tr>
            </thead>
            <tbody id="contribution-workflow-allocation-body">
              <tr v-if="!liquidityList.length">
                <td colspan="2">No hay cuentas objetivo para repartir el aporte.</td>
              </tr>
              <tr v-for="item in liquidityList" v-else :key="item.id">
                <td>{{ item.name }}</td>
                <td>
                  <input
                    v-model="allocValues[item.id]"
                    type="number"
                    step="0.01"
                    min="0"
                    :data-contribution-allocation-account-id="item.id"
                    :aria-label="`Asignación aporte ${item.name}`"
                    @input="markAllocationTouched(item.id)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          id="contribution-workflow-allocation-warning"
          class="workflow-warning"
          role="status"
          aria-live="polite"
        >
          {{ allocationWarning }}
        </div>
      </div>

      <div class="contribution-workflow-actions">
        <button
          id="contribution-workflow-prev"
          type="button"
          class="tx-btn-secondary"
          :hidden="step === 1"
          @click="step = 1"
        >
          Anterior
        </button>
        <button
          id="contribution-workflow-next"
          type="button"
          class="tx-btn-secondary"
          :hidden="step !== 1"
          @click="step = 2"
        >
          Siguiente
        </button>
        <button
          id="contribution-workflow-save"
          type="submit"
          class="tx-btn-primary"
          formnovalidate
          :hidden="step === 1"
        >
          Guardar aporte (con avisos)
        </button>
      </div>
    </form>
  </dialog>

  <dialog id="contribution-calc-dialog" ref="calcDialogRef" class="wealth-calc-dialog">
    <form id="contribution-calc-form" class="wealth-calc-form" autocomplete="off" @submit.prevent="applyCalc">
      <div class="wealth-calc-head">
        <h3 id="contribution-calc-title">{{ calcTitle }}</h3>
        <button
          id="contribution-calc-close"
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
          id="contribution-calc-expression"
          ref="calcExpressionInput"
          v-model="calcExpression"
          name="contributionCalcExpression"
          type="text"
          placeholder="Ej: 1200+35,5*2"
          autocomplete="off"
        />
      </label>
      <div class="wealth-calc-actions">
        <button id="contribution-calc-apply" type="submit" class="tx-btn-primary">
          Aplicar al snapshot
        </button>
      </div>
    </form>
  </dialog>
</template>
