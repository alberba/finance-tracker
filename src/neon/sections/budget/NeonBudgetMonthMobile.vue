<script setup lang="ts">
import { computed } from 'vue'

import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonBudgetCategoryDetail from './NeonBudgetCategoryDetail.vue'
import NeonBudgetSpendChart from './NeonBudgetSpendChart.vue'
import NeonCents from './NeonCents.vue'
import { ICON_PREPARE, ICON_REVIEW, useMonthCover } from './month-session'
import { categoryAria, isWarning, STATUS_LABEL } from './month-view-model'
import { closeVerdict, suggestionLine } from './review-view-model'
import { useReviewSession } from './review-session'

// «Este mes» in the mobile frame (artboard «Presupuesto · móvil · Pixel 10»,
// #434): the month's spending first, then what to do about the months around
// it (the close card, the review, the next month and the year as round
// actions), what is left and each category as a row with its ring. The same
// data as the desktop cover; only the composition changes.
const {
  viewModel,
  position,
  categories,
  unbudgeted,
  hero,
  chart,
  monthName,
  entries,
  openCategory,
  detailOpen,
  showCategory,
  detail,
  formatMoney,
  screens,
} = useMonthCover()
const review = useReviewSession()

const RING = 2 * Math.PI * 21
const ICON_YEAR = 'M4 5h16v14H4zM4 10h16M4 14.5h16M9.3 5v14M14.6 5v14'

// The close card offers the suggestions of the closed month until it is reviewed.
const closing = computed(() =>
  review.position.value && !review.applied.value && review.exceptions.value.length
    ? {
        kicker: `${review.monthName.value} cerrado`,
        verdict: closeVerdict(review.categories.value, review.monthName.value),
        line: suggestionLine(review.exceptions.value),
      }
    : null,
)
const reviewed = computed(() => (review.applied.value ? screens.reviewed : null))

const actions = computed(() => [
  ...entries.value.map((entry) => ({
    key: entry.key,
    label: entry.title,
    icon: entry.key === 'review' ? ICON_REVIEW : ICON_PREPARE,
    dot: entry.key === 'review' && !entry.done,
    done: entry.done,
    open: entry.open,
  })),
  {
    key: 'year',
    label: 'Ver el año',
    icon: ICON_YEAR,
    dot: false,
    done: false,
    open: () => screens.go('year'),
  },
])

function dash(fill: number): string {
  return `${(fill / 100) * RING} ${RING}`
}
</script>

<template>
  <h1 id="budget-title" tabindex="-1" class="sr-only">Presupuesto</h1>

  <NeonBudgetSpendChart bare :chart="chart" :day="position.day" />

  <section
    v-if="closing"
    aria-label="Cierre del mes"
    class="bg-panel border-line grid min-w-0 gap-4 rounded-[22px] border px-3 py-4"
  >
    <div class="grid gap-1.5">
      <span
        class="text-accent-text text-label tracking-label flex items-center gap-2 font-extrabold uppercase"
      >
        <span class="bg-accent size-[7px] rounded-full" aria-hidden="true"></span>
        {{ closing.kicker }}
      </span>
      <span class="font-display text-[20px] leading-[1.25] font-semibold tracking-[-0.02em]">
        {{ closing.verdict }}
      </span>
      <span class="text-soft text-[15px]">{{ closing.line }}</span>
    </div>
    <div class="flex gap-2.5">
      <NeonButton class="flex-1" @click="screens.go('review')">Revisar</NeonButton>
      <NeonButton class="flex-1" variant="primary" @click="review.acceptAll">Aceptar</NeonButton>
    </div>
  </section>
  <div
    v-else-if="reviewed"
    role="status"
    class="bg-panel border-line flex items-center justify-between gap-3 rounded-[22px] border px-3 py-4"
  >
    <span class="grid min-w-0 gap-0.5">
      <span class="text-[15px] font-extrabold">{{ review.monthName.value }} revisado</span>
      <span class="text-muted text-[13px]">{{ reviewed.summary }}</span>
    </span>
    <button
      type="button"
      class="text-muted outline-accent min-h-11 flex-none px-2 text-[14px] font-bold underline underline-offset-4 focus-visible:outline-2"
      :aria-label="`Deshacer la revisión de ${review.monthName.value.toLowerCase()}`"
      @click="review.undo"
    >
      Deshacer
    </button>
  </div>

  <div role="group" aria-label="Para hacer este mes" class="grid grid-cols-3 gap-2">
    <button
      v-for="action in actions"
      :key="action.key"
      type="button"
      class="text-text outline-accent grid min-h-11 justify-items-center gap-2 rounded-2xl py-1 focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]"
      @click="action.open"
    >
      <span
        class="bg-panel border-line relative grid size-14 place-items-center rounded-full border"
        :class="action.done ? 'text-muted' : 'text-text'"
      >
        <svg
          class="size-[22px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="action.icon" />
        </svg>
        <span
          v-if="action.dot"
          class="bg-accent ring-bg absolute top-0.5 right-0.5 size-3 rounded-full ring-[3px]"
          aria-hidden="true"
        ></span>
      </span>
      <span
        class="text-center text-[13px] leading-[1.2] font-extrabold"
        :class="action.done ? 'text-soft' : 'text-text'"
        >{{ action.label }}</span
      >
    </button>
  </div>

  <section aria-label="Lo que queda este mes" class="grid min-w-0 grid-cols-2">
    <div class="grid min-w-0 gap-1 pe-3">
      <span class="text-muted text-[14px]">Libre hasta el {{ position.days }}</span>
      <span
        class="font-display text-[38px] leading-[1.05] font-bold tracking-[-0.035em]"
        data-budget-free
      >
        <NeonCents :text="formatMoney(hero.free)" />
      </span>
    </div>
    <div class="border-line grid min-w-0 content-center gap-1.5 border-s ps-4">
      <span class="text-muted text-[14px]">Gastado este mes</span>
      <span class="font-display text-[22px] font-semibold tracking-[-0.02em]">
        {{ formatMoney(hero.spent) }}
      </span>
      <span class="text-muted text-[13px]">de {{ formatMoney(hero.planned) }} previstos</span>
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

    <ul v-else class="grid">
      <li v-for="category in categories" :key="category.category" class="border-line border-t">
        <button
          type="button"
          class="text-text outline-accent grid min-h-16 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.99]"
          aria-haspopup="dialog"
          :aria-expanded="openCategory === category.category"
          :aria-label="categoryAria(category)"
          :data-budget-category="category.category"
          @click="showCategory(category.category)"
        >
          <span class="relative grid size-10 place-items-center" aria-hidden="true">
            <svg
              class="absolute inset-0 -rotate-90"
              width="40"
              height="40"
              viewBox="0 0 48 48"
              fill="none"
            >
              <circle class="stroke-grid" cx="24" cy="24" r="21" stroke-width="4" />
              <circle
                :class="category.status === 'over' ? 'stroke-loss' : 'stroke-neutral-bar'"
                cx="24"
                cy="24"
                r="21"
                stroke-width="4"
                stroke-linecap="round"
                :stroke-dasharray="dash(category.fill)"
              />
            </svg>
            <span class="font-display text-soft text-[15px] font-semibold">{{
              category.category.charAt(0).toUpperCase()
            }}</span>
          </span>
          <span class="grid min-w-0 gap-0.5">
            <span class="truncate text-[16px] font-bold">{{ category.category }}</span>
            <span
              class="text-[13px] font-bold"
              :class="isWarning(category.status) ? 'text-loss' : 'text-muted'"
              data-budget-status
            >
              {{ STATUS_LABEL[category.status] }}
            </span>
          </span>
          <span class="grid justify-items-end gap-0.5">
            <span
              class="font-display text-[16px] font-semibold"
              :class="category.left < 0 ? 'text-loss' : 'text-text'"
              data-budget-left
            >
              {{ formatMoney(Math.abs(category.left)) }}
            </span>
            <span class="text-muted text-[12px]">
              {{ category.left < 0 ? 'por encima' : 'libres' }} de {{ formatMoney(category.plan) }}
            </span>
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
