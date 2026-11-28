<script setup lang="ts">
import { computed, ref } from 'vue'

import { formatMoney } from '../../../lib/format'
import { monthIndex } from '../../../lib/month'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { useNeonBudgetScreens } from './budget-screens'
import { MONTH_INITIALS } from './month-view-model'
import { useReviewSession } from './review-session'
import {
  applyRangeProse,
  DECISION_OPTIONS,
  decisionAmount,
  suggestionChange,
  type ReviewCategory,
} from './review-view-model'
import { shortMonth } from './year-view-model'

// «Revisar {mes}» in the mobile frame (artboard «Presupuesto · móvil · Pixel
// 10», #434): how the closed month ended, one card per category whose budget
// the suggestions would change (leave it or accept it, or open it to choose),
// the ones that are in order folded away, and «Aplicar» docked at the bottom.
// The decisions and what applying writes are the desktop screen's.
const screens = useNeonBudgetScreens()
const review = useReviewSession()
const {
  position,
  categories,
  exceptions,
  inOrder,
  monthName,
  monthLower,
  from,
  totals,
  canApply,
  decisions,
} = review

const showInOrder = ref(false)
const sheetName = ref<string | null>(null)
const sheetOpen = computed({
  get: () => sheetName.value !== null,
  set: (open) => {
    if (!open) sheetName.value = null
  },
})
// The sheet keeps the last category while it slides out.
const shown = ref<ReviewCategory | null>(null)

function openSheet(category: ReviewCategory): void {
  shown.value = category
  sheetName.value = category.category
}

const verdict = computed(() => {
  const plan = categories.value.reduce((sum, category) => sum + category.plan, 0)
  const diff = categories.value.reduce((sum, category) => sum + category.diff, 0)
  const under = diff < -0.005
  const over = diff > 0.005
  return {
    figure: over ? `+${formatMoney(diff)}` : formatMoney(diff),
    note: `${under ? 'por debajo de' : over ? 'por encima de' : 'en'} los ${formatMoney(plan)} presupuestados`,
    tone: over ? 'text-loss' : under ? 'text-gain' : 'text-text',
  }
})

function decided(category: ReviewCategory): string | null {
  const decision = decisions[category.category]
  if (!decision) return null
  if (decision.mode === 'keep') return `Se queda en ${formatMoney(category.plan)}`
  return `${formatMoney(category.plan)} → ${formatMoney(decisionAmount(category, decision))}`
}

function barClass(kind: 'over' | 'closed' | 'normal'): string {
  return kind === 'over' ? 'bg-loss' : kind === 'closed' ? 'bg-soft' : 'bg-neutral-bar'
}

function barsLabel(category: ReviewCategory): string {
  return `${category.category}: ${formatMoney(category.actual)} de ${formatMoney(category.plan)} en ${monthLower.value}. ${category.insight}`
}

function apply(): void {
  review.apply()
  screens.go('month')
}

function accept(category: ReviewCategory): void {
  review.pick(category, category.suggestion.mode)
}

const segment =
  'rounded-pill outline-accent pointer-coarse:min-h-11 min-h-9 min-w-0 flex-1 px-2 text-sm font-extrabold focus-visible:outline-2 focus-visible:-outline-offset-2'
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <div class="flex min-w-0 items-center gap-3">
      <button
        type="button"
        class="border-ctrl-line text-text outline-accent grid size-11 flex-none place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label="Volver a este mes"
        @click="screens.go('month')"
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
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      </button>
      <h1
        id="budget-title"
        tabindex="-1"
        class="font-display text-[22px] leading-[1.15] font-bold tracking-[-0.03em] outline-none"
      >
        {{ position ? `Revisar ${monthLower}` : 'Revisar el mes' }}
      </h1>
    </div>

    <NeonEmptyState v-if="!position || !categories.length">
      {{
        position
          ? `No hay categorías con presupuesto en ${monthLower}: no hay nada que revisar.`
          : 'Aún no ha cerrado ningún mes de este año: no hay nada que revisar.'
      }}
    </NeonEmptyState>

    <template v-else>
      <div class="grid gap-1 ps-0.5">
        <span class="text-muted text-label tracking-label font-extrabold uppercase">
          {{ monthName }} cerrado
        </span>
        <span
          class="font-display text-[38px] leading-[1.05] font-bold tracking-[-0.035em]"
          :class="verdict.tone"
          >{{ verdict.figure }}</span
        >
        <span class="text-muted text-[15px]">{{ verdict.note }}</span>
        <p v-if="!from" class="text-muted mbs-1 text-[14px]">
          Es un año ya cerrado: no queda ningún mes al que aplicar cambios.
        </p>
        <p v-else class="text-muted mbs-1 text-[14px]">
          Los cambios se aplican de {{ applyRangeProse(from) }}.
        </p>
      </div>

      <ul class="grid gap-3">
        <li
          v-for="category in exceptions"
          :key="category.category"
          class="bg-panel border-line grid rounded-[22px] border px-3 py-4"
        >
          <button
            type="button"
            class="text-text outline-accent grid min-h-11 gap-1 rounded-2xl text-start focus-visible:outline-2 focus-visible:outline-offset-4"
            aria-haspopup="dialog"
            @click="openSheet(category)"
          >
            <span class="flex items-center justify-between gap-2 text-[18px] font-extrabold">
              <span>{{ category.category }}</span>
              <svg
                class="text-muted size-[18px] flex-none"
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
            <span class="font-display text-[22px] font-semibold tracking-[-0.02em]">
              {{ suggestionChange(category) }}
            </span>
            <span class="text-muted text-[14px]">
              {{ monthName }}: {{ formatMoney(category.actual) }} de
              {{ formatMoney(category.plan) }}
            </span>
          </button>

          <div v-if="!decided(category)" class="grid gap-3.5 pbs-3.5">
            <span role="img" :aria-label="barsLabel(category)" class="grid gap-1.5">
              <span class="relative flex h-[84px] items-end gap-[3px]" aria-hidden="true">
                <span
                  v-for="bar in category.bars"
                  :key="bar.month"
                  class="min-h-0.5 flex-1 rounded-t-[6px]"
                  :class="barClass(bar.kind)"
                  :style="{ height: `${bar.height}%` }"
                ></span>
                <span
                  class="border-faint absolute inset-x-0 border-t border-dashed"
                  :style="{ bottom: `${category.planLine}%` }"
                ></span>
              </span>
              <span
                class="text-faint flex justify-between text-[12px] font-bold"
                aria-hidden="true"
              >
                <span>{{ shortMonth(category.bars[0].month) }}</span>
                <span>- - Plan {{ formatMoney(category.plan) }}</span>
                <span>{{ monthName.slice(0, 3) }}</span>
              </span>
            </span>
            <div
              role="group"
              :aria-label="`Qué hacer con el presupuesto de ${category.category}`"
              class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
            >
              <button
                type="button"
                :class="[segment, 'text-soft']"
                :aria-label="`Dejar el presupuesto de ${category.category}`"
                @click="review.pick(category, 'keep')"
              >
                Dejar
              </button>
              <button
                type="button"
                :class="[segment, 'text-soft']"
                :aria-label="`Aceptar la sugerencia para ${category.category}`"
                @click="accept(category)"
              >
                Aceptar
              </button>
            </div>
          </div>
          <div
            v-else
            role="status"
            class="border-line mbs-3 flex items-center justify-between gap-3 border-t pbs-2"
          >
            <span class="text-accent-text text-[15px] font-extrabold">{{ decided(category) }}</span>
            <button
              type="button"
              class="text-muted outline-accent min-h-11 flex-none px-1 text-[14px] font-bold underline underline-offset-4 focus-visible:outline-2"
              :aria-label="`Cambiar la decisión sobre ${category.category}`"
              @click="review.reopen(category)"
            >
              Cambiar
            </button>
          </div>
        </li>
      </ul>

      <section v-if="inOrder.length" class="grid">
        <button
          type="button"
          class="text-text outline-accent flex min-h-14 items-center justify-between gap-3 text-[16px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          :aria-expanded="showInOrder"
          @click="showInOrder = !showInOrder"
        >
          <span>{{ inOrder.length }} en orden</span>
          <span class="text-muted text-[14px] font-bold">{{
            showInOrder ? 'Ocultar' : 'Ver'
          }}</span>
        </button>
        <ol v-if="showInOrder" class="grid">
          <li v-for="category in inOrder" :key="category.category" class="border-line border-t">
            <button
              type="button"
              class="text-text outline-accent grid min-h-15 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
              aria-haspopup="dialog"
              @click="openSheet(category)"
            >
              <span class="grid min-w-0 gap-px">
                <span class="text-[15px] font-bold">{{ category.category }}</span>
                <span
                  class="text-[13px] font-bold"
                  :class="category.overBudget ? 'text-loss' : 'text-muted'"
                  >{{ category.deviation }}</span
                >
              </span>
              <span class="text-muted text-[13px] font-extrabold">
                {{ decided(category) ?? 'Por revisar' }}
              </span>
              <svg
                class="text-muted size-[18px] flex-none"
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
          </li>
        </ol>
      </section>

      <div
        data-bottom-dock
        class="bg-panel border-line shadow-float sticky bottom-[calc(92px+env(safe-area-inset-bottom,0px))] z-20 flex items-center gap-3 rounded-[20px] border py-2.5 ps-[18px] pe-3"
      >
        <div class="grid min-w-0 flex-1">
          <span class="text-muted text-[12px] font-bold">Presupuesto mensual</span>
          <span class="font-display text-[20px] font-semibold tracking-[-0.02em]">
            {{ formatMoney(totals.planAfter) }}
          </span>
        </div>
        <NeonButton variant="primary" :disabled="!canApply" @click="apply">Aplicar</NeonButton>
      </div>
    </template>
  </div>

  <NeonDetailPanel v-model:open="sheetOpen" :title="shown?.category ?? ''" :kicker="monthName">
    <template v-if="shown">
      <p class="text-muted text-[15px]">
        {{ formatMoney(shown.actual) }} de {{ formatMoney(shown.plan) }} ·
        <b class="font-extrabold" :class="shown.overBudget ? 'text-loss' : 'text-text'">{{
          shown.deviation
        }}</b>
      </p>
      <div role="img" :aria-label="barsLabel(shown)" class="grid gap-1.5">
        <div class="relative flex h-[104px] items-end gap-[3px]" aria-hidden="true">
          <span
            v-for="bar in shown.bars"
            :key="bar.month"
            class="min-h-0.5 flex-1 rounded-t-[6px]"
            :class="barClass(bar.kind)"
            :style="{ height: `${bar.height}%` }"
          ></span>
          <span
            class="border-faint absolute inset-x-0 border-t border-dashed"
            :style="{ bottom: `${shown.planLine}%` }"
          ></span>
        </div>
        <div class="text-faint flex gap-[3px] text-[11px] font-bold" aria-hidden="true">
          <span v-for="bar in shown.bars" :key="bar.month" class="flex-1 text-center">{{
            MONTH_INITIALS[monthIndex(bar.month)]
          }}</span>
        </div>
      </div>
      <p class="text-soft text-[14px]">{{ shown.insight }}</p>
      <div
        role="group"
        :aria-label="`Qué hacer con el presupuesto de ${shown.category}`"
        class="bg-panel2 rounded-pill flex gap-[3px] p-[3px]"
      >
        <button
          v-for="option in DECISION_OPTIONS"
          :key="option.mode"
          type="button"
          :aria-pressed="review.isPressed(shown, option.mode)"
          :class="[
            segment,
            review.isPressed(shown, option.mode) ? 'bg-sel-bg text-sel-text' : 'text-soft',
          ]"
          @click="review.pick(shown, option.mode)"
        >
          {{ option.label }}
        </button>
      </div>
      <label v-if="review.showAmount(shown)" class="text-muted grid gap-1.5 text-[13px] font-bold">
        <span>Nuevo presupuesto</span>
        <span class="flex items-center gap-2">
          <input
            type="text"
            inputmode="decimal"
            :value="review.draftOf(shown)"
            class="border-ctrl-line bg-panel text-text font-display outline-accent min-h-[46px] w-full min-w-0 flex-1 rounded-[14px] border px-3.5 text-end text-base font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
            @input="review.setDraft(shown, ($event.target as HTMLInputElement).value)"
          />
          <span aria-hidden="true" class="text-muted text-base">€</span>
        </span>
      </label>
      <p class="text-muted text-[13px]">{{ shown.suggestion.text }}</p>
    </template>
    <template #footer>
      <NeonButton variant="primary" class="flex-1" @click="sheetOpen = false">Listo</NeonButton>
    </template>
  </NeonDetailPanel>
</template>
