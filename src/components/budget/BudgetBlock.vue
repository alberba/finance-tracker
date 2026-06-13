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
</script>

<template>
  <article class="budget-block" :data-budget-type="block.type">
    <header class="budget-block-head">
      <div>
        <h3>{{ block.title }}</h3>
        <p>{{ block.description }}</p>
      </div>
      <dl class="budget-block-totals">
        <div>
          <dt>Presupuestado</dt>
          <dd>{{ formatMoney(block.plannedTotal) }}</dd>
        </div>
        <div>
          <dt>Real</dt>
          <dd>{{ formatMoney(block.actualTotal) }}</dd>
        </div>
        <div>
          <dt>Diferencia</dt>
          <dd :class="`text-${block.diffTone}`">{{ formatMoney(block.diffTotal) }}</dd>
        </div>
      </dl>
    </header>

    <p v-if="!block.rows.length" class="budget-empty">No hay categorías para este bloque.</p>

    <div v-else class="table-wrap budget-table-wrap">
      <table class="budget-table">
        <thead>
          <tr>
            <th>Categoría</th>
            <th v-for="month in months" :key="month">{{ month.slice(0, 3) }}</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in block.rows" :key="row.category">
            <th scope="row">{{ row.label }}</th>
            <td v-for="cell in row.cells" :key="cell.month" class="budget-month-cell">
              <label class="budget-cell-input">
                <span class="sr-only">{{ cell.monthLabel }} para {{ row.category }}</span>
                <input
                  type="number"
                  autocomplete="off"
                  step="0.01"
                  min="0"
                  :name="`budget-${block.type}-${row.category}-${cell.month}`"
                  :data-category="row.category"
                  :data-type="block.type"
                  :data-month="cell.month"
                  :value="cell.planned"
                  :aria-label="`Presupuesto ${cell.monthLabel} para ${row.category}`"
                  @input="handleInput(block.type, row.category, cell.month, $event)"
                />
              </label>
              <div class="budget-cell-meta">
                <span class="budget-cell-actual">{{ formatMoney(cell.actual) }}</span>
                <span :class="`text-${cell.diffTone}`">{{ formatMoney(cell.diff) }}</span>
              </div>
            </td>
            <td class="budget-total-cell">
              <strong>{{ formatMoney(row.plannedTotal) }}</strong>
              <div class="budget-cell-meta">
                <span class="budget-cell-actual">{{ formatMoney(row.actualTotal) }}</span>
                <span :class="`text-${row.diffTone}`">{{ formatMoney(row.diffTotal) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
