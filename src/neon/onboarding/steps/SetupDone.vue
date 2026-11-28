<script setup lang="ts">
import { computed } from 'vue'

import { useSetup } from '../../../composables/useSetup'
import { useFinancialStateStore } from '../../../stores/financial-state'
import NeonButton from '../../ui/NeonButton.vue'

// «Listo»: what the wizard left ready. Without an account (a restored copy
// that had none) the app can't register anything yet, so it asks for one.
const financial = useFinancialStateStore()
const setup = useSetup()

const lines = computed(() => {
  const { state } = financial
  const count = (n: number, one: string, many: string, none = 'Ninguno') =>
    n === 0 ? none : `${n} ${n === 1 ? one : many}`
  return [
    { label: 'Moneda', value: financial.currency || 'EUR' },
    { label: 'Cuentas', value: count(state.accounts.length, 'cuenta', 'cuentas', 'Ninguna') },
    { label: 'Fijos', value: count(state.recurringRules.length, 'fijo', 'fijos') },
    {
      label: 'Inversiones',
      value: state.stockEvents.enabled
        ? 'Stock Events'
        : count(state.investmentAssets.length, 'inversión', 'inversiones', 'Ninguna'),
    },
    {
      label: 'Categorías',
      value: count(
        state.incomeCategories.length + state.expenseCategories.length,
        'categoría',
        'categorías',
        'Ninguna',
      ),
    },
  ]
})
</script>

<template>
  <div class="grid gap-4">
    <dl
      class="bg-panel border-line rounded-card frame:px-7 divide-line grid divide-y border px-4 py-1"
    >
      <div
        v-for="line in lines"
        :key="line.label"
        class="flex min-h-15 items-center justify-between gap-4"
      >
        <dt class="text-soft text-[16px] font-bold">{{ line.label }}</dt>
        <dd class="font-display text-[16px] font-semibold tabular-nums">{{ line.value }}</dd>
      </div>
    </dl>
    <div v-if="financial.accounts.length === 0" class="grid justify-items-start gap-2">
      <p class="text-muted text-note">Para empezar a apuntar hace falta al menos una cuenta.</p>
      <NeonButton @click="setup.go(2)">Crear una cuenta</NeonButton>
    </div>
  </div>
</template>
