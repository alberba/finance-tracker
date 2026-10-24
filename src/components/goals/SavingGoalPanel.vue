<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SidePanel from '../ui/SidePanel.vue'
import type { SavingGoalRowViewModel } from '../../domain/goals/view-model'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useGoalsStore } from '../../stores/goals'

// Creates and edits a savings goal: a name, a target and the saving category it sums.
const financialStateStore = useFinancialStateStore()
const goalsStore = useGoalsStore()

const open = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', amount: '', category: '' })

const categoryOptions = computed(() => {
  const names = financialStateStore.state.savingCategories
  const list = form.category && !names.includes(form.category) ? [form.category, ...names] : names
  return list.map((name) => ({ value: name, label: name }))
})
const amount = computed(() => parseDecimal(form.amount))
const valid = computed(
  () =>
    Boolean(form.name.trim()) &&
    Boolean(form.category) &&
    Number.isFinite(amount.value) &&
    amount.value > 0,
)

function openNew(): void {
  editingId.value = null
  Object.assign(form, {
    name: '',
    amount: '',
    category: financialStateStore.state.savingCategories[0] ?? '',
  })
  open.value = true
}

function openEdit(goal: SavingGoalRowViewModel): void {
  editingId.value = goal.id
  Object.assign(form, {
    name: goal.name,
    amount: formatDecimalInput(goal.target),
    category: goal.category,
  })
  open.value = true
}

function save(): void {
  if (!valid.value) return
  const input = { name: form.name, targetAmount: amount.value, category: form.category }
  const saved = editingId.value
    ? goalsStore.updateSavingGoal(editingId.value, input)
    : goalsStore.addSavingGoal(input)
  if (saved) open.value = false
}

function remove(): void {
  if (editingId.value) goalsStore.removeSavingGoal(editingId.value)
  open.value = false
}

defineExpose({ openNew, openEdit })
</script>

<template>
  <SidePanel
    id="saving-goal-panel"
    v-model:open="open"
    kicker="Objetivo de ahorro"
    :title="form.name.trim() || 'Nuevo objetivo de ahorro'"
    title-id="saving-goal-panel-title"
  >
    <form id="saving-goal-form" class="grid gap-7" autocomplete="off" @submit.prevent="save">
      <fieldset class="grid gap-3.5 sm:grid-cols-2">
        <legend class="text-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Meta
        </legend>
        <BaseInput
          v-model="form.name"
          class="sm:col-span-2"
          label="Nombre"
          name="savingGoalName"
          maxlength="80"
          required
        />
        <BaseInput
          v-model="form.amount"
          label="Importe objetivo"
          name="savingGoalAmount"
          inputmode="decimal"
          placeholder="0,00"
          suffix="€"
          class="[&_input]:font-display [&_input]:text-right"
          required
        />
        <BaseSelect
          v-model="form.category"
          label="Categoría de ahorro"
          name="savingGoalCategory"
          :options="categoryOptions"
          required
        />
        <p class="text-text-muted text-sm sm:col-span-2">
          El progreso es la suma de los ahorros de esta categoría, también los anteriores al
          objetivo.
        </p>
        <p
          v-if="!categoryOptions.length"
          class="text-text-muted text-sm sm:col-span-2"
          data-saving-goal-no-category
        >
          Crea antes una categoría de ahorro en Configuración › Categorías.
        </p>
      </fieldset>
    </form>

    <template #footer>
      <BaseButton v-if="editingId" variant="danger" class="mr-auto" @click="remove">
        Eliminar
      </BaseButton>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton variant="primary" type="submit" form="saving-goal-form" :disabled="!valid">
        Guardar objetivo
      </BaseButton>
    </template>
  </SidePanel>
</template>
