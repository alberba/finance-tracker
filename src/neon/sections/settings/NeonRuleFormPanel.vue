<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import type { RecurringFrequency } from '../../../scripts/types'
import { todayISO } from '../../../scripts/utils'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMovementsStore } from '../../../stores/movements'
import { useRecurringStore } from '../../../stores/recurring'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { parseAmount } from './view-model'

// «Nueva regla»: the income, expense or saving that repeats, and every date it
// falls due becomes a pending movement in Movimientos. The description typed
// in the add row of the table arrives already filled in.
type RuleType = 'income' | 'expense' | 'saving'

const props = defineProps<{ description: string }>()
const emit = defineEmits<{ created: [] }>()
const open = defineModel<boolean>('open', { required: true })

const financialStateStore = useFinancialStateStore()
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()

const FORM_ID = 'neon-rule-form'
const UNCATEGORIZED = 'Sin categoría'
const TYPES: ReadonlyArray<{ value: RuleType; label: string }> = [
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
  { value: 'saving', label: 'Ahorro' },
]
const FREQUENCIES: ReadonlyArray<{ value: RecurringFrequency; label: string }> = [
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'monthEnd', label: 'Fin de mes' },
  { value: 'yearly', label: 'Anual' },
]

const form = reactive({
  type: 'expense' as RuleType,
  description: '',
  category: '',
  accountId: '',
  destinationAccountId: '',
  amount: '',
  frequency: 'monthly' as RecurringFrequency,
  interval: '1',
  startDate: '',
})

const accounts = computed(() => financialStateStore.accounts)
const categories = computed(() => {
  const list = movementsStore.orderedCategories(form.type)
  return list.length ? list : [UNCATEGORIZED]
})
// A saving never lands in the account it leaves.
const destinations = computed(() => accounts.value.filter((a) => a.id !== form.accountId))
const isSaving = computed(() => form.type === 'saving')

function settle(): void {
  if (!categories.value.includes(form.category)) form.category = categories.value[0]
  if (isSaving.value && !destinations.value.some((a) => a.id === form.destinationAccountId)) {
    form.destinationAccountId = destinations.value[0]?.id ?? ''
  }
}
watch(() => [form.type, form.accountId], settle)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, {
      type: 'expense',
      description: props.description.trim(),
      category: '',
      accountId: accounts.value[0]?.id ?? '',
      destinationAccountId: '',
      amount: '',
      frequency: 'monthly',
      interval: '1',
      startDate: todayISO(),
    })
    settle()
  },
  { immediate: true },
)

const amount = computed(() => parseAmount(form.amount))
const interval = computed(() => Math.max(1, Math.floor(Number(form.interval)) || 1))
const valid = computed(
  () =>
    Boolean(form.description.trim() && form.accountId && form.startDate) &&
    amount.value !== null &&
    amount.value > 0 &&
    (!isSaving.value || Boolean(form.destinationAccountId)),
)

function save(): void {
  if (!valid.value) return
  const created = recurringStore.addRule({
    type: form.type,
    accountId: form.accountId,
    destinationAccountId: isSaving.value ? form.destinationAccountId : undefined,
    category: form.category,
    description: form.description.trim(),
    amount: amount.value ?? 0,
    frequency: form.frequency,
    interval: interval.value,
    startDate: form.startDate,
  })
  if (!created) return
  open.value = false
  emit('created')
}

const fieldClass =
  'min-w-0 bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
</script>

<template>
  <NeonDetailPanel v-model:open="open" title="Nueva regla" kicker="Regla recurrente">
    <form
      :id="FORM_ID"
      class="grid grid-cols-[minmax(0,1fr)] gap-[22px]"
      autocomplete="off"
      @submit.prevent="save"
    >
      <div
        class="rounded-pill bg-panel2 flex gap-1 p-[3px]"
        role="group"
        aria-label="Tipo de regla"
      >
        <button
          v-for="type in TYPES"
          :key="type.value"
          type="button"
          :aria-pressed="form.type === type.value"
          class="rounded-pill outline-accent min-h-9 flex-1 px-2 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="form.type === type.value ? 'bg-sel-bg text-sel-text' : 'text-soft'"
          @click="form.type = type.value"
        >
          {{ type.label }}
        </button>
      </div>

      <label :class="labelClass">
        Descripción
        <input
          v-model="form.description"
          name="description"
          placeholder="Alquiler"
          :class="fieldClass"
        />
      </label>

      <label class="text-muted grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-[13px] font-bold">
        Importe
        <span class="border-ctrl-line flex items-baseline gap-2 border-b-2">
          <input
            v-model="form.amount"
            name="amount"
            inputmode="decimal"
            placeholder="0,00"
            class="font-display text-text placeholder:text-faint min-w-0 flex-1 bg-transparent py-0.5 text-[32px] font-bold tracking-[-0.02em] outline-none"
          />
          <span class="font-display text-muted text-[20px] font-bold" aria-hidden="true">€</span>
        </span>
      </label>

      <label :class="labelClass">
        Categoría
        <select v-model="form.category" name="category" :class="fieldClass">
          <option v-for="category in categories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </label>

      <label :class="labelClass">
        {{ isSaving ? 'Cuenta origen' : 'Cuenta' }}
        <select v-model="form.accountId" name="accountId" :class="fieldClass">
          <option v-for="account in accounts" :key="account.id" :value="account.id">
            {{ account.name }}
          </option>
        </select>
      </label>

      <label v-if="isSaving" :class="labelClass">
        Cuenta destino
        <select v-model="form.destinationAccountId" name="destinationAccountId" :class="fieldClass">
          <option v-for="account in destinations" :key="account.id" :value="account.id">
            {{ account.name }}
          </option>
        </select>
      </label>

      <div class="grid grid-cols-2 gap-3.5">
        <label :class="labelClass">
          Frecuencia
          <select v-model="form.frequency" name="frequency" :class="fieldClass">
            <option
              v-for="frequency in FREQUENCIES"
              :key="frequency.value"
              :value="frequency.value"
            >
              {{ frequency.label }}
            </option>
          </select>
        </label>
        <label :class="labelClass">
          Cada
          <input
            v-model="form.interval"
            name="interval"
            type="number"
            min="1"
            step="1"
            :class="fieldClass"
          />
        </label>
      </div>

      <label :class="labelClass">
        Fecha inicial
        <input v-model="form.startDate" name="startDate" type="date" :class="fieldClass" />
      </label>
    </form>

    <template #footer>
      <NeonButton @click="open = false">Cancelar</NeonButton>
      <NeonButton variant="primary" type="submit" :form="FORM_ID" :disabled="!valid">
        Crear regla
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>
