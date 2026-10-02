<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { decorateCategoryLabel } from '../../scripts/category-emoji'
import type { TransactionType } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'

const movementsStore = useMovementsStore()
const { breakdown, categoryEmojis } = storeToRefs(movementsStore)
const { formatMoney } = useMoneyFormatter()

const sections = computed(() => [
  { type: 'income' as TransactionType, label: 'INGRESOS', cssClass: 'income', rows: breakdown.value.byType.income },
  { type: 'expense' as TransactionType, label: 'GASTOS', cssClass: 'expense', rows: breakdown.value.byType.expense },
  {
    type: 'investment' as TransactionType,
    label: 'INVERSIONES',
    cssClass: 'investment',
    rows: breakdown.value.byType.investment,
  },
])
</script>

<template>
  <aside class="tx-summary-side" aria-label="Resumen de movimientos">
    <article class="tx-summary-card">
      <table class="tx-summary-table tx-summary-table--totals">
        <thead>
          <tr>
            <th colspan="3" class="tx-summary-title">TOTAL</th>
          </tr>
          <tr>
            <th class="tx-summary-heading tx-summary-heading--income">INGRESOS</th>
            <th class="tx-summary-heading tx-summary-heading--expense">GASTOS</th>
            <th class="tx-summary-heading tx-summary-heading--investment">INVERSIÓN</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td id="tx-total-income" class="tx-summary-total-value">
              {{ formatMoney(breakdown.totals.income) }}
            </td>
            <td id="tx-total-expense" class="tx-summary-total-value">
              {{ formatMoney(breakdown.totals.expense) }}
            </td>
            <td id="tx-total-investment" class="tx-summary-total-value">
              {{ formatMoney(breakdown.totals.investment) }}
            </td>
          </tr>
        </tbody>
      </table>
    </article>

    <article class="tx-summary-card">
      <table class="tx-summary-table tx-summary-table--breakdown">
        <thead>
          <tr>
            <th class="tx-summary-title">DESGLOSE POR CATEGORÍAS</th>
          </tr>
        </thead>
        <tbody id="tx-category-breakdown-body">
          <template v-for="section in sections" :key="section.type">
            <tr>
              <td
                class="tx-summary-group-title tx-summary-heading"
                :class="`tx-summary-heading--${section.cssClass}`"
              >
                {{ section.label }}
              </td>
            </tr>
            <tr v-if="!section.rows.length">
              <td class="tx-summary-empty">Sin movimientos</td>
            </tr>
            <tr
              v-for="row in section.rows"
              v-else
              :key="`${section.type}-${row.category}`"
              :data-summary-type="section.type"
              :data-summary-category="row.category"
            >
              <td>
                <div class="tx-summary-item">
                  <span>{{ decorateCategoryLabel(section.type, row.category, categoryEmojis) }}</span>
                  <strong>{{ formatMoney(row.amount) }}</strong>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </article>
  </aside>
</template>
