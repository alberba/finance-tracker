<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SidePanel from '../ui/SidePanel.vue'
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
import { useStockEventsStore } from '../../stores/stockevents'
import { useUiStore } from '../../stores/ui'

// A new contribution in two steps, in the side panel: first the value of the
// investments and the liquidity accounts on the date (so the contribution is
// not read as return), then the total and how it splits across the accounts.
const investmentStore = useInvestmentStore()
const stockEventsStore = useStockEventsStore()
const financialStateStore = useFinancialStateStore()
const ui = useUiStore().ui
const { formatMoney } = useMoneyFormatter()
const { showToast } = useToast()

interface NamedItem {
  id: string
  name: string
}

const open = ref(false)
const step = ref<1 | 2>(1)
const month = ref(0)
const date = ref('')
const total = ref('0')
const syncStockEventsCash = ref(false)

const investmentsList = ref<NamedItem[]>([])
const liquidityList = ref<NamedItem[]>([])
const missingLiquidity = ref<string[]>([])
const snapValues = reactive<Record<string, string>>({})
const allocValues = reactive<Record<string, string>>({})

// Fields the user has typed in survive a date or month change: reseeding only
// refreshes the untouched ones (see issue #48).
const touchedSnapshots = reactive<Record<string, boolean>>({})
const touchedAllocations = reactive<Record<string, boolean>>({})
const touchedTotal = ref(false)

/** The row whose value the inline calculator is filling, as a snapshot key. */
const calcKey = ref('')
const calcExpression = ref('')

const STEPS = [
  { step: 1, label: 'Snapshot previo' },
  { step: 2, label: 'Reparto del aporte' },
] as const

const monthOptions = MONTHS.map((label, index) => ({ value: index, label }))

function snapKey(kind: SnapshotKind, id: string): string {
  return `${kind}:${id}`
}

function resetTouched(): void {
  for (const key of Object.keys(touchedSnapshots)) delete touchedSnapshots[key]
  for (const key of Object.keys(touchedAllocations)) delete touchedAllocations[key]
  touchedTotal.value = false
}

/** Lists and default values for the month and date, keeping what was typed. */
function seed(): void {
  const workflow = investmentStore.buildWorkflowState(month.value, date.value)
  investmentsList.value = workflow.investments.map(({ id, name }) => ({ id, name }))
  liquidityList.value = workflow.liquidity.map(({ id, name }) => ({ id, name }))
  missingLiquidity.value = workflow.missingLiquidity

  const nextSnapKeys = new Set<string>()
  const seedSnapshot = (kind: SnapshotKind, item: { id: string; value: string }) => {
    const key = snapKey(kind, item.id)
    nextSnapKeys.add(key)
    if (!touchedSnapshots[key]) snapValues[key] = item.value
  }
  workflow.investments.forEach((item) => seedSnapshot('investments', item))
  workflow.liquidity.forEach((item) => seedSnapshot('accounts', item))
  for (const key of Object.keys(snapValues)) {
    if (!nextSnapKeys.has(key)) {
      delete snapValues[key]
      delete touchedSnapshots[key]
    }
  }

  const nextAllocKeys = new Set<string>()
  workflow.allocations.forEach((item) => {
    nextAllocKeys.add(item.accountId)
    if (!touchedAllocations[item.accountId]) allocValues[item.accountId] = item.amount
  })
  for (const key of Object.keys(allocValues)) {
    if (!nextAllocKeys.has(key)) {
      delete allocValues[key]
      delete touchedAllocations[key]
    }
  }

  if (!touchedTotal.value) {
    const allocated = workflow.allocations.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0,
    )
    total.value = String(round2(allocated))
  }
}

function collectSnapshotInputs(): SnapshotInputValue[] {
  return [
    ...investmentsList.value.map((item) => ({
      kind: 'investments' as const,
      id: item.id,
      value: snapValues[snapKey('investments', item.id)] ?? '',
    })),
    ...liquidityList.value.map((item) => ({
      kind: 'accounts' as const,
      id: item.id,
      value: snapValues[snapKey('accounts', item.id)] ?? '',
    })),
  ]
}

function collectAllocations(): AllocationInputValue[] {
  return liquidityList.value.map((item) => ({
    accountId: item.id,
    amount: round2(Number(allocValues[item.id]) || 0),
  }))
}

const totalAmount = computed(() => round2(Number(total.value) || 0))
const assigned = computed(() =>
  round2(collectAllocations().reduce((sum, item) => sum + item.amount, 0)),
)
const remaining = computed(() => round2(totalAmount.value - assigned.value))

const warnings = computed(() =>
  investmentStore.workflowWarnings(
    collectSnapshotInputs(),
    collectAllocations(),
    totalAmount.value,
    formatMoney,
  ),
)
const snapshotWarning = computed(() =>
  warnings.value.filter((message) => /snapshot|liquidez no configuradas/i.test(message)).join('\n'),
)
const allocationWarning = computed(() =>
  warnings.value.filter((message) => /asignar|sobreasignado/i.test(message)).join('\n'),
)

const remainingLabel = computed(() => {
  if (remaining.value === 0) return 'Todo repartido'
  return remaining.value > 0 ? 'Falta por repartir' : 'Repartido de más'
})

function onMonthChange(value: number): void {
  month.value = value
  date.value = toSnapshotDate(financialStateStore.year, value)
  seed()
}

function onDateChange(value: string): void {
  date.value = value
  const parsed = monthFromISO(value)
  if (parsed !== null) month.value = parsed
  seed()
}

function openPanel(): void {
  step.value = 1
  const today = todayISO()
  const currentMonth = monthFromISO(today) ?? ui.investmentMonth
  month.value = ui.investmentMonth
  date.value =
    month.value === currentMonth ? today : toSnapshotDate(financialStateStore.year, month.value)
  syncStockEventsCash.value = false
  closeCalc()
  resetTouched()
  seed()
  open.value = true
}

function save(): void {
  // Enter in a step-1 field submits the form: it must never save.
  if (step.value !== 2) return
  const saved = investmentStore.saveContribution(
    date.value,
    month.value,
    collectSnapshotInputs(),
    collectAllocations(),
    warnings.value,
    { syncStockEventsCash: syncStockEventsCash.value },
  )
  if (saved) open.value = false
}

function setSnapshot(kind: SnapshotKind, id: string, value: string): void {
  snapValues[snapKey(kind, id)] = value
  touchedSnapshots[snapKey(kind, id)] = true
}

function setAllocation(accountId: string, value: string): void {
  allocValues[accountId] = value
  touchedAllocations[accountId] = true
}

function setTotal(value: string): void {
  total.value = value
  touchedTotal.value = true
}

function openCalc(kind: SnapshotKind, id: string): void {
  calcKey.value = snapKey(kind, id)
  calcExpression.value = ''
  void nextTick(() => document.getElementById('contribution-calc-expression')?.focus())
}

function closeCalc(): void {
  calcKey.value = ''
  calcExpression.value = ''
}

function applyCalc(): void {
  const evaluated = evaluateNumericExpression(calcExpression.value)
  if (evaluated === null) {
    showToast('El cálculo no es válido.')
    return
  }
  snapValues[calcKey.value] = String(round2(evaluated))
  touchedSnapshots[calcKey.value] = true
  closeCalc()
}

const snapshotGroups = computed(() => [
  {
    kind: 'investments' as const,
    title: 'Inversiones · valor a la fecha',
    label: 'Valor de',
    items: investmentsList.value,
    empty: 'No hay activos de inversión configurados.',
  },
  {
    kind: 'accounts' as const,
    title: 'Liquidez · saldo antes del aporte',
    label: 'Saldo de',
    items: liquidityList.value,
    empty: 'No hay cuentas de liquidez configuradas.',
  },
])

defineExpose({ open: openPanel })
</script>

<template>
  <SidePanel
    id="contribution-workflow-dialog"
    v-model:open="open"
    kicker="Aporte"
    title="Nuevo aporte"
    title-id="contribution-workflow-title"
  >
    <ol class="grid grid-cols-2 gap-3" aria-label="Pasos del aporte">
      <li
        v-for="item in STEPS"
        :key="item.step"
        class="grid gap-2"
        :aria-current="item.step === step ? 'step' : undefined"
      >
        <span
          class="h-0.75 rounded-full"
          :class="item.step <= step ? 'bg-primary' : 'bg-line-strong'"
          aria-hidden="true"
        ></span>
        <span
          class="flex items-baseline gap-2 text-sm font-bold"
          :class="item.step === step ? 'text-text-main' : 'text-text-muted'"
        >
          <span
            class="font-display text-xs font-medium tabular-nums"
            :class="item.step <= step ? 'text-primary' : 'text-text-muted'"
            >0{{ item.step }}</span
          >
          {{ item.label }}
        </span>
      </li>
    </ol>

    <form
      id="contribution-workflow-form"
      class="grid gap-6"
      autocomplete="off"
      novalidate
      @submit.prevent="save"
    >
      <div class="grid grid-cols-2 gap-3.5">
        <BaseSelect
          id="contribution-workflow-month"
          :model-value="month"
          label="Mes del aporte"
          name="contributionWorkflowMonth"
          :options="monthOptions"
          @update:model-value="onMonthChange"
        />
        <BaseInput
          id="contribution-workflow-date"
          :model-value="date"
          label="Fecha"
          name="contributionWorkflowDate"
          type="date"
          required
          @update:model-value="onDateChange"
        />
      </div>

      <div
        id="contribution-workflow-step-snapshot"
        class="grid gap-6"
        data-contribution-step="snapshot"
        :hidden="step !== 1"
      >
        <p class="text-text-muted text-[0.9375rem] leading-relaxed">
          Fija el valor de tus inversiones y el saldo de las cuentas de liquidez a esta fecha. Así
          el aporte no se confunde con rentabilidad.
        </p>

        <section
          v-for="group in snapshotGroups"
          :key="group.kind"
          class="grid"
          :aria-labelledby="`contribution-snapshot-${group.kind}`"
        >
          <h3
            :id="`contribution-snapshot-${group.kind}`"
            class="text-text-muted mb-2.5 text-xs font-bold tracking-widest uppercase"
          >
            {{ group.title }}
          </h3>
          <p v-if="!group.items.length" class="text-text-muted text-sm">{{ group.empty }}</p>
          <div
            v-for="item in group.items"
            :key="item.id"
            class="border-line grid gap-2.5 border-t py-2.5"
            :data-contribution-snapshot-row="group.kind"
          >
            <div class="grid grid-cols-[minmax(0,1fr)_9.75rem_auto] items-center gap-2.5">
              <span class="min-w-0 text-[0.9375rem] font-semibold">{{ item.name }}</span>
              <BaseInput
                :model-value="snapValues[snapKey(group.kind, item.id)] ?? ''"
                :label="`${group.label} ${item.name}`"
                hide-label
                type="number"
                step="0.01"
                inputmode="decimal"
                class="[&_input]:font-display [&_input]:text-right"
                :data-contribution-snapshot-kind="group.kind"
                :data-contribution-snapshot-id="item.id"
                @update:model-value="setSnapshot(group.kind, item.id, $event)"
              />
              <BaseButton
                variant="secondary"
                class="px-3"
                :aria-label="`Calcular el valor de ${item.name}`"
                :aria-expanded="calcKey === snapKey(group.kind, item.id)"
                @click="openCalc(group.kind, item.id)"
              >
                <svg
                  class="size-4.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.9"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
                </svg>
              </BaseButton>
            </div>
            <div
              v-if="calcKey === snapKey(group.kind, item.id)"
              class="bg-subtle grid gap-3 rounded-md p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              data-contribution-calc
            >
              <BaseInput
                id="contribution-calc-expression"
                v-model="calcExpression"
                label="Cálculo"
                placeholder="Ej: 1200+35,5*2"
                class="[&_input]:font-display"
                @keydown.enter.prevent="applyCalc"
              />
              <div class="flex gap-2">
                <BaseButton variant="ghost" @click="closeCalc">Cancelar</BaseButton>
                <BaseButton variant="primary" @click="applyCalc">Aplicar al valor</BaseButton>
              </div>
            </div>
          </div>
        </section>

        <p
          v-for="name in missingLiquidity"
          :key="name"
          class="border-accent bg-accent/10 text-text-main rounded-md border px-3.5 py-3 text-sm"
          data-contribution-missing-liquidity
        >
          <strong>{{ name }}</strong> no está configurada como cuenta de liquidez y no recibirá
          parte del aporte.
        </p>

        <p
          id="contribution-workflow-snapshot-warning"
          class="text-text-main text-sm whitespace-pre-line empty:hidden"
          role="status"
          aria-live="polite"
          v-text="snapshotWarning"
        ></p>
      </div>

      <div
        id="contribution-workflow-step-allocation"
        class="grid gap-6"
        data-contribution-step="allocation"
        :hidden="step !== 2"
      >
        <p class="text-text-muted text-[0.9375rem] leading-relaxed">
          Indica cuánto aportas y en qué cuentas de liquidez entra.
        </p>

        <BaseInput
          id="contribution-workflow-total"
          :model-value="total"
          label="Importe total del aporte"
          name="contributionWorkflowTotal"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          suffix="€"
          class="[&_input]:font-display [&_input]:text-right [&_input]:text-xl"
          @update:model-value="setTotal"
        />

        <section class="grid" aria-labelledby="contribution-allocation-title">
          <h3
            id="contribution-allocation-title"
            class="text-text-muted mb-2.5 text-xs font-bold tracking-widest uppercase"
          >
            Reparto entre cuentas
          </h3>
          <p v-if="!liquidityList.length" class="text-text-muted text-sm">
            No hay cuentas de liquidez para repartir el aporte.
          </p>
          <div
            v-for="item in liquidityList"
            :key="item.id"
            class="border-line grid grid-cols-[minmax(0,1fr)_9.75rem] items-center gap-2.5 border-t py-2.5"
            data-contribution-allocation-row
          >
            <span class="text-[0.9375rem] font-semibold">{{ item.name }}</span>
            <BaseInput
              :model-value="allocValues[item.id] ?? ''"
              :label="`Importe del aporte para ${item.name}`"
              hide-label
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              class="[&_input]:font-display [&_input]:text-right"
              :data-contribution-allocation-account-id="item.id"
              @update:model-value="setAllocation(item.id, $event)"
            />
          </div>
        </section>

        <div
          class="bg-ink border-ink-line text-ink-text flex items-center justify-between gap-4 rounded-md border px-5 py-4"
          data-contribution-remaining
        >
          <div class="grid gap-1">
            <span class="text-ink-muted text-sm">{{ remainingLabel }}</span>
            <span class="font-display text-ink-text/80 text-sm tabular-nums">
              {{ formatMoney(totalAmount) }} − {{ formatMoney(assigned) }} asignados
            </span>
          </div>
          <p class="font-display text-2xl font-medium tabular-nums">
            {{ formatMoney(Math.abs(remaining)) }}
          </p>
        </div>

        <p
          id="contribution-workflow-allocation-warning"
          class="text-text-main text-sm whitespace-pre-line empty:hidden"
          role="status"
          aria-live="polite"
          v-text="allocationWarning"
        ></p>

        <label
          v-if="stockEventsStore.canSyncContributionCash"
          class="border-line flex min-h-11 items-start gap-3 border-t pt-3.5 text-[0.9375rem] font-medium"
        >
          <input
            v-model="syncStockEventsCash"
            type="checkbox"
            class="accent-primary mt-0.5 size-4.5"
          />
          <span class="grid gap-0.5">
            Añadir las asignaciones al efectivo de Stock Events
            <span class="text-text-muted text-sm font-normal">
              Cada cuenta usa la lista que tiene asociada en Configuración.
            </span>
          </span>
        </label>
      </div>
    </form>

    <template #footer>
      <BaseButton v-if="step === 2" variant="ghost" class="mr-auto" @click="step = 1">
        Anterior
      </BaseButton>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton v-if="step === 1" variant="primary" @click="step = 2">
        Siguiente: reparto
      </BaseButton>
      <BaseButton v-else variant="primary" type="submit" form="contribution-workflow-form">
        {{ warnings.length ? 'Guardar con avisos' : 'Guardar aporte' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
