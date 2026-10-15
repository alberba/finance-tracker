<script setup lang="ts">
import SetupRequirement from '../onboarding/SetupRequirement.vue'
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { computed, reactive, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import SidePanel from '../ui/SidePanel.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { ruleMonthlyEquivalent } from '../../domain/investment/view-model'
import { parseDecimal } from '../../lib/number'
import type { InvestmentSide, RecurringFrequency, RecurringRule } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMovementsStore } from '../../stores/movements'
import { useRecurringStore, type NewRecurringRuleInput } from '../../stores/recurring'

// Creates and edits a recurring purchase in the side panel. Each due date
// becomes a pending movement with these units, price and fee.
const financialStateStore = useFinancialStateStore()
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()
const { formatMoney } = useMoneyFormatter()

const emit = defineEmits<{ delete: [rule: RecurringRule] }>()

const SIDE_OPTIONS: SegmentedOption<InvestmentSide>[] = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venta' },
]
const FREQUENCY_OPTIONS: SegmentedOption<RecurringFrequency>[] = [
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'monthEnd', label: 'Fin de mes' },
  { value: 'yearly', label: 'Anual' },
]

const open = ref(false)
const editing = ref<RecurringRule | null>(null)
const form = reactive({
  description: '',
  symbol: '',
  category: '',
  accountId: '',
  side: 'buy' as InvestmentSide,
  amount: '',
  units: '',
  unitPrice: '',
  fee: '0',
  frequency: 'monthly' as RecurringFrequency,
  interval: '1',
  startDate: '',
  endDate: '',
  time: '',
})

const isEditing = computed(() => editing.value !== null)
const accountOptions = computed(() =>
  financialStateStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
const categoryOptions = computed(() =>
  movementsStore
    .orderedCategories('investment')
    .map((category) => ({ value: category, label: category })),
)

function numberOf(text: string): number {
  const value = parseDecimal(text)
  return Number.isFinite(value) ? value : 0
}

const interval = computed(() => Math.max(1, Math.floor(numberOf(form.interval)) || 1))
const monthly = computed(() =>
  ruleMonthlyEquivalent({
    amount: numberOf(form.amount),
    frequency: form.frequency,
    interval: interval.value,
  }),
)

function fill(rule: RecurringRule | null): void {
  Object.assign(form, {
    description: rule?.description ?? '',
    symbol: rule?.symbol ?? '',
    category: rule?.category ?? categoryOptions.value[0]?.value ?? '',
    accountId: rule?.accountId ?? accountOptions.value[0]?.value ?? '',
    side: rule?.side ?? 'buy',
    amount: rule ? String(rule.amount) : '',
    units: rule?.units ? String(rule.units) : '',
    unitPrice: rule?.unitPrice ? String(rule.unitPrice) : '',
    fee: String(rule?.fee ?? 0),
    frequency: rule?.frequency ?? 'monthly',
    interval: String(rule?.interval ?? 1),
    startDate: rule?.startDate ?? todayISO(),
    endDate: rule?.endDate ?? '',
    time: rule?.time ?? '',
  })
}

function openNew(): void {
  if (needsAccount.value) return
  editing.value = null
  fill(null)
  open.value = true
}

function openEdit(rule: RecurringRule): void {
  editing.value = rule
  fill(rule)
  open.value = true
}

function save(): void {
  if (needsAccount.value) return
  const input: NewRecurringRuleInput = {
    type: 'investment',
    accountId: form.accountId,
    category: form.category,
    description: form.description,
    amount: numberOf(form.amount),
    symbol: form.symbol,
    side: form.side,
    units: numberOf(form.units),
    unitPrice: numberOf(form.unitPrice),
    fee: numberOf(form.fee),
    time: form.time,
    frequency: form.frequency,
    interval: interval.value,
    startDate: form.startDate,
    endDate: form.endDate,
  }
  const saved = editing.value
    ? recurringStore.updateRule(editing.value.id, input)
    : recurringStore.addRule(input)
  if (saved) open.value = false
}

// On small screens the plan hides its row actions: deleting starts here.
function requestDelete(): void {
  const rule = editing.value
  open.value = false
  if (rule) emit('delete', rule)
}

defineExpose({ openNew, openEdit })
const { needsAccount } = useAccountRequirement()
</script>

<template>
  <SidePanel
    id="investment-recurring-panel"
    v-model:open="open"
    kicker="Compra recurrente"
    :title="isEditing ? 'Editar compra recurrente' : 'Nueva compra recurrente'"
    title-id="investment-recurring-panel-title"
  >
    <SetupRequirement
      v-if="needsAccount"
      message="Crea una cuenta para guardar este formulario."
      @resolve="open = false"
    />
    <form
      id="investment-recurring-form"
      class="grid gap-6"
      autocomplete="off"
      @submit.prevent="save"
    >
      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Activo
        </legend>
        <BaseInput
          v-model="form.description"
          class="sm:col-span-2"
          label="Descripción"
          name="description"
          placeholder="Compra mensual VWCE"
          required
        />
        <BaseInput
          v-model="form.symbol"
          label="Símbolo"
          name="symbol"
          maxlength="20"
          placeholder="VWCE"
          required
          class="[&_input]:font-mono"
        />
        <BaseSelect
          v-model="form.category"
          label="Categoría"
          name="category"
          :options="categoryOptions"
          required
        />
        <BaseSelect
          v-model="form.accountId"
          class="sm:col-span-2"
          label="Cuenta"
          name="accountId"
          :options="accountOptions"
          required
        />
      </fieldset>

      <fieldset class="grid grid-cols-2 gap-3.5">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Cada cuánto
        </legend>
        <SegmentedControl
          v-model="form.frequency"
          :options="FREQUENCY_OPTIONS"
          label="Frecuencia"
          variant="soft"
          data-key="frequency"
          class="col-span-2 flex-wrap [&>button]:h-11 [&>button]:flex-auto [&>button]:whitespace-nowrap"
        />
        <BaseInput
          v-model="form.interval"
          label="Intervalo"
          name="interval"
          type="number"
          min="1"
          step="1"
          class="[&_input]:font-display [&_input]:text-right"
        />
        <BaseInput
          v-model="form.startDate"
          label="Fecha inicial"
          name="startDate"
          type="date"
          required
        />
        <BaseInput v-model="form.endDate" label="Fecha final" name="endDate" type="date" />
        <BaseInput v-model="form.time" label="Hora" name="time" type="time" />
      </fieldset>

      <fieldset class="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Importe
        </legend>
        <SegmentedControl
          v-model="form.side"
          :options="SIDE_OPTIONS"
          label="Operación"
          variant="soft"
          class="col-span-full [&>button]:h-11 [&>button]:flex-1"
        />
        <BaseInput
          v-model="form.amount"
          class="[&_input]:font-display col-span-full [&_input]:text-right"
          label="Importe por compra (€)"
          name="amount"
          inputmode="decimal"
          required
        />
        <BaseInput
          v-model="form.units"
          label="Títulos"
          name="units"
          inputmode="decimal"
          class="[&_input]:font-display [&_input]:text-right"
        />
        <BaseInput
          v-model="form.unitPrice"
          label="Precio por título"
          name="unitPrice"
          inputmode="decimal"
          class="[&_input]:font-display [&_input]:text-right"
        />
        <BaseInput
          v-model="form.fee"
          label="Comisiones"
          name="fee"
          inputmode="decimal"
          class="[&_input]:font-display [&_input]:text-right"
        />
        <div
          class="bg-ink border-ink-line text-ink-text col-span-full flex items-center justify-between gap-4 rounded-md border px-5 py-4"
          data-recurring-monthly
        >
          <span class="text-ink-muted text-sm">Suma al comprometido al mes</span>
          <p class="font-display text-2xl font-medium tabular-nums">≈ {{ formatMoney(monthly) }}</p>
        </div>
      </fieldset>
    </form>

    <template #footer>
      <BaseButton v-if="isEditing" variant="danger" class="mr-auto" @click="requestDelete">
        Eliminar
      </BaseButton>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="needsAccount"
        type="submit"
        form="investment-recurring-form"
      >
        {{ isEditing ? 'Guardar cambios' : 'Crear regla' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
