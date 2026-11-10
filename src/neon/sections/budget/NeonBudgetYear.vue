<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useSetupNavigation } from '../../../composables/useSetupNavigation'
import { BUDGET_TYPES } from '../../../domain/budget/view-model'
import { atMonth, type Month } from '../../../lib/month'
import type { BudgetType } from '../../../scripts/types'
import { useBudgetStore } from '../../../stores/budget'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { useNeonBudgetScreens } from './budget-screens'
import NeonBudgetPlanPanel from './NeonBudgetPlanPanel.vue'
import NeonBudgetYearGrid from './NeonBudgetYearGrid.vue'
import NeonBudgetYearMonth from './NeonBudgetYearMonth.vue'
import {
  buildGrid,
  buildMonthList,
  defaultCursor,
  isChange,
  moveCursor,
  navigation,
  TYPE_LABEL,
  VIEW_LABEL,
  VIEWS,
  windowMonths,
  yearSummary,
  type YearView,
} from './year-view-model'

// «El año» in the new design (artboard «Presupuesto · 2560 px», #433): the
// plan against what was recorded, by category and month. Type tabs, the view
// (year, quarter or month), the summary of the year and the grid or list, with
// the per-category year plan in a detail panel.
const budgetStore = useBudgetStore()
const { viewModel } = storeToRefs(budgetStore)
const screens = useNeonBudgetScreens()
const { editCategories } = useSetupNavigation()

const type = ref<BudgetType>('expense')
const view = ref<YearView>('year')
const cursor = ref(defaultCursor(viewModel.value.currentMonth))
const planOpen = ref(false)
const planCategory = ref<string | null>(null)

const current = computed(() => viewModel.value.types[type.value])
const needsCategories = computed(() => budgetStore.getCategoriesForType(type.value).length === 0)
const tabs = computed(() =>
  BUDGET_TYPES.map((id) => ({
    id,
    label: TYPE_LABEL[id],
    count: viewModel.value.types[id].count,
  })),
)
const summary = computed(() =>
  yearSummary(type.value, current.value, viewModel.value.year, viewModel.value.currentMonth),
)
const nav = computed(() => navigation(view.value, cursor.value, viewModel.value.year))
const months = computed(() => windowMonths(view.value, cursor.value))
const grid = computed(() =>
  buildGrid(type.value, current.value, months.value, viewModel.value.currentMonth),
)
const monthList = computed(() =>
  buildMonthList(type.value, current.value, cursor.value.month, viewModel.value.currentMonth),
)
const planRow = computed(
  () => current.value.rows.find((row) => row.category === planCategory.value) ?? null,
)

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss' } as const

function pickType(id: BudgetType): void {
  type.value = id
  planOpen.value = false
}

function onTypeKey(event: KeyboardEvent): void {
  const ids = BUDGET_TYPES
  const at = ids.indexOf(type.value)
  const next =
    event.key === 'ArrowRight'
      ? (at + 1) % ids.length
      : event.key === 'ArrowLeft'
        ? (at + ids.length - 1) % ids.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? ids.length - 1
            : -1
  if (next < 0) return
  event.preventDefault()
  pickType(ids[next])
  void Promise.resolve().then(() =>
    document.getElementById(`budget-tab-${ids[next]}-button`)?.focus(),
  )
}

function move(direction: -1 | 1): void {
  cursor.value = moveCursor(view.value, cursor.value, direction)
}

function updateCell(category: string, month: Month, value: number): void {
  if (needsCategories.value) return
  const row = current.value.rows.find((candidate) => candidate.category === category)
  if (row && !isChange(atMonth(row.cells, month).planned, value)) return
  budgetStore.updateBudgetValue(type.value, category, month, value)
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
</script>

<template>
  <div class="@container grid min-w-0 content-start gap-5">
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
        class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        El año
      </h1>
      <p class="text-soft max-w-[58ch] text-[16px]">
        Lo que prevés por categoría y mes, frente a lo que registras en Movimientos.
      </p>
    </header>

    <div
      class="grid min-w-0 gap-x-4 gap-y-3 @min-[720px]:flex @min-[720px]:flex-wrap @min-[720px]:items-center"
    >
      <div
        role="tablist"
        aria-label="Tipo de presupuesto"
        class="bg-panel2 rounded-pill flex max-w-full gap-[3px] overflow-x-auto p-[3px]"
        @keydown="onTypeKey"
      >
        <button
          v-for="tab in tabs"
          :id="`budget-tab-${tab.id}-button`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="type === tab.id"
          :aria-controls="`budget-panel-${tab.id}`"
          :tabindex="type === tab.id ? 0 : -1"
          class="outline-accent rounded-pill inline-flex min-h-[38px] items-center gap-2 px-4 text-[14px] font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 pointer-coarse:min-h-11"
          :class="type === tab.id ? 'bg-sel-bg text-sel-text' : 'text-soft'"
          @click="pickType(tab.id)"
        >
          {{ tab.label }}
          <span
            class="text-[13px] font-bold tabular-nums"
            :class="type === tab.id ? 'text-sel-text' : 'text-muted'"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>

      <div role="group" aria-label="Vista" class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]">
        <button
          v-for="id in VIEWS"
          :key="id"
          type="button"
          :aria-pressed="view === id"
          class="outline-accent rounded-pill min-h-[38px] flex-1 px-4 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:-outline-offset-2 @min-[720px]:flex-none pointer-coarse:min-h-11"
          :class="view === id ? 'bg-sel-bg text-sel-text' : 'text-soft'"
          @click="view = id"
        >
          {{ VIEW_LABEL[id] }}
        </button>
      </div>

      <div class="flex items-center justify-between gap-3 @min-[720px]:ms-auto">
        <div v-if="nav.arrows" class="flex items-center gap-2">
          <button
            type="button"
            class="border-ctrl-line text-text outline-accent grid size-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-35"
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
          <button
            type="button"
            class="border-ctrl-line text-text outline-accent grid size-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-35"
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
        <span
          class="font-display text-[16px] font-semibold @min-[720px]:min-w-40 @min-[720px]:text-right"
          aria-live="polite"
          >{{ nav.label }}</span
        >
      </div>
    </div>

    <div
      :id="`budget-panel-${type}`"
      role="tabpanel"
      :aria-labelledby="`budget-tab-${type}-button`"
      class="grid min-w-0 gap-5"
    >
      <NeonEmptyState v-if="needsCategories" role="status">
        Añade categorías de {{ TYPE_LABEL[type].toLowerCase() }} para planificar este presupuesto.
        <template #action>
          <NeonButton @click="editCategories">Editar categorías</NeonButton>
        </template>
      </NeonEmptyState>

      <template v-else>
        <div
          role="group"
          aria-label="Resumen del año"
          class="grid grid-cols-2 gap-y-5 @min-[720px]:grid-cols-4"
          data-budget-summary
        >
          <div
            v-for="(figure, index) in summary"
            :key="figure.label"
            class="border-line grid min-w-0 content-start gap-1.5 px-4 @min-[720px]:px-6"
            :class="[
              index % 2 === 1 ? 'border-s' : 'ps-0',
              index === 0 ? '@min-[720px]:ps-0' : '@min-[720px]:border-s @min-[720px]:ps-6',
            ]"
          >
            <span class="text-muted text-[14px]">{{ figure.label }}</span>
            <span
              class="font-display text-[22px] font-semibold tracking-[-0.02em] tabular-nums"
              :class="figure.tone ? TONE_TEXT[figure.tone] : 'text-text'"
              >{{ figure.value }}</span
            >
            <span class="text-muted text-[14px]">{{ figure.note }}</span>
          </div>
        </div>

        <NeonBudgetYearMonth
          v-if="view === 'month'"
          :key="`month-${type}-${cursor.month}`"
          :type="type"
          :month="cursor.month"
          :list="monthList"
          @plan="openPlan"
          @update="updateCell"
        />
        <NeonBudgetYearGrid
          v-else
          :key="`grid-${type}-${view}`"
          :type="type"
          :view="view"
          :grid="grid"
          @plan="openPlan"
          @update="updateCell"
        />
      </template>
    </div>

    <NeonBudgetPlanPanel
      v-model:open="planOpen"
      :type="type"
      :row="planRow"
      :year="viewModel.year"
      :current-month="viewModel.currentMonth"
      @save="savePlan"
    />
  </div>
</template>
