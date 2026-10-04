<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import SidePanel from '../ui/SidePanel.vue'
import { TONE_TEXT } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { toneOf, type BudgetRow } from '../../domain/budget/view-model'
import { formatMonthName } from '../../lib/format'
import { formatDecimalInput, parseDecimal } from '../../lib/number'
import type { BudgetType } from '../../scripts/types'
import { useBudgetStore } from '../../stores/budget'
import { deviationSpan, monthName, TYPE_LABEL } from './budget-text'

// The year plan of one category: the twelve months at once, with what was
// recorded beside each as a reference. Saving commits the whole plan once.
const props = defineProps<{ year: number; currentMonth: number }>()

const budgetStore = useBudgetStore()
const { formatMoney, formatSignedMoney } = useMoneyFormatter()

const open = ref(false)
const type = ref<BudgetType>('expense')
const row = ref<BudgetRow | null>(null)
const inputs = ref<string[]>([])

const values = computed(() =>
  inputs.value.map((text) => (text.trim() === '' ? 0 : parseDecimal(text))),
)
const invalidAt = computed(() => values.value.map((value) => !Number.isFinite(value) || value < 0))
const valid = computed(() => !invalidAt.value.some(Boolean))

// The figures follow what is typed; a field that does not parse keeps its saved amount.
const planned = computed(() =>
  values.value.map((value, month) =>
    invalidAt.value[month] ? (row.value?.cells[month].planned ?? 0) : value,
  ),
)
const figures = computed(() => {
  const cells = row.value?.cells ?? []
  const plannedTotal = planned.value.reduce((total, value) => total + value, 0)
  const diff = cells.reduce(
    (total, cell) =>
      cell.status === 'closed' ? total + (cell.actual ?? 0) - planned.value[cell.month] : total,
    0,
  )
  const tone = toneOf(type.value, diff)
  return {
    planned: formatMoney(plannedTotal),
    actual: formatMoney(row.value?.actualTotal ?? 0),
    diff: formatSignedMoney(diff),
    diffClass: tone ? TONE_TEXT[tone] : 'text-text-main',
  }
})
const span = computed(() => deviationSpan(props.currentMonth))

function label(month: number): string {
  return formatMonthName(month)
}

function reference(month: number): string {
  const actual = row.value?.cells[month].actual
  return actual === null || actual === undefined ? 'sin movimientos' : `real ${formatMoney(actual)}`
}

function openPlan(budgetType: BudgetType, category: BudgetRow): void {
  type.value = budgetType
  row.value = category
  inputs.value = category.cells.map((cell) => formatDecimalInput(cell.planned))
  open.value = true
}

function save(): void {
  if (!valid.value || !row.value) return
  budgetStore.saveBudgetPlan(type.value, row.value.category, values.value)
  open.value = false
}

defineExpose({ openPlan })
</script>

<template>
  <SidePanel
    id="budget-plan-panel"
    v-model:open="open"
    :kicker="`Plan de ${year} · ${TYPE_LABEL[type]}`"
    :title="row?.category ?? ''"
    title-id="budget-plan-title"
  >
    <form id="budget-plan-form" class="grid gap-6" autocomplete="off" @submit.prevent="save">
      <p class="text-text-muted -mt-2 text-sm">
        Lo real viene de tus movimientos de {{ row?.category }}.
      </p>

      <dl
        class="border-line divide-line grid grid-cols-3 divide-x border-y py-3.5"
        data-budget-plan-figures
      >
        <div class="grid gap-1 pr-3">
          <dt class="text-text-muted text-sm">Presupuestado</dt>
          <dd class="font-display m-0 font-medium tabular-nums sm:text-lg">
            {{ figures.planned }}
          </dd>
        </div>
        <div class="grid gap-1 px-3">
          <dt class="text-text-muted text-sm">Real hasta hoy</dt>
          <dd class="font-display m-0 font-medium tabular-nums sm:text-lg">{{ figures.actual }}</dd>
        </div>
        <div class="grid gap-1 pl-3">
          <dt class="text-text-muted text-sm">Desvío {{ span }}</dt>
          <dd
            class="font-display m-0 font-medium tabular-nums sm:text-lg"
            :class="figures.diffClass"
          >
            {{ span ? figures.diff : '—' }}
          </dd>
        </div>
      </dl>

      <fieldset class="grid">
        <legend class="text-text-muted mb-2.5 text-xs font-bold tracking-widest uppercase">
          Importe por mes
        </legend>
        <div
          v-for="(_, month) in inputs"
          :key="month"
          class="border-line grid grid-cols-[4rem_minmax(0,1fr)_6.5rem] items-center gap-3.5 border-t py-1.5 sm:grid-cols-[8rem_minmax(0,1fr)_9.5rem]"
          :data-budget-plan-month="month"
        >
          <span class="flex items-baseline gap-2 text-sm font-semibold" aria-hidden="true">
            <span class="sm:hidden">{{ label(month).slice(0, 3) }}</span>
            <span class="hidden sm:inline">{{ label(month) }}</span>
            <span
              v-if="row?.cells[month].status === 'current'"
              class="text-primary font-mono text-[0.625rem] font-normal tracking-widest uppercase"
              >en curso</span
            >
          </span>
          <BaseInput
            v-model="inputs[month]"
            :label="`${label(month)}`"
            hide-label
            inputmode="decimal"
            suffix="€"
            class="[&_input]:font-display [&_input]:text-right"
            :aria-invalid="invalidAt[month]"
            :aria-describedby="`budget-plan-ref-${month}`"
          />
          <span :id="`budget-plan-ref-${month}`" class="text-text-muted text-right text-sm">
            {{ reference(month) }}
          </span>
        </div>
      </fieldset>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Cancelar</BaseButton>
      <BaseButton
        variant="primary"
        type="submit"
        form="budget-plan-form"
        class="grow sm:grow-0"
        :disabled="!valid"
      >
        Guardar plan
      </BaseButton>
    </template>
  </SidePanel>
</template>
