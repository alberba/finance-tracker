<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useSetupNavigation } from '../../../composables/useSetupNavigation'
import { BUDGET_TYPES } from '../../../domain/budget/view-model'
import type { BudgetType } from '../../../scripts/types'
import { useBudgetStore } from '../../../stores/budget'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { useNeonBudgetScreens } from './budget-screens'
import NeonBudgetPlanPanel from './NeonBudgetPlanPanel.vue'
import NeonBudgetYearBar from './NeonBudgetYearBar.vue'
import {
  buildMonthList,
  defaultCursor,
  monthAria,
  moveCursor,
  navigation,
  PAST_LABEL,
  TYPE_LABEL,
  whole,
} from './year-view-model'

// «El año» in the mobile frame (artboard «Presupuesto · móvil · Pixel 10»,
// #434): the plan against what was recorded, one month at a time. The type
// tabs, the arrows between months, the month's total and a row per category
// with its bar; a category's «Plan» opens the twelve months in a sheet, which is
// where the limits are edited. The year and quarter grids are desktop's.
const budgetStore = useBudgetStore()
const { viewModel } = storeToRefs(budgetStore)
const screens = useNeonBudgetScreens()
const { editCategories } = useSetupNavigation()

const type = ref<BudgetType>('expense')
const cursor = ref(defaultCursor(viewModel.value.currentMonth))
const planOpen = ref(false)
const planCategory = ref<string | null>(null)

const current = computed(() => viewModel.value.types[type.value])
const needsCategories = computed(() => budgetStore.getCategoriesForType(type.value).length === 0)
const nav = computed(() => navigation('month', cursor.value, viewModel.value.year))
const list = computed(() =>
  buildMonthList(type.value, current.value, cursor.value.month, viewModel.value.currentMonth),
)
const planRow = computed(
  () => current.value.rows.find((row) => row.category === planCategory.value) ?? null,
)
const excess = computed(() => (type.value === 'income' ? 'gain' : 'loss'))

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss' } as const

function pickType(id: BudgetType): void {
  type.value = id
  planOpen.value = false
}

function move(direction: -1 | 1): void {
  cursor.value = moveCursor('month', cursor.value, direction)
}

function openPlan(category: string): void {
  if (needsCategories.value) return
  planCategory.value = category
  planOpen.value = true
}

function savePlan(plan: number[]): void {
  if (planCategory.value && !needsCategories.value) {
    budgetStore.saveBudgetPlan(type.value, planCategory.value, plan)
  }
  planOpen.value = false
}

const circle =
  'border-ctrl-line text-text outline-accent grid size-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-35'
</script>

<template>
  <div class="grid min-w-0 content-start gap-4">
    <NeonButton class="justify-self-start ps-2.5" @click="screens.go('month')">
      <svg
        class="size-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      Este mes
    </NeonButton>

    <header class="grid min-w-0 gap-1.5">
      <p class="text-muted text-label tracking-label font-extrabold uppercase">
        Planificación anual · {{ viewModel.year }}
      </p>
      <h1
        id="budget-title"
        tabindex="-1"
        class="font-display text-[30px] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        El año
      </h1>
      <p class="text-soft text-[15px]">
        Lo que prevés por categoría y mes, frente a lo que registras en Movimientos.
      </p>
    </header>

    <div
      role="group"
      aria-label="Tipo de presupuesto"
      class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
    >
      <button
        v-for="id in BUDGET_TYPES"
        :key="id"
        type="button"
        :aria-pressed="type === id"
        class="outline-accent rounded-pill min-h-11 min-w-0 flex-1 px-1 text-[13px] font-extrabold focus-visible:outline-2 focus-visible:-outline-offset-2"
        :class="type === id ? 'bg-sel-bg text-sel-text' : 'text-soft'"
        @click="pickType(id)"
      >
        {{ TYPE_LABEL[id] }}
      </button>
    </div>

    <div class="flex items-center justify-center gap-3">
      <button
        type="button"
        :class="circle"
        :aria-label="nav.prevLabel"
        :disabled="!nav.canPrev"
        @click="move(-1)"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <span
        class="font-display min-w-[150px] text-center text-[17px] font-semibold"
        aria-live="polite"
        >{{ nav.label }}</span
      >
      <button
        type="button"
        :class="circle"
        :aria-label="nav.nextLabel"
        :disabled="!nav.canNext"
        @click="move(1)"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>

    <div
      :id="`budget-panel-${type}`"
      class="grid min-w-0 gap-4"
      role="region"
      :aria-label="monthAria(type, cursor.month)"
      data-budget-month
    >
      <NeonEmptyState v-if="needsCategories" role="status">
        Añade categorías de {{ TYPE_LABEL[type].toLowerCase() }} para planificar este presupuesto.
        <template #action>
          <NeonButton @click="editCategories">Editar categorías</NeonButton>
        </template>
      </NeonEmptyState>

      <template v-else>
        <p class="text-soft text-center text-[15px]" data-budget-summary>
          {{ PAST_LABEL[type] }}
          <b class="text-text font-extrabold">{{
            list.total.actual === null ? '—' : whole(list.total.actual)
          }}</b>
          de {{ whole(list.total.plan) }} € ·
          <b
            class="font-extrabold"
            :class="list.total.remainingTone ? TONE_TEXT[list.total.remainingTone] : 'text-text'"
            >{{ list.total.remaining }}</b
          >
        </p>

        <ul>
          <li
            v-for="line in list.lines"
            :key="line.category"
            class="border-line grid min-w-0 gap-2.5 border-t py-3.5"
          >
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="min-w-0 truncate text-[16px] font-bold">{{ line.category }}</span>
              <button
                type="button"
                class="text-text outline-accent min-h-11 min-w-11 flex-none px-1 text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                :aria-label="`Plan de ${line.category} para el año`"
                @click="openPlan(line.category)"
              >
                Plan
              </button>
            </div>
            <div class="flex min-w-0 items-baseline justify-between gap-3">
              <span class="flex min-w-0 items-baseline gap-2">
                <span
                  class="font-display text-[16px] font-semibold tabular-nums"
                  :class="
                    line.actual === null
                      ? 'text-muted'
                      : line.tone
                        ? TONE_TEXT[line.tone]
                        : 'text-text'
                  "
                  >{{ line.actual === null ? '—' : whole(line.actual) }}</span
                >
                <span class="text-muted text-[14px] whitespace-nowrap"
                  >de {{ whole(line.plan) }} €</span
                >
              </span>
              <span
                class="text-[14px] font-bold whitespace-nowrap"
                :class="line.remainingTone ? TONE_TEXT[line.remainingTone] : 'text-text'"
                >{{ line.remaining }}</span
              >
            </div>
            <NeonBudgetYearBar :bar="line.bar" :excess="excess" large />
          </li>
        </ul>
      </template>
    </div>
  </div>

  <NeonBudgetPlanPanel
    v-model:open="planOpen"
    :type="type"
    :row="planRow"
    :year="viewModel.year"
    :current-month="viewModel.currentMonth"
    @save="savePlan"
  />
</template>
