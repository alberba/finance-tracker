<script setup lang="ts">
import { ref } from 'vue'

import type { Month } from '../../../lib/month'
import type { BudgetType } from '../../../scripts/types'
import NeonBudgetPlanEditor from './NeonBudgetPlanEditor.vue'
import NeonBudgetYearBar from './NeonBudgetYearBar.vue'
import {
  gridAria,
  gridLegend,
  saveLabel,
  shortMonth,
  signed,
  whole,
  type Grid,
  type GridCell,
  type YearView,
} from './year-view-model'

// The categories × months grid of «El año» (year or quarter): per cell what
// was recorded and, under it, the plan, which a click turns into a field.
defineProps<{ type: BudgetType; view: Exclude<YearView, 'month'>; grid: Grid }>()
const emit = defineEmits<{
  plan: [category: string]
  update: [category: string, month: Month, value: number]
}>()

const editing = ref<string | null>(null)

function keyOf(category: string, month: Month): string {
  return `${category}|${month}`
}

function save(category: string, cell: GridCell, value: number): void {
  editing.value = null
  emit('update', category, cell.month, value)
}

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss' } as const

function figureClass(tone: 'gain' | 'loss' | null, actual: number | null): string {
  if (actual === null) return 'text-muted'
  return tone ? TONE_TEXT[tone] : 'text-text'
}
</script>

<template>
  <section
    :aria-label="gridAria(type)"
    class="bg-panel border-line rounded-card grid min-w-0 gap-4 border px-3 py-4 @min-[720px]:px-6 @min-[720px]:py-[22px]"
    data-budget-grid
  >
    <p class="text-muted text-[14px]">{{ gridLegend(type, view) }}</p>
    <!-- Narrow: one block per category; the year's twelve months are edited in its plan sheet. -->
    <ul class="@min-[720px]:hidden" :aria-label="gridAria(type)">
      <li
        v-for="row in grid.rows"
        :key="row.category"
        class="border-line grid min-w-0 gap-2 border-t py-1.5"
      >
        <div class="flex min-w-0 items-center justify-between gap-3">
          <button
            type="button"
            class="text-text outline-accent flex min-h-11 min-w-11 items-center gap-1.5 text-left text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            :aria-label="`Plan de ${row.category} para el año`"
            @click="emit('plan', row.category)"
          >
            <span class="truncate">{{ row.category }}</span>
            <svg
              class="text-faint size-3.5 shrink-0"
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
          <span class="flex flex-none items-baseline gap-2">
            <span
              class="font-display text-[16px] font-bold tabular-nums"
              :class="figureClass(row.total.tone, row.total.actual)"
              >{{ row.total.actual === null ? '—' : whole(row.total.actual) }}</span
            >
            <span class="text-muted text-[14px] font-semibold whitespace-nowrap"
              >de {{ whole(row.total.planDone) }}</span
            >
          </span>
        </div>
        <ul v-if="view === 'quarter'" class="grid grid-cols-3 gap-2">
          <li
            v-for="cell in row.cells"
            :key="cell.month"
            class="grid min-w-0 content-start justify-items-start gap-1 rounded-[14px] px-2 py-1.5"
            :class="cell.current ? 'bg-panel2' : ''"
          >
            <span class="text-muted text-label tracking-label font-extrabold uppercase">{{
              shortMonth(cell.month)
            }}</span>
            <span
              class="font-display text-[16px] leading-[1.2] font-semibold tabular-nums"
              :class="figureClass(cell.tone, cell.actual)"
              >{{ cell.actual === null ? '—' : whole(cell.actual) }}</span
            >
            <NeonBudgetPlanEditor
              v-if="editing === keyOf(row.category, cell.month)"
              :plan="cell.plan"
              :label="cell.editLabel"
              :save-label="saveLabel(row.category, cell.month)"
              @save="(value) => save(row.category, cell, value)"
              @cancel="editing = null"
            />
            <button
              v-else
              type="button"
              class="text-muted outline-accent min-h-8 cursor-text text-[14px] font-semibold whitespace-nowrap underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              :aria-label="cell.editLabel"
              @click="editing = keyOf(row.category, cell.month)"
            >
              de {{ whole(cell.plan) }}
            </button>
            <NeonBudgetYearBar
              class="w-full"
              :bar="cell.bar"
              :excess="type === 'income' ? 'gain' : 'loss'"
            />
          </li>
        </ul>
      </li>
      <li class="border-grid flex min-h-11 items-center justify-between gap-3 border-t">
        <span class="text-[16px] font-extrabold">Total</span>
        <span class="flex flex-none items-baseline gap-2">
          <span
            class="font-display text-[16px] font-bold tabular-nums"
            :class="figureClass(grid.total.tone, grid.total.actual)"
            >{{ grid.total.actual === null ? '—' : whole(grid.total.actual) }}</span
          >
          <span class="text-muted text-[14px] font-semibold whitespace-nowrap"
            >de {{ whole(grid.total.planDone) }}</span
          >
        </span>
      </li>
    </ul>
    <div class="overflow-x-auto @max-[719px]:hidden">
      <table
        class="w-full table-fixed border-collapse text-left"
        :class="view === 'year' ? 'min-w-[1180px]' : 'min-w-[720px]'"
      >
        <colgroup>
          <col class="w-[230px]" />
          <col v-for="month in grid.months" :key="month" />
          <col :class="view === 'year' ? 'w-[140px]' : 'w-[190px]'" />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              class="text-soft text-label tracking-label px-2 ps-0 pb-3 text-left font-extrabold uppercase"
            >
              Categoría
            </th>
            <th
              v-for="total in grid.monthTotals"
              :key="total.month"
              scope="col"
              class="text-label tracking-label px-2 pb-3 text-right font-extrabold uppercase"
              :class="total.current ? 'bg-panel2 text-text' : 'text-soft'"
            >
              {{ shortMonth(total.month) }}
              <span
                v-if="view === 'quarter'"
                class="text-muted text-label block font-semibold tracking-normal normal-case"
                >{{ grid.statuses[total.month] }}</span
              >
            </th>
            <th
              scope="col"
              class="text-soft text-label tracking-label px-2 pb-3 text-right font-extrabold uppercase"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in grid.rows" :key="row.category" class="border-line border-t">
            <th scope="row" class="py-3.5 ps-0 pe-3 text-left font-bold">
              <button
                type="button"
                class="text-text outline-accent flex min-h-10 min-w-0 items-center gap-1.5 text-left text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11"
                :aria-label="`Plan de ${row.category} para el año`"
                @click="emit('plan', row.category)"
              >
                <span class="truncate">{{ row.category }}</span>
                <svg
                  class="text-faint size-3.5 shrink-0"
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
            </th>
            <td
              v-for="cell in row.cells"
              :key="cell.month"
              :title="cell.title"
              class="px-2 py-3 align-top"
              :class="cell.current ? 'bg-panel2' : ''"
            >
              <div
                class="flex min-w-0 flex-wrap gap-x-2.5 gap-y-1"
                :class="
                  view === 'quarter'
                    ? 'items-baseline justify-between'
                    : 'flex-col items-end justify-center'
                "
              >
                <span
                  class="font-display text-[16px] leading-[1.2] font-semibold tabular-nums"
                  :class="figureClass(cell.tone, cell.actual)"
                  >{{ cell.actual === null ? '—' : whole(cell.actual) }}</span
                >
                <NeonBudgetPlanEditor
                  v-if="editing === keyOf(row.category, cell.month)"
                  :plan="cell.plan"
                  :label="cell.editLabel"
                  :save-label="saveLabel(row.category, cell.month)"
                  @save="(value) => save(row.category, cell, value)"
                  @cancel="editing = null"
                />
                <button
                  v-else
                  type="button"
                  class="text-muted outline-accent min-h-8 cursor-text text-[14px] font-semibold whitespace-nowrap underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  :aria-label="cell.editLabel"
                  @click="editing = keyOf(row.category, cell.month)"
                >
                  de {{ whole(cell.plan) }}
                </button>
                <NeonBudgetYearBar
                  v-if="view === 'quarter'"
                  class="basis-full"
                  :bar="cell.bar"
                  :excess="type === 'income' ? 'gain' : 'loss'"
                />
              </div>
            </td>
            <td class="px-2 py-3 align-top">
              <div class="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2.5 gap-y-1">
                <span
                  class="font-display text-[16px] leading-[1.2] font-bold tabular-nums"
                  :class="figureClass(row.total.tone, row.total.actual)"
                  :title="
                    row.total.actual === null
                      ? undefined
                      : signed(row.total.actual - row.total.planDone)
                  "
                  >{{ row.total.actual === null ? '—' : whole(row.total.actual) }}</span
                >
                <span class="text-muted text-[14px] font-semibold whitespace-nowrap"
                  >de {{ whole(row.total.planDone) }}</span
                >
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-grid bg-panel border-t">
            <th scope="row" class="py-3.5 ps-0 pe-3 text-left text-[16px] font-extrabold">Total</th>
            <td
              v-for="total in grid.monthTotals"
              :key="total.month"
              class="px-2 py-3 align-top"
              :class="total.current ? 'bg-panel2' : ''"
            >
              <div class="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2.5 gap-y-1">
                <span
                  class="font-display text-[16px] leading-[1.2] font-bold tabular-nums"
                  :class="figureClass(total.tone, total.actual)"
                  >{{ total.actual === null ? '—' : whole(total.actual) }}</span
                >
                <span class="text-muted text-[14px] font-semibold whitespace-nowrap"
                  >de {{ whole(total.planAll) }}</span
                >
              </div>
            </td>
            <td class="px-2 py-3 align-top">
              <div class="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2.5 gap-y-1">
                <span
                  class="font-display text-[16px] leading-[1.2] font-bold tabular-nums"
                  :class="figureClass(grid.total.tone, grid.total.actual)"
                  >{{ grid.total.actual === null ? '—' : whole(grid.total.actual) }}</span
                >
                <span class="text-muted text-[14px] font-semibold whitespace-nowrap"
                  >de {{ whole(grid.total.planDone) }}</span
                >
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>
