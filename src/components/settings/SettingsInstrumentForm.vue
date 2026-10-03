<script setup lang="ts">
import { reactive } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import { INSTRUMENT_TYPE_LABEL, QUOTE_PROVIDERS } from '../../domain/settings/view-model'
import type { InstrumentType } from '../../scripts/types'
import { useMarketStore, type NewInstrumentInput } from '../../stores/market'

// Adds a quote instrument to an asset. Its movements with the same symbol can
// be linked right after, from the instrument itself.
const props = defineProps<{ assetId: string }>()

const marketStore = useMarketStore()

const TYPE_OPTIONS = (Object.keys(INSTRUMENT_TYPE_LABEL) as InstrumentType[]).map((value) => ({
  value,
  label: INSTRUMENT_TYPE_LABEL[value],
}))
const providerOptions = QUOTE_PROVIDERS.map((item) => ({ ...item }))

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
    <BaseSelect v-model="form.type" label="Tipo" name="type" :options="TYPE_OPTIONS" />
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
      v-model="form.market"
      label="Mercado / MIC (opcional)"
      name="market"
      placeholder="XETRA"
      class="[&_input]:font-mono"
    />
    <BaseInput
      v-model="form.currency"
      label="Moneda"
      name="currency"
      maxlength="3"
      required
      class="[&_input]:font-mono [&_input]:uppercase"
    />
    <BaseSelect
      v-model="form.provider"
      label="Proveedor"
      name="provider"
      :options="providerOptions"
      class="sm:col-span-2"
    />
    <BaseButton type="submit" class="sm:col-span-2">Añadir instrumento</BaseButton>
  </form>
</template>
