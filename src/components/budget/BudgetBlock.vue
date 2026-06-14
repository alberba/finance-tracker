<script setup lang="ts">
import type { BudgetBlockViewModel } from '../../domain/budget/view-model'
import type { BudgetType } from '../../scripts/types'

defineProps<{
  block: BudgetBlockViewModel
  months: readonly string[]
  formatMoney: (value: number) => string
}>()

const emit = defineEmits<{
  updateBudgetValue: [payload: { type: BudgetType; category: string; month: number; value: number }]
}>()

function handleInput(type: BudgetType, category: string, month: number, event: Event): void {
  const target = event.target
  const value = target instanceof HTMLInputElement ? Number(target.value || 0) : 0
  emit('updateBudgetValue', { type, category, month, value })
}

function toneClass(tone: 'good' | 'bad'): string {
  return tone === 'good' ? 'text-(--income)' : 'text-(--expense)'
}

const headCellClass =
  'sticky top-0 z-[1] border-b border-(--line) bg-(--bg-subtle) px-[13px] py-[11px] align-top text-[0.66rem] font-bold tracking-[0.1em] text-text-muted uppercase'

const rowHeadClass =
  'min-w-[180px] border-b border-(--line) bg-(--bg-subtle) px-[13px] py-[11px] text-left align-top'
</script>

<template>
  <article
    class="grid min-w-0 gap-[14px] rounded-(--radius-lg) border border-(--line) bg-(--bg-panel) p-[22px] shadow-(--shadow-soft) [overflow-x:clip]"
    :data-budget-type="block.type"
  >
    <header class="flex items-start justify-between gap-4">
      <div>
        <h3 class="text-[1.05rem]">{{ block.title }}</h3>
        <p class="mt-1 max-w-[56ch] text-[0.875rem] text-text-muted">{{ block.description }}</p>
      </div>
      <dl class="m-0 grid grid-cols-[repeat(3,minmax(110px,1fr))] gap-[11px]">
        <div class="rounded-(--radius-md) border border-(--line) bg-(--bg-subtle) px-[15px] py-[13px]">
          <dt class="text-[0.66rem] font-bold tracking-[0.1em] text-text-muted uppercase">
            Presupuestado
          </dt>
          <dd class="mt-[7px] font-mono text-[1.22rem] font-medium tracking-[-0.02em] tabular-nums">
            {{ formatMoney(block.plannedTotal) }}
          </dd>
        </div>
        <div class="rounded-(--radius-md) border border-(--line) bg-(--bg-subtle) px-[15px] py-[13px]">
          <dt class="text-[0.66rem] font-bold tracking-[0.1em] text-text-muted uppercase">
            Real
          </dt>
          <dd class="mt-[7px] font-mono text-[1.22rem] font-medium tracking-[-0.02em] tabular-nums">
            {{ formatMoney(block.actualTotal) }}
          </dd>
        </div>
        <div class="rounded-(--radius-md) border border-(--line) bg-(--bg-subtle) px-[15px] py-[13px]">
          <dt class="text-[0.66rem] font-bold tracking-[0.1em] text-text-muted uppercase">
            Diferencia
          </dt>
          <dd
            class="mt-[7px] font-mono text-[1.22rem] font-medium tracking-[-0.02em] tabular-nums"
            :class="toneClass(block.diffTone)"
          >
            {{ formatMoney(block.diffTotal) }}
          </dd>
        </div>
      </dl>
    </header>

    <p v-if="!block.rows.length" class="text-text-muted">No hay categorías para este bloque.</p>

    <div
      v-else
      class="w-full max-w-full min-w-0 overflow-auto rounded-(--radius-md) border border-(--line) bg-(--bg-panel)"
    >
      <table class="w-full min-w-[1220px] border-collapse">
        <thead>
          <tr>
            <th :class="headCellClass">Categoría</th>
            <th v-for="month in months" :key="month" :class="headCellClass">
              {{ month.slice(0, 3) }}
            </th>
            <th :class="headCellClass">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in block.rows" :key="row.category">
            <th scope="row" :class="rowHeadClass">{{ row.label }}</th>
            <td
              v-for="cell in row.cells"
              :key="cell.month"
              class="min-w-[110px] border-b border-(--line) px-[13px] py-[11px] align-top"
            >
              <label class="block">
                <span class="sr-only">{{ cell.monthLabel }} para {{ row.category }}</span>
                <input
                  type="number"
                  autocomplete="off"
                  step="0.01"
                  min="0"
                  class="w-full min-h-0 rounded-(--radius-sm) px-[10px] py-2 font-mono text-[0.875rem] font-medium tabular-nums"
                  :name="`budget-${block.type}-${row.category}-${cell.month}`"
                  :data-category="row.category"
                  :data-type="block.type"
                  :data-month="cell.month"
                  :value="cell.planned"
                  :aria-label="`Presupuesto ${cell.monthLabel} para ${row.category}`"
                  @input="handleInput(block.type, row.category, cell.month, $event)"
                />
              </label>
              <div class="mt-1 grid gap-0.5 text-[0.72rem]">
                <span class="text-text-muted">{{ formatMoney(cell.actual) }}</span>
                <span :class="toneClass(cell.diffTone)">{{ formatMoney(cell.diff) }}</span>
              </div>
            </td>
            <td class="min-w-[110px] border-b border-(--line) px-[13px] py-[11px] align-top">
              <strong>{{ formatMoney(row.plannedTotal) }}</strong>
              <div class="mt-1 grid gap-0.5 text-[0.72rem]">
                <span class="text-text-muted">{{ formatMoney(row.actualTotal) }}</span>
                <span :class="toneClass(row.diffTone)">{{ formatMoney(row.diffTotal) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
