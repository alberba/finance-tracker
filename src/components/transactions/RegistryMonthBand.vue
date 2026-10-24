<script setup lang="ts">
import { computed } from 'vue'

import IconButton from '../ui/IconButton.vue'
import InkBand from '../ui/InkBand.vue'
import KickerLabel from '../ui/KickerLabel.vue'
import { toneOf } from '../ui/tone'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { formatMonthYear } from '../../lib/format'
import { useMovementsStore } from '../../stores/movements'
import { useRecurringStore } from '../../stores/recurring'
import { useUiStore } from '../../stores/ui'

// The month's net in the ink band, with arrows to move between months.
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()
const ui = useUiStore().ui
const { formatMoney, formatSignedMoney } = useMoneyFormatter()

const monthTitle = computed(() => formatMonthYear(ui.txFilterMonth, ui.txYear).toLowerCase())
const totals = computed(() => movementsStore.bandTotals)
const facts = computed(() => [
  { label: 'Ingresos', value: formatMoney(totals.value.income), valueId: 'tx-total-income' },
  { label: 'Gastos', value: formatMoney(totals.value.expense), valueId: 'tx-total-expense' },
  { label: 'Ahorrado', value: formatMoney(totals.value.saving), valueId: 'tx-total-saving' },
  {
    label: 'Invertido',
    value: formatMoney(totals.value.investment),
    valueId: 'tx-total-investment',
  },
])
const pendingNote = computed(() => {
  const count = recurringStore.pendingCount
  if (!count) return ''
  return count === 1 ? ' · no incluye el pendiente' : ` · no incluye los ${count} pendientes`
})
</script>

<template>
  <InkBand
    :label="`Neto de ${monthTitle}`"
    :aria-label="`Neto de ${monthTitle}`"
    :value="formatSignedMoney(totals.net)"
    value-id="tx-month-net"
    :value-tone="totals.net === 0 ? undefined : toneOf(totals.net)"
    :facts="facts"
  >
    <template #label>
      <div class="-my-2 -ml-3 flex items-center gap-1">
        <IconButton
          icon="chevron-left"
          tone="ink"
          label="Mes anterior"
          @click="movementsStore.stepMonth(-1)"
        />
        <KickerLabel id="tx-month-title" tone="ink" as="h3">Neto de {{ monthTitle }}</KickerLabel>
        <IconButton
          icon="chevron-right"
          tone="ink"
          label="Mes siguiente"
          :disabled="movementsStore.isLatestMonth"
          @click="movementsStore.stepMonth(1)"
        />
      </div>
    </template>
    <template #note>
      <p class="text-ink-muted text-sm">
        Ingresos menos gastos e inversión; el ahorro no resta{{ pendingNote }}
      </p>
    </template>
  </InkBand>
</template>
