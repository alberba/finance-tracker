<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import SidePanel from '../ui/SidePanel.vue'
import PanelSectionTitle from '../ui/PanelSectionTitle.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { ruleMonthlyEquivalent } from '../../domain/investment/view-model'
import { parseDecimal } from '../../lib/number'
import type { RecurringFrequency, RecurringRule } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMovementsStore } from '../../stores/movements'
import { useRecurringStore } from '../../stores/recurring'

// Creates and edits an income or expense rule in the side panel. Each due
// date becomes a pending movement in Movimientos.
type RuleType = 'income' | 'expense'

const financialStateStore = useFinancialStateStore()
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()
const { formatMoney } = useMoneyFormatter()

const emit = defineEmits<{ delete: [rule: RecurringRule] }>()

const TYPE_OPTIONS: SegmentedOption<RuleType>[] = [
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
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
  type: 'expense' as RuleType,
  description: '',
  category: '',
  accountId: '',
  amount: '',
  frequency: 'monthly' as RecurringFrequency,
  interval: '1',
  startDate: '',
  endDate: '',
})

const isEditing = computed(() => editing.value !== null)
const accountOptions = computed(() =>
  financialStateStore.accounts.map((account) => ({ value: account.id, label: account.name })),
)
// A type with no categories still gets one, as the rule needs a category.
const UNCATEGORIZED = 'Sin categoría'
function categoriesOf(type: RuleType): string[] {
  const categories = movementsStore.orderedCategories(type)
  return categories.length ? categories : [UNCATEGORIZED]
}

const categoryOptions = computed(() =>
  categoriesOf(form.type).map((category) => ({ value: category, label: category })),
)

watch(
  () => form.type,
  () => {
    if (!categoryOptions.value.some((option) => option.value === form.category)) {
      form.category = categoryOptions.value[0]?.value ?? ''
    }
  },
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
  const type: RuleType = rule?.type === 'income' ? 'income' : 'expense'
  Object.assign(form, {
    type,
    description: rule?.description ?? '',
    category: rule?.category ?? categoriesOf(type)[0],
    accountId: rule?.accountId ?? accountOptions.value[0]?.value ?? '',
    amount: rule ? String(rule.amount).replace('.', ',') : '',
    frequency: rule?.frequency ?? 'monthly',
    interval: String(rule?.interval ?? 1),
    startDate: rule?.startDate ?? todayISO(),
    endDate: rule?.endDate ?? '',
  })
}

function openNew(): void {
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
  const input = {
    type: form.type,
    accountId: form.accountId,
    category: form.category,
    description: form.description,
    amount: numberOf(form.amount),
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

function requestDelete(): void {
  const rule = editing.value
  open.value = false
  if (rule) emit('delete', rule)
}

defineExpose({ openNew, openEdit })
</script>

<template>
  <SidePanel
    id="settings-recurring-panel"
    v-model:open="open"
    kicker="Regla recurrente"
    :title="isEditing ? 'Editar regla' : 'Nueva regla'"
    title-id="settings-recurring-panel-title"
  >
    <form id="settings-recurring-form" class="grid gap-6" autocomplete="off" @submit.prevent="save">
      <SegmentedControl
        v-model="form.type"
        :options="TYPE_OPTIONS"
        label="Tipo de regla"
        variant="soft"
        class="[&>button]:h-11 [&>button]:flex-1"
      />

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <PanelSectionTitle>Qué</PanelSectionTitle>
        <BaseInput
          v-model="form.description"
          class="sm:col-span-2"
          label="Descripción"
          name="description"
          placeholder="Alquiler"
          required
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
          label="Cuenta"
          name="accountId"
          :options="accountOptions"
          required
        />
      </fieldset>

      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <PanelSectionTitle>Cada cuánto</PanelSectionTitle>
        <SegmentedControl
          v-model="form.frequency"
          :options="FREQUENCY_OPTIONS"
          label="Frecuencia"
          variant="soft"
          data-key="frequency"
          class="flex-wrap sm:col-span-2 [&>button]:h-11 [&>button]:flex-auto [&>button]:whitespace-nowrap"
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
      </fieldset>

      <fieldset class="grid gap-3.5">
        <PanelSectionTitle>Importe</PanelSectionTitle>
        <BaseInput
          v-model="form.amount"
          variant="amount"
          suffix="€"
          label="Importe"
          name="amount"
          inputmode="decimal"
          required
        />
        <div
          class="bg-ink border-ink-line text-ink-text flex items-center justify-between gap-4 rounded-md border px-5 py-4"
          data-recurring-monthly
        >
          <span class="text-ink-muted text-sm">Al mes, de media</span>
          <p class="font-display text-2xl font-medium tabular-nums">
            {{ form.type === 'income' ? '+' : '−' }}{{ formatMoney(monthly) }}
          </p>
        </div>
      </fieldset>
    </form>

    <template #footer>
      <BaseButton v-if="isEditing" variant="danger" class="mr-auto" @click="requestDelete">
        Eliminar
      </BaseButton>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton variant="primary" type="submit" form="settings-recurring-form">
        {{ isEditing ? 'Guardar cambios' : 'Crear regla' }}
      </BaseButton>
    </template>
  </SidePanel>
</template>
