<script setup lang="ts">
import { reactive, watch } from 'vue'

import { todayISO } from '../../../scripts/utils'
import type { Entity, RecurringFrequency, RecurringRule } from '../../../scripts/types'
import type { NewRecurringRuleInput } from '../../../stores/recurring'

const props = defineProps<{
  accounts: Entity[]
  categories: string[]
  editingRule: RecurringRule | null
}>()

const emit = defineEmits<{
  save: [input: NewRecurringRuleInput]
  cancel: []
}>()

const frequencies: Array<{ value: RecurringFrequency; label: string }> = [
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'monthEnd', label: 'Fin de mes' },
  { value: 'yearly', label: 'Anual' },
]

const form = reactive<NewRecurringRuleInput>({
  type: 'investment',
  accountId: '',
  category: '',
  description: '',
  amount: 0,
  frequency: 'monthly',
  interval: 1,
  startDate: todayISO(),
  endDate: '',
  side: 'buy',
  units: 0,
  unitPrice: 0,
  fee: 0,
  time: '',
  symbol: '',
})

function populateForm(rule: RecurringRule | null): void {
  Object.assign(form, {
    type: 'investment',
    accountId: rule?.accountId ?? props.accounts[0]?.id ?? '',
    category: rule?.category ?? props.categories[0] ?? '',
    description: rule?.description ?? '',
    amount: rule?.amount ?? 0,
    frequency: rule?.frequency ?? 'monthly',
    interval: rule?.interval ?? 1,
    startDate: rule?.startDate ?? todayISO(),
    endDate: rule?.endDate ?? '',
    side: rule?.side ?? 'buy',
    units: rule?.units ?? 0,
    unitPrice: rule?.unitPrice ?? 0,
    fee: rule?.fee ?? 0,
    time: rule?.time ?? '',
    symbol: rule?.symbol ?? '',
  })
}

watch(() => props.editingRule, populateForm, { immediate: true })
watch(
  () => [props.accounts, props.categories] as const,
  () => {
    if (!props.accounts.some((account) => account.id === form.accountId)) {
      form.accountId = props.accounts[0]?.id ?? ''
    }
    if (!props.categories.includes(form.category)) {
      form.category = props.categories[0] ?? ''
    }
  },
  { deep: true },
)

function submit(): void {
  emit('save', { ...form, type: 'investment' })
}
</script>

<template>
  <form class="inv-fieldset investment-recurring-form" autocomplete="off" @submit.prevent="submit">
    <label>
      Cuenta
      <span class="inv-select"><select v-model="form.accountId" required>
        <option value="">Selecciona una cuenta</option>
        <option v-for="account in accounts" :key="account.id" :value="account.id">
          {{ account.name }}
        </option>
      </select></span>
    </label>
    <label>
      Categoría
      <span class="inv-select"><select v-model="form.category" required>
        <option v-if="!categories.length" value="Sin categoría">Sin categoría</option>
        <option v-for="category in categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select></span>
    </label>
    <label class="is-wide">
      Descripción
      <input v-model="form.description" required placeholder="Ej. Compra mensual VWCE" />
    </label>
    <label>
      Importe
      <input v-model.number="form.amount" type="number" min="0.01" step="0.01" required />
    </label>
    <label>
      Frecuencia
      <span class="inv-select"><select v-model="form.frequency">
        <option v-for="item in frequencies" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select></span>
    </label>
    <label>
      Intervalo
      <input v-model.number="form.interval" type="number" min="1" step="1" />
    </label>
    <label>
      Fecha inicial
      <input v-model="form.startDate" type="date" required />
    </label>
    <label>
      Fecha final
      <input v-model="form.endDate" type="date" />
    </label>
    <label>
      Símbolo
      <input v-model="form.symbol" required placeholder="VWCE" />
    </label>
    <label>
      Operación
      <span class="inv-select"><select v-model="form.side">
        <option value="buy">Compra</option>
        <option value="sell">Venta</option>
      </select></span>
    </label>
    <label>
      Títulos
      <input v-model.number="form.units" type="number" min="0" step="0.00000001" />
    </label>
    <label>
      Precio por título
      <input v-model.number="form.unitPrice" type="number" min="0" step="0.000001" />
    </label>
    <label>
      Comisiones
      <input v-model.number="form.fee" type="number" min="0" step="0.01" />
    </label>
    <label>
      Hora
      <input v-model="form.time" type="time" />
    </label>
    <div class="investment-recurring-form__actions">
      <button type="submit" class="inv-primary">
        {{ editingRule ? 'Guardar regla' : 'Crear compra recurrente' }}
      </button>
      <button v-if="editingRule" type="button" class="inv-secondary" @click="emit('cancel')">
        Cancelar edición
      </button>
    </div>
  </form>
</template>

<style scoped>
.investment-recurring-form__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
}
</style>
