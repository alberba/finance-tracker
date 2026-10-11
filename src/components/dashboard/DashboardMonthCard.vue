<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseSelect from '../ui/BaseSelect.vue'
import type {
  DashboardIncomeSplit,
  DashboardKpi,
  DashboardKpiKind,
  DashboardMonthOption,
  DashboardTone,
  DashboardTrend,
} from '../../domain/dashboard/view-model'

// The month card: the three month figures side by side (rows on mobile), each
// with its change against the previous month and its last six months, and
// below them where the month's income went.
const props = defineProps<{
  monthName: string
  status: string
  kpis: DashboardKpi[]
  split: DashboardIncomeSplit | null
  months: DashboardMonthOption[]
  years: number[]
}>()

const month = defineModel<number>('month', { required: true })
const year = defineModel<number>('year', { required: true })

type BarInteraction = 'hover' | 'focus'
type BarPreview = { hover?: number; focus?: number; active: BarInteraction }
const previews = ref<Partial<Record<DashboardKpiKind, BarPreview>>>({})
const figures = computed(() =>
  props.kpis.map((kpi) => {
    const preview = previews.value[kpi.kind]
    const index = preview?.[preview.active] ?? preview?.hover ?? preview?.focus
    return {
      ...kpi,
      previewValue: index === undefined ? kpi.value : (kpi.bars[index]?.value ?? kpi.value),
    }
  }),
)

watch([month, year], () => {
  previews.value = {}
})

function previewBar(kind: DashboardKpiKind, interaction: BarInteraction, index: number): void {
  const preview = (previews.value[kind] ??= { active: interaction })
  preview[interaction] = index
  preview.active = interaction
}

function endPreview(kind: DashboardKpiKind, interaction: BarInteraction): void {
  const preview = previews.value[kind]
  if (preview) delete preview[interaction]
}

const KIND_FILL: Record<DashboardKpiKind, string> = {
  income: 'bg-income',
  expense: 'bg-expense',
  investment: 'bg-invest',
}
const SPLIT_FILL = { expense: 'bg-expense', investment: 'bg-invest', unspent: 'bg-income/30' }
const CHIP: Record<DashboardTone, string> = {
  good: 'bg-gain/10 text-gain',
  bad: 'bg-loss/10 text-loss',
  neutral: 'bg-subtle text-text-muted',
}
const ARROW: Record<DashboardTrend, string> = {
  up: 'M6 10V2M2.5 5.5L6 2l3.5 3.5',
  down: 'M6 2v8M2.5 6.5L6 10l3.5-3.5',
  flat: 'M2.5 6h7',
}
const TREND_WORD: Record<DashboardTrend, string> = { up: 'sube', down: 'baja', flat: 'igual' }

function changeText(kpi: DashboardKpi): string {
  if (!kpi.change) return ''
  return kpi.change.trend === 'flat'
    ? 'sin cambios frente al mes anterior'
    : `${TREND_WORD[kpi.change.trend]} ${kpi.change.label} frente al mes anterior`
}
</script>

<template>
  <section
    class="border-line bg-panel grid rounded-lg border"
    aria-labelledby="dashboard-month-title"
    data-month-card
  >
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pt-5 sm:px-7">
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3
          id="dashboard-month-title"
          class="font-display text-text-main text-xl font-bold tracking-tight"
        >
          {{ monthName }}
        </h3>
        <p class="text-text-muted font-mono text-xs tracking-widest uppercase">{{ status }}</p>
      </div>
      <div class="flex gap-2">
        <BaseSelect id="dashboard-month" v-model="month" label="Mes" hide-label :options="months" />
        <BaseSelect
          id="year-display"
          v-model="year"
          label="Año"
          hide-label
          :disabled="years.length <= 1"
          :options="years.map((value) => ({ value, label: String(value) }))"
        />
      </div>
    </header>

    <div class="grid py-5 md:grid-cols-3">
      <article
        v-for="kpi in figures"
        :key="kpi.kind"
        class="border-line grid content-start gap-3.5 border-t px-4 py-4 first:border-t-0 sm:px-7 md:border-t-0 md:border-l md:py-0 md:first:border-l-0"
        :aria-label="`${kpi.label}: ${kpi.previewValue}${kpi.change ? `, ${changeText(kpi)}` : ''}`"
        :data-kpi="kpi.kind"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-text-main flex items-center gap-2 text-sm font-semibold">
            <span class="size-2 rounded-xs" :class="KIND_FILL[kpi.kind]" aria-hidden="true"></span>
            {{ kpi.label }}
          </span>
          <span
            v-if="kpi.change"
            class="font-display inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums"
            :class="CHIP[kpi.change.tone]"
            :data-tone="kpi.change.tone"
            data-kpi-change
          >
            <svg
              class="size-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="ARROW[kpi.change.trend]" />
            </svg>
            {{ kpi.change.label }}
          </span>
        </div>
        <div class="flex items-end justify-between gap-4">
          <div class="grid min-w-0 gap-1.5">
            <strong
              :id="`kpi-${kpi.kind}`"
              class="font-display text-text-main text-3xl leading-none font-medium tracking-tight tabular-nums"
            >
              <span :key="kpi.previewValue" class="kpi-value inline-block">{{
                kpi.previewValue
              }}</span>
            </strong>
            <span v-if="kpi.previous" class="text-text-muted text-sm tabular-nums">
              {{ kpi.previous }}
            </span>
          </div>
          <div
            class="flex h-14 shrink-0 items-end gap-1"
            role="group"
            :aria-label="`Historial mensual de ${kpi.label.toLowerCase()}`"
          >
            <button
              v-for="(bar, index) in kpi.bars"
              :key="bar.month"
              type="button"
              class="kpi-bar text-text-main relative flex h-full w-2 cursor-pointer items-end rounded-xs p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              :aria-label="`${kpi.label}, ${bar.month}: ${bar.value}`"
              @mousemove="previewBar(kpi.kind, 'hover', index)"
              @mouseleave="endPreview(kpi.kind, 'hover')"
              @focus="previewBar(kpi.kind, 'focus', index)"
              @blur="endPreview(kpi.kind, 'focus')"
            >
              <span
                :key="`${year}-${month}`"
                class="kpi-bar-fill block min-h-1 w-full rounded-xs"
                :class="[KIND_FILL[kpi.kind], { 'opacity-30': !bar.current }]"
                :style="{ blockSize: `${bar.height}%`, '--bar-index': index }"
                aria-hidden="true"
              ></span>
            </button>
          </div>
        </div>
      </article>
    </div>

    <div
      v-if="split"
      class="border-line grid items-center gap-x-7 gap-y-3 border-t px-4 py-4 sm:px-7 md:grid-cols-[13rem_minmax(0,1fr)]"
      data-income-split
    >
      <p class="grid gap-0.5">
        <span class="text-text-muted text-sm">De cada 100 € que entraron</span>
        <span class="font-display text-text-main font-semibold tabular-nums">
          te quedan {{ split.keptPer100 }}
        </span>
      </p>
      <div class="grid gap-2.5">
        <div
          class="flex h-3 gap-0.5 overflow-hidden rounded-full"
          role="img"
          :aria-label="`Reparto de los ingresos: ${split.segments.map((s) => `${s.label.toLowerCase()} ${s.share}`).join(', ')}`"
        >
          <span
            v-for="segment in split.segments"
            :key="segment.key"
            :class="SPLIT_FILL[segment.key]"
            :style="{ width: `${segment.weight}%` }"
          ></span>
        </div>
        <ul class="text-text-muted flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <li
            v-for="segment in split.segments"
            :key="segment.key"
            class="flex items-center gap-1.5"
          >
            <span
              class="size-2 rounded-xs"
              :class="SPLIT_FILL[segment.key]"
              aria-hidden="true"
            ></span>
            {{ segment.label }}
            <span class="font-display text-text-main tabular-nums">
              {{ segment.share
              }}<template v-if="segment.key === 'unspent'"> · {{ split.unspent }}</template>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.kpi-bar::after {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline: -25%;
}

.kpi-bar:is(:focus-visible, :active) > span {
  opacity: 1;
}

@media (hover: hover) and (pointer: fine) {
  .kpi-bar:hover > span {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .kpi-bar-fill {
    transform-origin: center bottom;
    animation: kpi-bar-reveal 220ms var(--ease-out) both;
    animation-delay: calc(var(--bar-index) * 10ms);
    transition:
      opacity 140ms var(--ease-out),
      block-size 220ms var(--ease-out);
  }

  .kpi-value {
    animation: kpi-value-reveal 140ms var(--ease-out);
  }

  @keyframes kpi-bar-reveal {
    from {
      transform: scaleY(0);
    }
    to {
      transform: scaleY(1);
    }
  }

  @keyframes kpi-value-reveal {
    from {
      opacity: 0.6;
      translate: 0 0.08em;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }
}
</style>
