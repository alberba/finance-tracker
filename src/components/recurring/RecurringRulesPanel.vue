<script setup lang="ts">
import { reactive } from 'vue'

import { frequencyLabel } from '../../domain/recurring/occurrences'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore, type NewRecurringRuleInput } from '../../stores/recurring'
import type { RecurringFrequency, TransactionType } from '../../scripts/types'

const financialStateStore = useFinancialStateStore()
const recurringStore = useRecurringStore()
const form = reactive<NewRecurringRuleInput>({
  type: 'expense', accountId: '', category: '', description: '', amount: 0,
  frequency: 'monthly', interval: 1, startDate: new Date().toISOString().slice(0, 10), endDate: '',
})
const frequencies: Array<{ value: RecurringFrequency; label: string }> = [
  { value: 'daily', label: 'Diaria' }, { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' }, { value: 'monthEnd', label: 'Fin de mes' }, { value: 'yearly', label: 'Anual' },
]

function submit(): void {
  if (!form.accountId) form.accountId = financialStateStore.accounts[0]?.id || ''
  if (recurringStore.addRule(form)) {
    form.description = ''
    form.amount = 0
  }
}
</script>

<template>
  <article class="card" data-recurring-rules>
    <div>
      <p class="text-primary font-mono text-[0.65rem] tracking-[0.18em] uppercase">Automatización controlada</p>
      <h3 class="font-display text-xl">Movimientos recurrentes</h3>
      <p class="text-text-muted text-sm">Cada vencimiento queda pendiente hasta que lo revises.</p>
    </div>
    <form class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" @submit.prevent="submit">
      <label>Tipo<select v-model="form.type"><option value="income">Ingreso</option><option value="expense">Gasto</option><option value="investment">Inversión</option></select></label>
      <label>Cuenta<select v-model="form.accountId" required><option value="">Selecciona una cuenta</option><option v-for="account in financialStateStore.accounts" :key="account.id" :value="account.id">{{ account.name }}</option></select></label>
      <label>Categoría<input v-model="form.category" required placeholder="Categoría" /></label>
      <label>Descripción<input v-model="form.description" required placeholder="Descripción" /></label>
      <label>Importe<input v-model.number="form.amount" type="number" min="0.01" step="0.01" required /></label>
      <label>Frecuencia<select v-model="form.frequency"><option v-for="item in frequencies" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label>Intervalo<input v-model.number="form.interval" type="number" min="1" step="1" /></label>
      <label>Fecha inicial<input v-model="form.startDate" type="date" required /></label>
      <label>Fecha final (opcional)<input v-model="form.endDate" type="date" /></label>
      <template v-if="form.type === 'investment'">
        <label>Símbolo<input v-model="form.symbol" placeholder="VWCE" /></label>
        <label>Operación<select v-model="form.side"><option value="buy">Compra</option><option value="sell">Venta</option></select></label>
        <label>Títulos<input v-model.number="form.units" type="number" min="0" step="0.00000001" /></label>
        <label>Precio por título<input v-model.number="form.unitPrice" type="number" min="0" step="0.000001" /></label>
      </template>
      <button type="submit" class="primary-btn md:col-span-2 xl:col-span-4">Crear regla</button>
    </form>

    <div v-if="recurringStore.rules.length" class="mt-5 grid gap-2">
      <article v-for="rule in recurringStore.rules" :key="rule.id" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3">
        <div><strong>{{ rule.description }}</strong><p class="text-text-muted text-sm">{{ frequencyLabel(rule.frequency) }} · próxima: {{ rule.nextOccurrenceDate || '—' }} · {{ rule.amount.toFixed(2) }}</p></div>
        <div class="flex items-center gap-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" :checked="rule.active" @change="recurringStore.toggleRule(rule.id, ($event.target as HTMLInputElement).checked)" /> Activa</label><button type="button" class="danger-btn" @click="recurringStore.removeRule(rule.id)">Eliminar</button></div>
      </article>
    </div>
  </article>
</template>
