<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import { formatNumber } from '../../../lib/format'
import { round2 } from '../../../lib/number'

import type { SavingGoal } from '../../../scripts/types'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import {
  MAX_TARGET,
  monthLabel,
  newGoalFit,
  parseAmount,
  WHEN_OPTIONS,
  wholeEuros,
  yearMonth,
  type GoalPlan,
} from './view-model'

// «Nuevo objetivo» and its edit: a name, how much it needs, for when, and the
// saving category whose savings it adds up (a new one named like the goal, by
// default). Below, what it needs a month to arrive on time and whether the
// monthly saving still free covers it. A new goal starts with that amount.
const props = defineProps<{
  /** The goal being edited; null for a new one. */
  goal: GoalPlan | null
  categories: string[]
  /** The monthly saving the other goals leave free; null when the budget sets none aside. */
  free: number | null
  /** This month, as a month number. */
  now: number
}>()
const emit = defineEmits<{
  create: [input: Omit<SavingGoal, 'id'>, newCategory: boolean]
  update: [id: string, input: Omit<SavingGoal, 'id'>]
  remove: [id: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const FORM_ID = 'neon-goal-form'
const NEW_CATEGORY = ''
const DEFAULT_MONTHS = 18

const form = reactive({ name: '', amount: '', due: 0, category: NEW_CATEGORY })

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const goal = props.goal
    Object.assign(
      form,
      goal
        ? {
            name: goal.name,
            amount: formatNumber(round2(goal.target), Number.isInteger(goal.target) ? 0 : 2),
            due: goal.due ?? props.now + DEFAULT_MONTHS,
            category: goal.category,
          }
        : { name: '', amount: '', due: props.now + DEFAULT_MONTHS, category: NEW_CATEGORY },
    )
  },
  { immediate: true },
)

const target = computed(() => parseAmount(form.amount))
const name = computed(() => form.name.trim())
// A new category takes the goal's name; one by that name already is the same category.
const category = computed(() =>
  form.category === NEW_CATEGORY && props.categories.includes(name.value)
    ? name.value
    : form.category,
)
const newCategory = computed(() => category.value === NEW_CATEGORY)

const whens = computed(() => {
  const options = WHEN_OPTIONS.map((option) => ({
    label: option.label,
    due: props.now + option.months,
  }))
  // An edited goal keeps a deadline that none of the options gives.
  return options.some((option) => option.due === form.due)
    ? options
    : [{ label: monthLabel(form.due), due: form.due }, ...options]
})

const remaining = computed(() =>
  Math.max((Number.isFinite(target.value) ? target.value : 0) - (props.goal?.saved ?? 0), 0),
)
const fit = computed(() => newGoalFit(remaining.value, form.due - props.now, props.free))
const valid = computed(
  () =>
    Boolean(name.value) &&
    Number.isFinite(target.value) &&
    target.value > 0 &&
    target.value <= MAX_TARGET,
)

function save(): void {
  if (!valid.value) return
  const { year, month } = yearMonth(form.due)
  const input = {
    name: name.value,
    targetAmount: target.value,
    category: newCategory.value ? name.value : category.value,
    targetYear: year,
    targetMonth: month,
  }
  if (props.goal) emit('update', props.goal.id, input)
  else emit('create', { ...input, monthlyAmount: fit.value.needed }, newCategory.value)
}

const fieldClass =
  'min-w-0 bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-[13px] font-bold'
</script>

<template>
  <NeonDetailPanel v-model:open="open" :title="goal ? goal.name : 'Nuevo objetivo'">
    <form :id="FORM_ID" class="grid grid-cols-[minmax(0,1fr)] gap-[22px]" autocomplete="off" @submit.prevent="save">
      <label :class="labelClass">
        Nombre
        <input
          v-model="form.name"
          name="goalName"
          maxlength="80"
          placeholder="Viaje a…"
          :class="fieldClass"
        />
      </label>

      <label class="text-muted grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-[13px] font-bold">
        Cuánto necesitas
        <span class="border-ctrl-line flex items-baseline gap-2 border-b-2">
          <input
            v-model="form.amount"
            name="goalAmount"
            inputmode="decimal"
            placeholder="0"
            class="font-display text-text placeholder:text-faint min-w-0 flex-1 bg-transparent py-0.5 text-[32px] font-bold tracking-[-0.02em] outline-none"
          />
          <span class="font-display text-muted text-[20px] font-bold" aria-hidden="true">€</span>
        </span>
      </label>

      <div class="grid gap-2">
        <span id="neon-goal-when" class="text-muted text-[13px] font-bold">Para cuándo</span>
        <div class="flex flex-wrap gap-2" role="group" aria-labelledby="neon-goal-when">
          <button
            v-for="when in whens"
            :key="when.due"
            type="button"
            :aria-pressed="form.due === when.due"
            class="rounded-pill outline-accent pointer-coarse:min-h-11 min-h-[38px] border px-3.5 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="
              form.due === when.due
                ? 'bg-sel-bg text-sel-text border-sel-border'
                : 'border-ctrl-line text-soft'
            "
            @click="form.due = when.due"
          >
            {{ when.label }}
          </button>
        </div>
      </div>

      <div :class="labelClass">
        <label for="neon-goal-category">Categoría de ahorro</label>
        <select
          id="neon-goal-category"
          v-model="form.category"
          name="goalCategory"
          aria-describedby="neon-goal-category-note"
          :class="fieldClass"
        >
          <option v-if="!goal" :value="NEW_CATEGORY">
            {{ name ? `Una nueva: «${name}»` : 'Una nueva, con el nombre del objetivo' }}
          </option>
          <option v-for="option in categories" :key="option" :value="option">{{ option }}</option>
        </select>
        <p id="neon-goal-category-note" class="text-muted text-[13px] font-normal">
          El objetivo suma los ahorros de esta categoría, también los anteriores.
        </p>
      </div>

      <div class="border-line grid gap-1.5 border-t pbs-[18px]" aria-live="polite">
        <p class="font-display text-[20px] leading-[1.3] font-semibold">
          Apartar
          <span class="font-extrabold whitespace-nowrap">{{ wholeEuros(fit.needed) }}</span>
          al mes
        </p>
        <p class="text-[15px] font-bold" :class="fit.fits ? 'text-text' : 'text-loss'">
          {{ fit.text }}
        </p>
      </div>
    </form>

    <template #footer>
      <NeonButton v-if="goal" danger class="me-auto" @click="emit('remove', goal.id)">
        Eliminar
      </NeonButton>
      <NeonButton @click="open = false">Cancelar</NeonButton>
      <NeonButton variant="primary" type="submit" :form="FORM_ID" :disabled="!valid">
        {{ goal ? 'Guardar objetivo' : 'Crear objetivo' }}
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>
