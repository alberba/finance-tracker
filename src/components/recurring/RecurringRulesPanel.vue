<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { frequencyLabel } from '../../domain/recurring/occurrences'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useMovementsStore } from '../../stores/movements'
import { useRecurringStore, type NewRecurringRuleInput } from '../../stores/recurring'
import type { RecurringFrequency } from '../../scripts/types'

const financialStateStore = useFinancialStateStore()
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()
const editingRuleId = ref('')
const form = reactive<NewRecurringRuleInput>({
  type: 'expense', accountId: '', category: '', description: '', amount: 0,
  frequency: 'monthly', interval: 1, startDate: new Date().toISOString().slice(0, 10), endDate: '',
  side: 'buy', units: 0, unitPrice: 0, fee: 0, time: '', symbol: '',
})
const frequencies: Array<{ value: RecurringFrequency; label: string }> = [
  { value: 'daily', label: 'Diaria' }, { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' }, { value: 'monthEnd', label: 'Fin de mes' }, { value: 'yearly', label: 'Anual' },
]
const categoryOptions = computed(() => movementsStore.orderedCategories(form.type))

watch(
  () => form.type,
  () => {
    if (!categoryOptions.value.length) {
      form.category = ''
      return
    }
    if (!categoryOptions.value.includes(form.category)) {
      form.category = categoryOptions.value[0]
    }
  },
)

function resetForm(): void {
  editingRuleId.value = ''
  Object.assign(form, {
    type: 'expense', accountId: '', category: '', description: '', amount: 0,
    frequency: 'monthly', interval: 1, startDate: new Date().toISOString().slice(0, 10), endDate: '',
    side: 'buy', units: 0, unitPrice: 0, fee: 0, time: '', symbol: '',
  })
}

function startEdit(rule: (typeof recurringStore.rules)[number]): void {
  editingRuleId.value = rule.id
  Object.assign(form, {
    type: rule.type,
    accountId: rule.accountId,
    category: rule.category,
    description: rule.description,
    amount: rule.amount,
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: rule.startDate,
    endDate: rule.endDate || '',
    symbol: rule.symbol || '',
    side: rule.side || 'buy',
    units: rule.units ?? 0,
    unitPrice: rule.unitPrice ?? 0,
    fee: rule.fee ?? 0,
    time: rule.time || '',
  })
}

function submit(): void {
  if (!form.accountId) form.accountId = financialStateStore.accounts[0]?.id || ''
  const saved = editingRuleId.value
    ? recurringStore.updateRule(editingRuleId.value, form)
    : recurringStore.addRule(form)
  if (saved) {
    resetForm()
  }
}
</script>

<template>
  <section id="cfg-recurrentes" class="settings-block" data-recurring-rules>
    <header>
      <span class="settings-block__num">03</span>
      <h3>Movimientos recurrentes</h3>
      <p>Cada vencimiento queda pendiente hasta que lo revises.</p>
    </header>
    <div class="settings-block__body">
    <form class="settings-fields grid gap-3 md:grid-cols-3" @submit.prevent="submit">
      <label>Tipo<select v-model="form.type"><option value="income">Ingreso</option><option value="expense">Gasto</option><option value="investment">Inversión</option></select></label>
      <label>Cuenta<select v-model="form.accountId" required><option value="">Selecciona una cuenta</option><option v-for="account in financialStateStore.accounts" :key="account.id" :value="account.id">{{ account.name }}</option></select></label>
      <label>Categoría<select v-model="form.category" required><option v-if="!categoryOptions.length" value="Sin categoría">Sin categoría</option><option v-for="category in categoryOptions" :key="category" :value="category">{{ category }}</option></select></label>
      <label>Descripción<input v-model="form.description" required placeholder="Ej. Netflix" /></label>
      <label>Importe<input v-model.number="form.amount" type="number" min="0.01" step="0.01" required /></label>
      <label>Frecuencia<select v-model="form.frequency"><option v-for="item in frequencies" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label>Intervalo<input v-model.number="form.interval" type="number" min="1" step="1" /></label>
      <label>Fecha inicial<input v-model="form.startDate" type="date" required /></label>
      <label>Fecha final<input v-model="form.endDate" type="date" /></label>
      <template v-if="form.type === 'investment'">
        <label>Símbolo<input v-model="form.symbol" placeholder="VWCE" /></label>
        <label>Operación<select v-model="form.side"><option value="buy">Compra</option><option value="sell">Venta</option></select></label>
        <label>Títulos<input v-model.number="form.units" type="number" min="0" step="0.00000001" /></label>
        <label>Precio por título<input v-model.number="form.unitPrice" type="number" min="0" step="0.000001" /></label>
        <label>Comisiones<input v-model.number="form.fee" type="number" min="0" step="0.01" /></label>
        <label>Hora<input v-model="form.time" type="time" /></label>
      </template>
      <div class="flex flex-wrap gap-2 md:col-span-3">
        <button type="submit" class="primary-btn">{{ editingRuleId ? 'Guardar regla' : 'Crear regla' }}</button>
        <button v-if="editingRuleId" type="button" class="secondary-btn" @click="resetForm">Cancelar edición</button>
      </div>
    </form>

    <p v-if="!recurringStore.rules.length" class="text-text-muted text-sm">Aún no hay reglas. Crea una y sus vencimientos aparecerán como pendientes.</p>
    <div v-else class="list-stack">
      <article v-for="rule in recurringStore.rules" :key="rule.id" class="list-item">
        <div><strong>{{ rule.description }}</strong><p class="text-text-muted text-sm">{{ frequencyLabel(rule.frequency) }} · próxima: {{ rule.nextOccurrenceDate || '—' }} · {{ rule.amount.toFixed(2) }}</p></div>
        <div class="flex items-center gap-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" :checked="rule.active" @change="recurringStore.toggleRule(rule.id, ($event.target as HTMLInputElement).checked)" /> Activa</label><button type="button" class="secondary-btn" @click="startEdit(rule)">Editar</button><button type="button" class="danger-btn" @click="recurringStore.removeRule(rule.id)">Eliminar</button></div>
      </article>
    </div>
    </div>
  </section>
</template>
