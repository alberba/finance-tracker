<script setup lang="ts">
import { formatMoney, formatMonthName } from '../../../lib/format'
import { monthIndex } from '../../../lib/month'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { useNeonBudgetScreens } from './budget-screens'
import { MONTH_INITIALS } from './month-view-model'
import {
  applyRange,
  applyRangeProse,
  DECISION_OPTIONS,
  type ReviewCategory,
} from './review-view-model'
import { useReviewSession } from './review-session'

// «Revisar {mes}» in the new Presupuesto (artboard «Presupuesto · 2560 px»,
// #433): the month that just closed, category by category, with a suggestion
// and a decision (keep, raise or lower) for each, and the summary of the
// changes that «Aplicar cambios» writes from the current month through December.
const screens = useNeonBudgetScreens()
const {
  position,
  categories,
  monthName,
  monthLower,
  from,
  totals,
  changes,
  strip,
  applied,
  canApply,
  pick,
  draftOf,
  setDraft,
  isPressed,
  showAmount,
  apply,
  undo,
} = useReviewSession()

function barClass(kind: 'over' | 'closed' | 'normal'): string {
  return kind === 'over' ? 'bg-loss' : kind === 'closed' ? 'bg-soft' : 'bg-neutral-bar'
}

const barLabel = (category: ReviewCategory) =>
  `${category.category}: ${formatMoney(category.actual)} de ${formatMoney(category.plan)} en ${monthLower.value}. ${category.insight}`
</script>

<template>
  <div class="grid min-w-0 gap-6">
    <button
      type="button"
      class="text-text rounded-pill outline-accent -ms-2.5 inline-flex min-h-11 items-center gap-1.5 self-start ps-2.5 pe-4 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      @click="screens.go('month')"
    >
      <svg
        width="18"
        height="18"
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
    </button>

    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div class="grid min-w-0 gap-2">
        <p class="text-muted text-xs font-extrabold tracking-[0.08em] uppercase">
          <template v-if="position">Cierre de mes · {{ monthLower }} {{ position.year }}</template>
          <template v-else>Cierre de mes</template>
        </p>
        <h1
          id="budget-title"
          tabindex="-1"
          class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
        >
          {{ position ? `Revisar ${monthLower}` : 'Revisar el mes' }}
        </h1>
        <p v-if="position" class="text-soft max-w-[62ch] text-base">
          Mira qué pasó en cada categoría y decide si su presupuesto sigue teniendo sentido.
          <template v-if="from">Los cambios se aplican de {{ applyRangeProse(from) }}.</template>
          <template v-else>
            Es un año ya cerrado: no queda ningún mes al que aplicar cambios.
          </template>
        </p>
      </div>
      <p v-if="categories.length" class="text-soft text-[15px]" aria-live="polite">
        <b class="text-text font-extrabold">{{ totals.reviewed }}</b> de
        {{ totals.total }} revisadas
      </p>
    </header>

    <NeonEmptyState v-if="!position || !categories.length">
      {{
        position
          ? `No hay categorías con presupuesto en ${monthLower}: no hay nada que revisar.`
          : 'Aún no ha cerrado ningún mes de este año: no hay nada que revisar.'
      }}
    </NeonEmptyState>

    <template v-else>
      <div
        role="group"
        :aria-label="`${monthName} en cifras`"
        class="grid min-w-0 grid-cols-4 gap-y-4"
      >
        <div
          v-for="(kpi, index) in strip"
          :key="kpi.label"
          class="border-line grid min-w-0 content-start gap-1.5 px-6"
          :class="index === 0 ? 'ps-0' : 'border-s'"
        >
          <span class="text-muted text-sm">{{ kpi.label }}</span>
          <span
            class="font-display text-[22px] font-semibold tracking-[-0.02em]"
            :class="kpi.loss ? 'text-loss' : 'text-text'"
            >{{ kpi.value }}</span
          >
          <span class="text-muted text-[13px]">{{ kpi.note }}</span>
        </div>
      </div>

      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_400px] items-start gap-5">
        <ol class="m-0 grid min-w-0 list-none gap-3 p-0">
          <li
            v-for="category in categories"
            :key="category.category"
            class="bg-panel border-line rounded-card grid min-w-0 grid-cols-[minmax(200px,260px)_minmax(0,1fr)_minmax(300px,340px)] items-center gap-x-7 gap-y-4 border px-6 py-[22px]"
          >
            <div class="grid min-w-0 gap-1">
              <h2 class="text-lg font-extrabold">{{ category.category }}</h2>
              <span class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span class="font-display text-[22px] font-semibold tracking-[-0.02em]">{{
                  formatMoney(category.actual)
                }}</span>
                <span class="text-muted text-sm">de {{ formatMoney(category.plan) }}</span>
              </span>
              <span
                class="text-sm font-extrabold"
                :class="category.overBudget ? 'text-loss' : 'text-muted'"
                >{{ category.deviation }}</span
              >
            </div>

            <div class="grid min-w-0 gap-2">
              <div role="img" :aria-label="barLabel(category)" class="grid gap-2">
                <div class="relative flex h-[52px] items-end gap-1" aria-hidden="true">
                  <span
                    v-for="bar in category.bars"
                    :key="bar.month"
                    class="min-h-0.5 flex-1 rounded-t-[3px]"
                    :class="barClass(bar.kind)"
                    :style="{ height: `${bar.height}%` }"
                  />
                  <span
                    class="border-faint absolute inset-x-0 border-t border-dashed"
                    :style="{ bottom: `${category.planLine}%` }"
                  />
                </div>
                <div class="text-faint flex gap-1 text-[11px] font-bold" aria-hidden="true">
                  <span v-for="bar in category.bars" :key="bar.month" class="flex-1 text-center">{{
                    MONTH_INITIALS[monthIndex(bar.month)]
                  }}</span>
                </div>
              </div>
              <p class="text-soft text-sm">{{ category.insight }}</p>
            </div>

            <div class="grid min-w-0 gap-2.5">
              <div
                role="group"
                :aria-label="`Qué hacer con el presupuesto de ${category.category}`"
                class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
              >
                <button
                  v-for="option in DECISION_OPTIONS"
                  :key="option.mode"
                  type="button"
                  :aria-pressed="isPressed(category, option.mode)"
                  class="rounded-pill outline-accent min-h-9 min-w-0 flex-1 px-2 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
                  :class="
                    isPressed(category, option.mode) ? 'bg-sel-bg text-sel-text' : 'text-soft'
                  "
                  @click="pick(category, option.mode)"
                >
                  {{ option.label }}
                </button>
              </div>
              <label
                v-if="showAmount(category)"
                class="text-muted grid gap-1.5 text-[13px] font-bold"
              >
                <span>Nuevo presupuesto</span>
                <span class="flex items-center gap-2">
                  <input
                    type="text"
                    inputmode="decimal"
                    :value="draftOf(category)"
                    class="border-ctrl-line bg-panel text-text font-display outline-accent min-h-[46px] w-full min-w-0 flex-1 rounded-[14px] border px-3.5 text-end text-base font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
                    @input="setDraft(category, ($event.target as HTMLInputElement).value)"
                  />
                  <span aria-hidden="true" class="text-muted text-base">€</span>
                </span>
              </label>
              <span class="text-muted text-[13px]">{{ category.suggestion.text }}</span>
            </div>
          </li>
        </ol>

        <aside
          aria-labelledby="review-summary-title"
          class="bg-panel border-line rounded-card sticky top-6 grid min-w-0 gap-4 border px-6 py-[22px]"
        >
          <h2 id="review-summary-title" class="text-lg font-extrabold">
            <template v-if="from">Cambios para {{ applyRange(from) }}</template>
            <template v-else>Cambios</template>
          </h2>
          <p v-if="!from" class="text-muted text-sm">
            {{ formatMonthName(12) }} ya ha cerrado y no queda ningún mes al que aplicar cambios.
          </p>
          <p v-else-if="!changes.length" class="text-muted text-sm">
            Aún no has cambiado nada. Lo que no revises se queda como está.
          </p>
          <ul v-else class="m-0 list-none p-0">
            <li
              v-for="change in changes"
              :key="change.category"
              class="border-line flex min-h-11 items-baseline justify-between gap-3 border-t py-2.5"
            >
              <span class="min-w-0 text-[15px] font-bold">{{ change.category }}</span>
              <span class="text-soft shrink-0 text-sm">{{ change.text }}</span>
            </li>
          </ul>
          <div class="bg-panel2 grid gap-2 rounded-[18px] px-4 py-3.5">
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-soft text-sm">Presupuesto mensual</span>
              <span class="text-muted text-sm">{{ formatMoney(totals.planBefore) }} →</span>
            </div>
            <span class="font-display text-end text-[30px] font-semibold tracking-[-0.02em]">{{
              formatMoney(totals.planAfter)
            }}</span>
          </div>
          <NeonButton v-if="from" variant="primary" :disabled="!canApply" @click="apply">
            Aplicar cambios
          </NeonButton>
          <div v-if="applied && from" role="status" class="flex items-center justify-between gap-3">
            <span class="text-sm font-bold">Aplicado de {{ applyRangeProse(from) }}.</span>
            <NeonButton @click="undo">Deshacer</NeonButton>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
