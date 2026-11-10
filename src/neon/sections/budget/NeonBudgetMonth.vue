<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import { formatMonthName } from '../../../lib/format'
import { asMonth } from '../../../lib/month'
import { useBudgetStore } from '../../../stores/budget'
import { useFinancialStateStore } from '../../../stores/financial-state'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { useNeonBudgetScreens } from './budget-screens'
import NeonBudgetCategoryDetail from './NeonBudgetCategoryDetail.vue'
import NeonBudgetSpendChart from './NeonBudgetSpendChart.vue'
import NeonCents from './NeonCents.vue'
import {
  categoryAria,
  categoryDetail,
  daysText,
  isWarning,
  monthCategories,
  monthHero,
  monthKicker,
  monthPosition,
  spendChart,
  STATUS_LABEL,
  unbudgetedCategories,
} from './month-view-model'

// «Este mes», the cover of the new Presupuesto: the two things to do this
// month (review the month just closed, prepare the next one), the month's
// spending day by day, what is left to spend and each category's budget. A
// category opens its detail, month by month.
const budgetStore = useBudgetStore()
const financialStateStore = useFinancialStateStore()
const screens = useNeonBudgetScreens()
const { reviewed, prepared } = storeToRefs(screens)
const { viewModel } = storeToRefs(budgetStore)
const { formatMoney } = useMoneyFormatter()

const position = computed(() => monthPosition(viewModel.value, new Date()))
const expenseRows = computed(() => viewModel.value.types.expense.rows)
const categories = computed(() => monthCategories(expenseRows.value, position.value))
const unbudgeted = computed(() => unbudgetedCategories(expenseRows.value, position.value))
const hero = computed(() => monthHero(categories.value, position.value))
const chart = computed(() => spendChart(financialStateStore.state.transactions, position.value))
const monthName = computed(() => formatMonthName(position.value.month).toLowerCase())

const ICON_REVIEW = 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11'
const ICON_PREPARE = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15h6'

interface Entry {
  key: string
  kicker: string
  title: string
  teaser: string
  done: boolean
  open: () => void
  undo?: () => void
  undoLabel?: string
}

// The month just closed exists from February on; the next month, until November.
const entries = computed<Entry[]>(() => {
  const current = viewModel.value.currentMonth
  const list: Entry[] = []
  const closed = current >= 2 && current <= 12 ? asMonth(current - 1) : null
  if (closed) {
    const name = formatMonthName(closed)
    const done = reviewed.value?.month === closed ? reviewed.value : null
    list.push({
      key: 'review',
      kicker: done ? 'Hecho' : `Pendiente · cierre de ${name.toLowerCase()}`,
      title: done ? `${name} revisado` : `Revisar ${name.toLowerCase()}`,
      teaser: done?.summary ?? '',
      done: !!done,
      open: () => screens.go('review'),
      undo: done?.undo,
      undoLabel: `Deshacer la revisión de ${name.toLowerCase()}`,
    })
  }
  const next = current >= 1 && current <= 11 ? asMonth(current + 1) : null
  if (next) {
    const name = formatMonthName(next)
    const done = prepared.value?.month === next ? prepared.value : null
    list.push({
      key: 'prepare',
      kicker: done ? 'Hecho' : '',
      title: done ? `${name} preparado` : `Preparar ${name.toLowerCase()}`,
      teaser: done ? `${done.summary} · ver` : '',
      done: !!done,
      open: () => screens.go('prepare'),
    })
  }
  return list
})

// The panel keeps the last category while it slides out.
const openCategory = ref<string | null>(null)
const shownCategory = ref<string | null>(null)
const detailOpen = computed({
  get: () => openCategory.value !== null,
  set: (open) => {
    if (!open) openCategory.value = null
  },
})

function showCategory(category: string): void {
  openCategory.value = shownCategory.value = category
}

const detail = computed(() => {
  const row = expenseRows.value.find((candidate) => candidate.category === shownCategory.value)
  return row ? categoryDetail(row, position.value) : null
})
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="grid min-w-0 gap-2">
      <p class="text-muted text-label tracking-label font-extrabold uppercase">
        {{ monthKicker(position) }}
      </p>
      <h1
        id="budget-title"
        tabindex="-1"
        class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        Presupuesto
      </h1>
    </div>
    <NeonButton @click="screens.go('year')">
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
        <path d="M4 5h16v14H4zM4 10h16M4 14.5h16M9.3 5v14M14.6 5v14" />
      </svg>
      Ver el año
    </NeonButton>
  </header>

  <div
    v-if="entries.length"
    role="group"
    aria-label="Para hacer este mes"
    class="grid min-w-0 grid-cols-1 gap-3.5 @min-[720px]:grid-cols-2"
  >
    <div
      v-for="entry in entries"
      :key="entry.key"
      class="bg-panel border-line flex min-w-0 items-center gap-2 rounded-[22px] border py-1.5 ps-1.5 pe-2.5"
    >
      <button
        type="button"
        class="text-text outline-accent hover:bg-panel2 grid min-h-16 min-w-0 flex-auto grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-2xl px-2.5 py-1.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]"
        @click="entry.open"
      >
        <span
          class="bg-panel2 grid size-10 place-items-center rounded-full"
          :class="entry.done ? 'text-muted' : 'text-text'"
          aria-hidden="true"
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="entry.key === 'review' ? ICON_REVIEW : ICON_PREPARE" />
          </svg>
        </span>
        <span class="grid min-w-0 gap-0.5">
          <span
            v-if="entry.kicker"
            class="text-label tracking-label flex min-w-0 items-center gap-2 font-extrabold uppercase"
            :class="entry.done ? 'text-muted' : 'text-accent-text'"
          >
            <span
              v-if="!entry.done"
              class="bg-accent size-[7px] flex-none rounded-full"
              aria-hidden="true"
            ></span>
            <span>{{ entry.kicker }}</span>
          </span>
          <span
            class="truncate text-[18px] font-extrabold"
            :class="entry.done ? 'text-soft' : 'text-text'"
          >
            {{ entry.title }}
          </span>
          <span v-if="entry.teaser" class="text-muted truncate text-[14px]">
            {{ entry.teaser }}
          </span>
        </span>
        <svg
          class="text-faint size-[18px]"
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
      <button
        v-if="entry.undo"
        type="button"
        class="text-muted outline-accent min-h-11 flex-none px-2 text-[13px] font-bold underline underline-offset-4 focus-visible:outline-2"
        :aria-label="entry.undoLabel"
        @click="entry.undo"
      >
        Deshacer
      </button>
    </div>
  </div>

  <NeonBudgetSpendChart :chart="chart" :day="position.day" />

  <section
    aria-label="Lo que queda este mes"
    class="bg-panel border-line grid min-w-0 grid-cols-1 gap-y-5 rounded-[22px] border px-6 py-[22px] @max-lg:px-3 @max-lg:py-4 @min-[720px]:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))]"
  >
    <div class="grid min-w-0 gap-1 @min-[720px]:pe-6">
      <span class="text-muted text-[14px]"> Libre para gastar hasta el {{ position.days }} </span>
      <span
        class="font-display text-[52px] leading-[1.05] font-bold tracking-[-0.035em] @min-[720px]:text-[56px]"
        data-budget-free
      >
        <NeonCents :text="formatMoney(hero.free)" />
      </span>
      <span v-if="hero.perDay !== null" class="text-soft text-[15px]">
        ≈ <b class="text-text font-extrabold">{{ formatMoney(hero.perDay) }}</b> al día
        <span v-if="hero.perWeek !== null"> · {{ formatMoney(hero.perWeek) }} por semana</span>
      </span>
    </div>
    <div
      class="border-line grid min-w-0 content-end gap-1.5 @max-[719px]:border-t @max-[719px]:pt-5 @min-[720px]:border-s @min-[720px]:px-6"
    >
      <span class="text-muted text-[14px]">Gastado este mes</span>
      <span class="font-display text-[22px] font-semibold tracking-[-0.02em]">
        {{ formatMoney(hero.spent) }}
      </span>
      <span class="text-muted text-[13px]">de {{ formatMoney(hero.planned) }} previstos</span>
    </div>
    <div
      class="border-line grid min-w-0 content-center gap-1.5 @max-[719px]:border-t @max-[719px]:pt-5 @min-[720px]:justify-items-center @min-[720px]:border-s @min-[720px]:px-6 @min-[720px]:text-center"
    >
      <span class="text-muted text-[14px]">Quedan</span>
      <span class="font-display text-[22px] font-semibold tracking-[-0.02em]">
        {{ daysText(hero.daysLeft) }}
      </span>
    </div>
  </section>

  <section aria-labelledby="budget-categories-title" class="grid min-w-0 gap-3.5">
    <h2 id="budget-categories-title" class="text-[18px] font-extrabold">Por categoría</h2>

    <NeonEmptyState v-if="!categories.length">
      Aún no hay presupuesto de gastos para {{ monthName }}. Fija el límite de cada categoría en el
      año.
      <template #action>
        <NeonButton @click="screens.go('year')">Ver el año</NeonButton>
      </template>
    </NeonEmptyState>

    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,290px),1fr))] gap-3.5">
      <li v-for="category in categories" :key="category.category" class="grid min-w-0">
        <button
          type="button"
          class="bg-panel text-text outline-accent hover:bg-panel2 grid min-w-0 content-start gap-3 rounded-[22px] border px-6 py-[22px] text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97] @max-lg:px-3 @max-lg:py-4"
          :class="openCategory === category.category ? 'border-text' : 'border-line'"
          aria-haspopup="dialog"
          :aria-expanded="openCategory === category.category"
          :aria-label="categoryAria(category)"
          :data-budget-category="category.category"
          @click="showCategory(category.category)"
        >
          <span class="flex min-w-0 items-baseline justify-between gap-3">
            <span class="inline-flex min-w-0 items-center gap-1.5 text-[18px] font-extrabold">
              <span class="truncate">{{ category.category }}</span>
              <svg
                class="text-faint size-3.5 flex-none"
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
            </span>
            <span
              class="flex-none text-[13px] font-bold"
              :class="isWarning(category.status) ? 'text-loss' : 'text-muted'"
              data-budget-status
            >
              {{ STATUS_LABEL[category.status] }}
            </span>
          </span>
          <span class="grid min-w-0 gap-0.5">
            <span
              class="font-display text-[22px] leading-[1.15] font-semibold tracking-[-0.02em]"
              :class="category.left < 0 ? 'text-loss' : 'text-text'"
              data-budget-left
            >
              {{ formatMoney(Math.abs(category.left)) }}
            </span>
            <span class="text-muted text-[13px]">
              {{ category.left < 0 ? 'por encima' : 'libres' }} de {{ formatMoney(category.plan) }}
            </span>
          </span>
          <span class="bg-line rounded-pill relative block h-1.5" aria-hidden="true">
            <span
              class="rounded-pill absolute inset-y-0 start-0"
              :class="category.status === 'over' ? 'bg-loss' : 'bg-neutral-bar'"
              :style="{ width: `${category.fill}%` }"
            ></span>
            <span
              class="bg-text absolute -inset-y-[5px] -ms-px w-0.5 rounded-[1px]"
              :style="{ insetInlineStart: `${category.tick}%` }"
            ></span>
          </span>
        </button>
      </li>
    </ul>

    <p v-if="unbudgeted.length" class="text-muted text-[14px]">
      Sin presupuesto este mes: {{ unbudgeted.join(', ') }}.
    </p>
  </section>

  <NeonBudgetCategoryDetail v-model:open="detailOpen" :detail="detail" :year="viewModel.year" />
</template>
