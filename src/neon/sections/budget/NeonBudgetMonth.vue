<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'

import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonBudgetCategoryPopover from './NeonBudgetCategoryPopover.vue'
import NeonBudgetSpendChart from './NeonBudgetSpendChart.vue'
import NeonCents from './NeonCents.vue'
import { ICON_PREPARE, ICON_REVIEW, useMonthCover } from './month-session'
import { categoryAria, daysText, isWarning, monthKicker, STATUS_LABEL } from './month-view-model'

// «Este mes», the cover of the new Presupuesto: every category's budget in one
// ledger, tightest first, with today's pace marked; beside it, what is left to
// spend, the two things to do this month (review the month just closed, prepare
// the next one) and the month's spending day by day. A category opens its
// detail, month by month.
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

// A category opens its detail in a popover beside its row; the same row closes it.
const cover = useTemplateRef<HTMLElement>('cover')
const anchor = computed(() =>
  openCategory.value === null
    ? null
    : (cover.value?.querySelector<HTMLElement>(
        `[data-budget-category="${CSS.escape(openCategory.value)}"]`,
      ) ?? null),
)
function toggleCategory(category: string): void {
  if (openCategory.value === category) detailOpen.value = false
  else showCategory(category)
}

// Tightest first: over, out of budget, then by the share of the budget still free.
const sortedCategories = computed(() =>
  [...categories.value].sort((a, b) => a.left / a.plan - b.left / b.plan),
)
</script>

<template>
  <header class="motion-safe:animate-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
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
    ref="cover"
    class="relative grid min-w-0 items-start gap-5 @min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]"
  >
    <section
      aria-labelledby="budget-categories-title"
      class="bg-panel border-line motion-safe:animate-rise @container grid min-w-0 gap-3.5 rounded-[22px] border px-6 py-[22px] motion-safe:[animation-delay:70ms]"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="budget-categories-title" class="text-[18px] font-extrabold">Por categoría</h2>
        <p v-if="categories.length" class="text-muted text-[13px]">
          La raya es hoy, día {{ position.day }}.
        </p>
      </div>

      <NeonEmptyState v-if="!categories.length">
        Aún no hay presupuesto de gastos para {{ monthName }}. Fija el límite de cada categoría en
        el año.
        <template #action>
          <NeonButton @click="screens.go('year')">Ver el año</NeonButton>
        </template>
      </NeonEmptyState>

      <div
        v-else
        class="grid min-w-0 grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)_auto] @max-[640px]:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div
          class="text-muted text-label tracking-label col-span-full grid grid-cols-subgrid px-3 pbe-2.5 font-extrabold uppercase"
          aria-hidden="true"
        >
          <span>Categoría</span>
          <span class="@max-[640px]:hidden">Gastado</span>
          <span class="@max-[640px]:hidden"></span>
          <span class="text-end">Queda</span>
        </div>
        <ul class="col-span-full grid grid-cols-subgrid">
          <li
            v-for="category in sortedCategories"
            :key="category.category"
            class="border-line col-span-full grid grid-cols-subgrid border-t"
          >
            <button
              type="button"
              class="text-text outline-accent hover:bg-panel2 col-span-full -mx-3 my-px grid min-h-16 grid-cols-subgrid items-center rounded-[14px] px-6 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-[scale,background-color] motion-safe:duration-140 motion-safe:active:scale-[0.985]"
              :class="openCategory === category.category && 'bg-panel2'"
              aria-haspopup="dialog"
              :aria-expanded="openCategory === category.category"
              :aria-label="categoryAria(category)"
              :data-budget-category="category.category"
              @click="toggleCategory(category.category)"
            >
              <span class="grid min-w-0">
                <span class="truncate text-[16px] font-bold">{{ category.category }}</span>
                <span
                  v-if="isWarning(category.status)"
                  class="text-loss text-[13px] font-bold"
                  data-budget-status
                  >{{ STATUS_LABEL[category.status] }}</span
                >
              </span>
              <span class="text-muted pe-7 text-[14px] whitespace-nowrap @max-[640px]:hidden">
                <b
                  class="font-display text-[15px] font-semibold"
                  :class="category.spent > 0 ? 'text-soft' : 'text-muted'"
                  >{{ formatMoney(category.spent) }}</b
                >
                de {{ formatMoney(category.plan) }}
              </span>
              <span
                class="bg-line rounded-pill relative me-7 block h-1.5 @max-[640px]:hidden"
                aria-hidden="true"
              >
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
              <span
                class="font-display text-end text-[18px] font-semibold tracking-[-0.02em] whitespace-nowrap"
                :class="category.left < 0 ? 'text-loss' : 'text-text'"
                data-budget-left
                >{{ formatMoney(category.left) }}</span
              >
            </button>
          </li>
        </ul>
      </div>

      <p v-if="unbudgeted.length" class="text-muted text-[14px]">
        Sin presupuesto este mes: {{ unbudgeted.join(', ') }}.
      </p>
    </section>

    <div class="grid min-w-0 gap-5">
      <section
        aria-label="Lo que queda este mes"
        class="bg-panel border-line motion-safe:animate-rise grid min-w-0 gap-4 rounded-[22px] border px-6 py-[22px] motion-safe:[animation-delay:140ms]"
      >
        <div class="grid min-w-0 gap-1">
          <span class="text-muted text-[14px]">Libre para gastar hasta el {{ position.days }}</span>
          <span
            class="font-display text-[56px] leading-[1.05] font-bold tracking-[-0.035em]"
            data-budget-free
          >
            <NeonCents :text="formatMoney(hero.free)" />
          </span>
          <span v-if="hero.perDay !== null" class="text-soft text-[15px]">
            ≈ <b class="text-text font-extrabold">{{ formatMoney(hero.perDay) }}</b> al día en
            {{ daysText(hero.daysLeft) }}
          </span>
          <span class="text-muted text-[14px]">de {{ formatMoney(hero.planned) }} previstos</span>
        </div>
      </section>

      <div
        v-if="entries.length"
        role="group"
        aria-label="Para hacer este mes"
        class="bg-panel border-line motion-safe:animate-rise grid min-w-0 gap-0.5 rounded-[22px] border p-1.5 motion-safe:[animation-delay:210ms]"
      >
        <div v-for="entry in entries" :key="entry.key" class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="text-text outline-accent hover:bg-panel2 grid min-h-16 min-w-0 flex-auto grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-2xl px-2.5 py-2 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]"
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
                class="truncate text-[17px] font-extrabold"
                :class="entry.done ? 'text-soft' : 'text-text'"
              >
                {{ entry.title }}
              </span>
              <span v-if="entry.teaser" class="text-muted text-[14px]">
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

      <NeonBudgetSpendChart
        :chart="chart"
        :day="position.day"
        class="motion-safe:animate-rise motion-safe:[animation-delay:280ms]"
      />
    </div>

    <NeonBudgetCategoryPopover
      v-model:open="detailOpen"
      :detail="detail"
      :year="viewModel.year"
      :anchor="anchor"
    />
  </div>
</template>
