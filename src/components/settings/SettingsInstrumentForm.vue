<script setup lang="ts">
import { reactive } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import { FIELD_LABEL } from '../ui/field'
import SegmentedControl, { type SegmentedOption } from '../ui/SegmentedControl.vue'
import { INSTRUMENT_TYPE_LABEL, QUOTE_PROVIDERS } from '../../domain/investment/instrument-labels'
import type { InstrumentType } from '../../scripts/types'
import { useMarketStore, type NewInstrumentInput } from '../../stores/market'

// Adds a quote instrument to an asset. Its movements with the same symbol can
// be linked right after, from the instrument itself.
const props = defineProps<{ assetId: string }>()

const marketStore = useMarketStore()

const TYPE_OPTIONS: SegmentedOption<InstrumentType>[] = (
  Object.keys(INSTRUMENT_TYPE_LABEL) as InstrumentType[]
).map((value) => ({ value, label: INSTRUMENT_TYPE_LABEL[value] }))
const providerOptions: SegmentedOption[] = QUOTE_PROVIDERS.map((item) => ({ ...item }))

const form = reactive<Omit<NewInstrumentInput, 'investmentAssetId'>>({
  type: 'etf',
  symbol: '',
  market: '',
  currency: 'EUR',
  provider: 'twelve-data',
})

function submit(): void {
  if (marketStore.addInstrument({ ...form, investmentAssetId: props.assetId })) {
    form.symbol = ''
    form.market = ''
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
    <BaseButton type="submit" class="sm:col-span-2">Añadir instrumento</BaseButton>
  </form>
</template>
