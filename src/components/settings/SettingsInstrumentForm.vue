<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import YahooQuoteLink from './YahooQuoteLink.vue'
import { yahooQuoteSymbol } from '../../domain/investment/symbol-matching'
import { FIELD_LABEL } from '../ui/field'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import { INSTRUMENT_TYPE_LABEL, QUOTE_PROVIDERS } from '../../domain/investment/instrument-labels'
import type { InstrumentType } from '../../scripts/types'
import { useMarketStore, type NewInstrumentInput } from '../../stores/market'
import { useFinancialStateStore } from '../../stores/financial-state'

// Configures a symbol's quote and the asset that groups its investment value.
const props = withDefaults(
  defineProps<{ assetId?: string; initialSymbol?: string; currency?: string }>(),
  {
    assetId: '',
    initialSymbol: '',
    currency: 'EUR',
  },
)
const emit = defineEmits<{ added: [id: string] }>()

const marketStore = useMarketStore()
const financialStateStore = useFinancialStateStore()
const assetId = ref(props.assetId)
const error = ref('')
const assetOptions = computed(() => [
  { value: '', label: 'Selecciona un activo' },
  ...financialStateStore.investmentAssets.map((asset) => ({ value: asset.id, label: asset.name })),
])

const TYPE_OPTIONS: SegmentedOption<InstrumentType>[] = (
  Object.keys(INSTRUMENT_TYPE_LABEL) as InstrumentType[]
).map((value) => ({ value, label: INSTRUMENT_TYPE_LABEL[value] }))
const providerOptions: SegmentedOption[] = QUOTE_PROVIDERS.map((item) => ({ ...item }))

const form = reactive<Omit<NewInstrumentInput, 'investmentAssetId'>>({
  type: 'etf',
  symbol: props.initialSymbol,
  quoteSymbol: '',
  market: '',
  currency: props.currency,
  provider: 'yahoo',
})
const yahooTicker = computed(() => yahooQuoteSymbol(form))

function submit(): void {
  error.value = ''
  if (marketStore.addInstrument({ ...form, investmentAssetId: assetId.value })) {
    const added = marketStore.instruments.find(
      (instrument) =>
        instrument.symbol === form.symbol.trim().toUpperCase() &&
        instrument.market === form.market.trim().toUpperCase(),
    )
    if (added) emit('added', added.id)
    form.symbol = ''
    form.market = ''
  } else {
    error.value = 'Ese símbolo y mercado ya están configurados.'
  }
}
</script>

<template>
  <form
    class="bg-subtle grid gap-3.5 rounded-md p-4 sm:grid-cols-2"
    autocomplete="off"
    data-instrument-form
    @submit.prevent="submit"
  >
    <div :class="[FIELD_LABEL, 'sm:col-span-2']">
      <span aria-hidden="true">Tipo</span>
      <SegmentedControl
        v-model="form.type"
        :options="TYPE_OPTIONS"
        label="Tipo"
        data-key="instrument-type"
        class="flex-wrap [&>button]:h-11 [&>button]:flex-auto [&>button]:whitespace-nowrap"
      />
    </div>
    <BaseInput
      v-model="form.symbol"
      label="Símbolo"
      name="symbol"
      placeholder="VWCE, BTC…"
      required
      spellcheck="false"
      class="[&_input]:font-mono [&_input]:uppercase"
    />
    <BaseInput
      v-model="form.currency"
      label="Moneda"
      name="currency"
      maxlength="3"
      required
      class="[&_input]:font-mono [&_input]:uppercase"
    />
    <BaseInput
      v-model="form.quoteSymbol"
      label="Ticker a consultar (opcional)"
      name="quoteSymbol"
      placeholder="VWCE.DE, BTC-EUR…"
      spellcheck="false"
      class="sm:col-span-2 [&_input]:font-mono [&_input]:uppercase"
    />
    <YahooQuoteLink v-if="form.provider === 'yahoo'" :symbol="yahooTicker" />
    <BaseInput
      v-model="form.market"
      label="Mercado / MIC (opcional)"
      name="market"
      placeholder="XETRA"
      class="sm:col-span-2 [&_input]:font-mono"
    />
    <div :class="[FIELD_LABEL, 'sm:col-span-2']">
      <span aria-hidden="true">Proveedor</span>
      <SegmentedControl
        v-model="form.provider"
        :options="providerOptions"
        label="Proveedor"
        data-key="provider"
        class="flex-wrap [&>button]:h-11 [&>button]:flex-auto [&>button]:whitespace-nowrap"
      />
    </div>
    <BaseSelect
      v-model="assetId"
      label="Activo de agrupación"
      :options="assetOptions"
      required
      class="sm:col-span-2"
    />
    <p class="text-text-muted text-sm sm:col-span-2">
      El activo agrupa el valor de tu inversión. La cotización corresponde únicamente al símbolo.
    </p>
    <p
      v-if="!financialStateStore.investmentAssets.length"
      class="text-text-muted text-sm sm:col-span-2"
    >
      Crea primero una agrupación de inversión en Activos para asignarle este símbolo.
    </p>
    <BaseButton type="submit" class="sm:col-span-2">Añadir instrumento</BaseButton>
    <p v-if="error" class="text-loss text-sm sm:col-span-2" role="alert">{{ error }}</p>
  </form>
</template>
