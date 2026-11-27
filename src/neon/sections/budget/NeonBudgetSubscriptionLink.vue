<script setup lang="ts">
import { computed } from 'vue'

import { useSectionNavigation } from '../../../composables/useSectionNavigation'
import { projectSubscriptionCharges } from '../../../domain/subscriptions/analysis'
import { formatMoney, formatMonthName } from '../../../lib/format'
import type { Month } from '../../../lib/month'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useUiStore } from '../../../stores/ui'

const props = defineProps<{ year: number; month: Month }>()
const financialState = useFinancialStateStore()
const ui = useUiStore().ui
const { navigateTo } = useSectionNavigation()

const monthName = computed(() => formatMonthName(props.month).toLowerCase())
const expected = computed(() => {
  const { year, month } = props
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const active = financialState.subscriptions.filter((subscription) => subscription.active)
  const charges = projectSubscriptionCharges(active, start, end)
  return formatMoney(
    charges.reduce((sum, charge) => sum + charge.amount, 0),
    financialState.currency,
  )
})

function openSubscriptions(): void {
  ui.txTab = 'subscriptions'
  navigateTo('transactions')
}
</script>

<template>
  <button
    type="button"
    class="bg-panel border-line rounded-card outline-accent pointer-fine:hover:bg-panel2 flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 border px-4 py-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.99]"
    @click="openSubscriptions"
  >
    <span class="grid gap-0.5">
      <span class="text-[15px] font-extrabold">Ver suscripciones</span>
      <span class="text-muted text-[13px] font-bold">Cobros previstos en {{ monthName }}</span>
    </span>
    <span
      class="font-display inline-flex items-baseline gap-[0.5em] text-[15px] font-semibold tabular-nums"
    >
      {{ expected }}
      <svg
        class="text-muted h-[1cap] w-auto flex-none self-center"
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
  </button>
</template>
