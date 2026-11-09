<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { SavingGoal } from '../../../scripts/types'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useGoalsStore } from '../../../stores/goals'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonGoalColumn from './NeonGoalColumn.vue'
import NeonGoalFormPanel from './NeonGoalFormPanel.vue'
import NeonGoalSelected from './NeonGoalSelected.vue'
import NeonGoalSplitPanel from './NeonGoalSplitPanel.vue'
import {
  freeSaving,
  goalColumns,
  goalPlans,
  monthLabel,
  monthlySaving,
  monthNumber,
  monthOf,
  selectedGoal,
  wholeEuros,
} from './view-model'

// Objetivos in the new design (artboard «Objetivos · 2560 px», #441): one
// column per savings goal, the most urgent first, and under them the selected
// goal with the monthly amount it gets. «Repartir el ahorro» shares the
// monthly saving among the goals; «Nuevo objetivo» adds one.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const financialStateStore = useFinancialStateStore()
const goalsStore = useGoalsStore()

const today = new Date()
const now = monthOf(today)

const plans = computed(() => goalPlans(financialStateStore.state))
const columns = computed(() => goalColumns(plans.value, today))
const saving = computed(() =>
  monthlySaving(financialStateStore.state, financialStateStore.year, today),
)

const selectedId = ref<string | null>(null)
const selectedPlan = computed(
  () => plans.value.find((plan) => plan.id === selectedId.value) ?? null,
)
// The first column until one is chosen, and again when the chosen one is gone.
watch(
  columns,
  (list) => {
    if (!list.some((column) => column.id === selectedId.value)) {
      selectedId.value = list[0]?.id ?? null
    }
  },
  { immediate: true },
)

/** The amount on the slider while it moves; null once let go. */
const sliding = ref<number | null>(null)
watch(selectedId, () => (sliding.value = null))
const amount = computed(() => sliding.value ?? selectedPlan.value?.monthly ?? 0)
const selected = computed(() =>
  selectedPlan.value ? selectedGoal(selectedPlan.value, amount.value, today) : null,
)

function saveAmount(value: number): void {
  const plan = selectedPlan.value
  sliding.value = null
  if (!plan || value === plan.monthly) return
  goalsStore.setSavingGoalMonthlyAmounts(
    { [plan.id]: value },
    `${plan.name}: ${wholeEuros(value)} al mes.`,
  )
}

const splitOpen = ref(false)

function saveSplit(amounts: Record<string, number>): void {
  goalsStore.setSavingGoalMonthlyAmounts(
    amounts,
    'Reparto guardado. Las fechas de llegada ya están recalculadas.',
  )
  splitOpen.value = false
}

// The form panel keeps the goal it shows while it slides out.
const formOpen = ref(false)
const formGoal = ref<string | null>(null)
const formPlan = computed(() => plans.value.find((plan) => plan.id === formGoal.value) ?? null)
const formFree = computed(() =>
  saving.value > 0
    ? freeSaving(
        saving.value,
        plans.value.filter((plan) => plan.id !== formGoal.value),
      )
    : null,
)

function openForm(id: string | null): void {
  formGoal.value = id
  formOpen.value = true
}

function create(input: Omit<SavingGoal, 'id'>, newCategory: boolean): void {
  const due = monthNumber(input.targetYear ?? 0, input.targetMonth ?? 1)
  const message = `Creado «${input.name}»: ${wholeEuros(input.monthlyAmount ?? 0)} al mes hasta ${monthLabel(due)}.`
  if (!goalsStore.addSavingGoal(input, { message, newCategory })) return
  selectedId.value = financialStateStore.state.savingGoals.at(-1)?.id ?? null
  formOpen.value = false
}

function update(id: string, input: Omit<SavingGoal, 'id'>): void {
  if (goalsStore.updateSavingGoal(id, input)) formOpen.value = false
}

function remove(id: string): void {
  goalsStore.removeSavingGoal(id)
  formOpen.value = false
}
</script>

<template>
  <section
    v-show="isActive"
    id="goals"
    class="@container mx-auto grid w-full max-w-[1480px] min-w-0 content-start gap-6"
    aria-labelledby="goals-title"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <h1
        id="goals-title"
        tabindex="-1"
        class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        Objetivos
      </h1>
      <div class="flex flex-wrap gap-2.5">
        <NeonButton v-if="plans.length" @click="splitOpen = true">Repartir el ahorro</NeonButton>
        <NeonButton variant="primary" @click="openForm(null)">
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo objetivo
        </NeonButton>
      </div>
    </header>

    <NeonEmptyState v-if="!columns.length">
      Aún no tienes objetivos. Crea uno con lo que necesitas y para cuándo, y verás cuándo llegas.
    </NeonEmptyState>

    <template v-else>
      <ul class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5" aria-label="Objetivos">
        <li v-for="column in columns" :key="column.id">
          <NeonGoalColumn
            :column="column"
            :selected="column.id === selectedId"
            @select="selectedId = column.id"
          />
        </li>
      </ul>

      <NeonGoalSelected
        v-if="selected && selectedPlan"
        :name="selectedPlan.name"
        :goal="selected"
        :amount="amount"
        @slide="sliding = $event"
        @save="saveAmount"
        @edit="openForm(selectedPlan.id)"
      />
    </template>

    <NeonGoalSplitPanel
      v-model:open="splitOpen"
      :plans="plans"
      :saving="saving"
      :today="today"
      @save="saveSplit"
    />
    <NeonGoalFormPanel
      v-model:open="formOpen"
      :goal="formPlan"
      :categories="financialStateStore.state.savingCategories"
      :free="formFree"
      :now="now"
      @create="create"
      @update="update"
      @remove="remove"
    />
  </section>
</template>
