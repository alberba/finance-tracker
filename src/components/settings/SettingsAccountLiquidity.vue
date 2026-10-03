<script setup lang="ts">
import { computed } from 'vue'

import BaseSelect from '../ui/BaseSelect.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import { buildAccountRows } from '../../domain/settings/view-model'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSettingsStore } from '../../stores/settings'
import { useStockEventsStore } from '../../stores/stockevents'

// The "Cartera" section of an account's card: whether its cash counts as
// portfolio liquidity for TWR and, if so, the Stock Events list that books the
// cash of its contributions. Both apply at once.
const props = defineProps<{ accountId: string }>()

const financialStateStore = useFinancialStateStore()
const settingsStore = useSettingsStore()
const stockEventsStore = useStockEventsStore()

const row = computed(() =>
  buildAccountRows(financialStateStore.state).find((item) => item.id === props.accountId),
)

const liquidity = computed({
  get: () => row.value?.twrLiquidity ?? false,
  set: (value: boolean) => settingsStore.toggleTwrLiquidity(props.accountId, value),
})

const cashWatchlist = computed({
  get: () => row.value?.cashWatchlistId ?? '',
  set: (value: string) => stockEventsStore.updateCashMapping(props.accountId, value),
})

const watchlistOptions = computed(() => [
  { value: '', label: 'No sincronizar efectivo' },
  ...stockEventsStore.watchlists.map((list) => ({ value: list.id, label: list.name })),
])

const hint = computed(() => {
  if (!liquidity.value) {
    return 'Solo las cuentas de liquidez de la cartera llevan su efectivo a Stock Events.'
  }
  return stockEventsStore.watchlists.length
    ? 'Donde Stock Events registra el efectivo de los aportes desde esta cuenta.'
    : 'Conecta Stock Events en Preferencias para elegir la lista.'
})
</script>

<template>
  <fieldset v-if="row" class="border-line grid gap-4 border-t pt-6" data-account-liquidity>
    <legend
      class="text-text-muted float-left mb-3 w-full text-xs font-bold tracking-widest uppercase"
    >
      Cartera
    </legend>
    <div class="flex items-center justify-between gap-4">
      <p class="grid gap-0.5">
        <span class="font-semibold">Su efectivo es liquidez de la cartera</span>
        <span class="text-text-muted text-sm">Cuenta en el cálculo de rentabilidad TWR.</span>
      </p>
      <ToggleSwitch v-model="liquidity" :label="`${row.name} es liquidez de la cartera`" />
    </div>
    <BaseSelect
      v-model="cashWatchlist"
      label="Lista de efectivo en Stock Events"
      :options="watchlistOptions"
      :disabled="!liquidity || !stockEventsStore.watchlists.length"
    />
    <p class="text-text-muted text-sm">{{ hint }}</p>
  </fieldset>
</template>
