<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import StatusDot from '../ui/StatusDot.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import type { StatusTone } from '../../domain/investment/quote-status'
import { useStockEventsStore, type StockEventsSymbolRow } from '../../stores/stockevents'

// How one symbol reaches Stock Events: whether it syncs, to which list and
// under which ticker, and what the last check found. Every change applies at
// once; the ticker when the field is left.
const props = defineProps<{
  row: StockEventsSymbolRow
  /** Offers hiding the symbol, for the ones no asset claims. */
  hideable?: boolean
}>()

const stockEventsStore = useStockEventsStore()

const sync = computed({
  get: () => props.row.sync,
  set: (value: boolean) => stockEventsStore.updateMapping(props.row.symbol, { sync: value }),
})

const watchlist = computed({
  get: () => props.row.watchlistId,
  set: (value: string) => stockEventsStore.updateMapping(props.row.symbol, { watchlistId: value }),
})

const target = ref(props.row.targetSymbol)
watch(
  () => props.row.targetSymbol,
  (value) => {
    target.value = value
  },
)

function saveTarget(): void {
  if (target.value.trim().toUpperCase() === props.row.targetSymbol) return
  stockEventsStore.updateMapping(props.row.symbol, { targetSymbol: target.value })
}

const watchlistOptions = computed(() => [
  { value: '', label: 'Sin lista' },
  ...stockEventsStore.watchlists.map((list) => ({ value: list.id, label: list.name })),
])

const CHECK: Record<string, { label: string; tone: StatusTone }> = {
  'in-watchlist': { label: 'En la lista', tone: 'gain' },
  detected: { label: 'Detectado', tone: 'gain' },
  'not-detected': { label: 'No detectado', tone: 'warn' },
}

const check = computed(() => {
  const result = props.row.checkResult
  if (!result) return null
  return CHECK[result.status] ?? { label: result.message || 'Error', tone: 'loss' as const }
})
</script>

<template>
  <div class="border-line grid gap-3 rounded-md border p-4" :data-symbol-sync="row.symbol">
    <div class="flex items-center justify-between gap-3">
      <span class="flex items-baseline gap-2.5">
        <span class="font-mono font-medium">{{ row.symbol }}</span>
        <span class="text-text-muted text-sm">
          <StatusDot v-if="check" :tone="check.tone" :label="check.label" />
          <template v-else>Sin comprobar</template>
        </span>
      </span>
      <ToggleSwitch
        v-model="sync"
        :label="`Sincronizar ${row.symbol}`"
        on-text="Sincroniza"
        off-text="No"
      />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <BaseSelect
        v-model="watchlist"
        :label="`Lista de seguimiento de ${row.symbol}`"
        :options="watchlistOptions"
        :disabled="!stockEventsStore.watchlists.length"
      />
      <BaseInput
        v-model="target"
        :label="`Símbolo en Stock Events de ${row.symbol}`"
        :placeholder="row.symbol"
        spellcheck="false"
        class="[&_input]:font-mono [&_input]:uppercase"
        @change="saveTarget"
      />
    </div>
    <button
      v-if="hideable"
      type="button"
      class="text-text-muted hover:text-text-main min-h-11 justify-self-start text-sm font-semibold underline-offset-4 hover:underline"
      :aria-label="`${row.hidden ? 'Mostrar' : 'Ocultar'} ${row.symbol}`"
      @click="stockEventsStore.updateMapping(row.symbol, { hidden: !row.hidden })"
    >
      {{ row.hidden ? 'Mostrar' : 'Ocultar' }}
    </button>
  </div>
</template>
