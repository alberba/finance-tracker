<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'

import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import type { Month } from '../../../lib/month'
import { formatMonthName } from '../../../lib/format'
import { MONTH_INITIALS, type CategoryDetail } from './month-view-model'

// One expense category month by month: the bars are the whole detail, one per
// month against the current budget (dashed, with its amount at the end), and
// the chosen month (the newest when it opens) written above them with how far
// it is from its budget. Pointer, finger or arrow keys move along the months;
// the figure changes in its place. Under the bars, only what they can't say:
// the monthly average and the year so far. The desktop shows it in a popover
// beside the category's row, the phone in a bottom sheet.
const props = withDefaults(
  defineProps<{
    detail: CategoryDetail
    year: number
    /** Height of the bars, px. */ barsHeight?: number
  }>(),
  { barsHeight: 220 },
)

const { formatMoney } = useMoneyFormatter()
const chartEl = useTemplateRef<HTMLElement>('chartEl')

const BAR_CLASS = {
  over: 'bg-loss',
  current: 'bg-accent',
  normal: 'bg-neutral-bar',
  empty: 'opacity-0',
} as const

const months = computed(() => props.detail.rows.map((row) => row.month).reverse())
const selected = ref<Month | null>(null)
// Another category starts at its newest month.
watch(
  () => props.detail.category,
  () => (selected.value = months.value.at(-1) ?? null),
  { immediate: true },
)
const row = computed(() => props.detail.rows.find((item) => item.month === selected.value))
const rowIsOver = computed(() => Boolean(row.value?.over || row.value?.dev.endsWith('por encima')))

function choose(month: Month): void {
  if (months.value.includes(month)) selected.value = month
}

// The whole chart is the target, so a finger needs no 44px bar: a press or a
// drag anywhere over it picks the month under it, as the pointer does.
function onPointer(event: PointerEvent): void {
  if (event.type === 'pointermove' && event.pointerType === 'touch' && !event.buttons) return
  const bars = chartEl.value?.querySelectorAll<HTMLElement>('[data-month]')
  if (!bars) return
  for (const bar of bars) {
    const { left, right } = bar.getBoundingClientRect()
    if (event.clientX < right + 3) {
      if (event.clientX >= left - 3) choose(Number(bar.dataset.month) as Month)
      return
    }
  }
}

/** Puts the focus on the chosen month's bar, for keyboards. */
function focusChosen(): void {
  chartEl.value
    ?.querySelector<HTMLElement>(`[data-month="${selected.value}"]`)
    ?.focus({ preventScroll: true })
}
defineExpose({ focusChosen })

function onKey(event: KeyboardEvent): void {
  const list = months.value
  const at = selected.value === null ? -1 : list.indexOf(selected.value)
  const next =
    event.key === 'ArrowRight' || event.key === 'ArrowUp'
      ? at + 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? at - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? list.length - 1
            : null
  if (next === null) return
  event.preventDefault()
  const month = list[Math.max(0, Math.min(list.length - 1, next))]
  if (month === undefined) return
  selected.value = month
  focusChosen()
}
</script>

<template>
  <div class="grid gap-5">
    <div v-if="row" class="grid gap-1" aria-live="polite" data-detail-month>
      <span class="text-muted text-[13px] font-bold">{{ row.name }}</span>
      <span
        :key="row.month"
        class="font-display text-figure-lg motion-safe:animate-swap font-semibold whitespace-nowrap tabular-nums"
      >
        {{ formatMoney(row.value) }}
      </span>
      <span
        :key="`dev-${row.month}`"
        class="motion-safe:animate-swap text-[14px] font-extrabold"
        :class="rowIsOver ? 'text-loss' : 'text-soft'"
      >
        {{ row.dev }}
      </span>
    </div>

    <div class="grid">
      <div
        ref="chartEl"
        role="radiogroup"
        :aria-label="`Gasto mensual de ${detail.category} en ${year}`"
        class="border-grid relative grid touch-none grid-cols-12 items-end gap-1.5 border-b pe-12"
        :style="{ blockSize: `${barsHeight}px` }"
        @keydown="onKey"
        @pointerdown="onPointer"
        @pointermove="onPointer"
      >
        <span
          class="border-faint pointer-events-none absolute inset-x-0 border-t border-dashed"
          :style="{ insetBlockEnd: `${detail.planLine}%` }"
          aria-hidden="true"
        >
          <span
            class="text-muted font-display bg-panel absolute inset-e-0 -translate-y-1/2 ps-1.5 text-[12px] font-semibold"
            style="inset-block-start: 0"
          >
            {{ formatMoney(detail.plan) }}
          </span>
        </span>
        <span
          v-for="bar in detail.bars"
          :key="bar.month"
          role="radio"
          class="outline-accent relative grid h-full cursor-pointer items-end rounded-t-[5px] focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-default"
          :aria-disabled="bar.kind === 'empty' || undefined"
          :aria-checked="bar.month === selected"
          :aria-label="`${formatMonthName(bar.month)}`"
          :tabindex="bar.month === selected ? 0 : -1"
          :data-month="bar.month"
          @focus="choose(bar.month)"
        >
          <span
            class="block min-h-0.5 rounded-t-[5px] transition-opacity duration-150"
            :class="[
              BAR_CLASS[bar.kind],
              selected !== null && bar.month !== selected && bar.kind !== 'empty'
                ? 'opacity-45'
                : '',
            ]"
            :style="{ height: `${bar.height}%` }"
          ></span>
        </span>
      </div>
      <div class="grid grid-cols-12 gap-1.5 pe-12 pt-1.5" aria-hidden="true">
        <span
          v-for="bar in detail.bars"
          :key="bar.month"
          class="text-center text-[11px] font-bold"
          :class="bar.month === selected ? 'text-text' : 'text-muted'"
        >
          {{ MONTH_INITIALS[bar.month - 1] }}
        </span>
      </div>
    </div>

    <dl class="border-line m-0 grid grid-cols-2 border-t pt-3">
      <div class="grid min-w-0 gap-0.5">
        <dt class="text-muted text-[13px]">Media al mes</dt>
        <dd
          class="font-display m-0 truncate text-[16px] font-semibold"
          :class="
            detail.average !== null && detail.average > detail.plan + 0.005 ? 'text-loss' : ''
          "
        >
          {{ detail.average === null ? '—' : formatMoney(detail.average) }}
        </dd>
      </div>
      <div class="border-line grid min-w-0 gap-0.5 border-s ps-3.5">
        <dt class="text-muted text-[13px]">En {{ year }}</dt>
        <dd class="font-display m-0 truncate text-[16px] font-semibold">
          {{ formatMoney(detail.yearToDate) }}
        </dd>
      </div>
    </dl>
  </div>
</template>
