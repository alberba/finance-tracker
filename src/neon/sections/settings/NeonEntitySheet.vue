<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { formatMoney } from '../../../lib/format'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { useEntityActions, type EntityKind } from './entity-actions'
import { useTickerSuggestions } from './ticker-suggestions'

// The mobile sheet of Cuentas, Activos and Pasivos: what the desktop table
// edits in place (name, starting balance and, for an asset, the ticker it is
// quoted by) and its add row. With a row it edits that one; without one it creates.
const props = defineProps<{
  kind: EntityKind
  row: {
    id: string
    name: string
    openingBalance: number
    /** An asset's quote ticker, and the symbol its movements carry. */
    ticker?: string
    symbol?: string
  } | null
}>()
const open = defineModel<boolean>('open', { required: true })

const actions = useEntityActions(props.kind)
const words = actions.words
const name = ref('')
const balance = ref('')
const symbol = ref('')
const FORM_ID = `neon-entity-form-${props.kind}`

// Mounted already open the first time, so it fills in from the start too.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    name.value = props.row?.name ?? ''
    balance.value = props.row ? formatMoney(props.row.openingBalance) : ''
    symbol.value = props.row?.ticker ?? ''
  },
  { immediate: true },
)

// An asset whose movements carry a symbol but that has none to be quoted by gets a proposal.
const suggestions = useTickerSuggestions(() =>
  props.kind === 'investmentAssets' && props.row && !props.row.ticker && props.row.symbol
    ? [props.row.symbol]
    : [],
)
const suggestion = computed(() => (props.row?.symbol ? suggestions.value[props.row.symbol] : ''))

const title = computed(() => (props.row ? words.edit : words.fresh))
const withSymbol = computed(() => props.kind === 'investmentAssets')

function submit(): void {
  const done = props.row
    ? actions.save(props.row, name.value, balance.value)
    : actions.add(name.value, balance.value, symbol.value)
  if (done && props.row && withSymbol.value && symbol.value.trim() !== (props.row.ticker ?? '')) {
    actions.setTicker(props.row.id, symbol.value, props.row.symbol ?? '')
  }
  if (done) open.value = false
}

const fieldClass =
  'min-w-0 bg-panel border-ctrl-line text-text outline-accent rounded-field min-h-[46px] w-full border px-3.5 text-row font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const labelClass = 'text-muted grid min-w-0 gap-1.5 text-meta font-bold'
</script>

<template>
  <NeonDetailPanel v-model:open="open" :title="title">
    <form
      :id="FORM_ID"
      class="grid grid-cols-[minmax(0,1fr)] gap-[22px]"
      autocomplete="off"
      @submit.prevent="submit"
    >
      <label :class="labelClass">
        Nombre
        <input v-model="name" name="name" :class="fieldClass" />
      </label>
      <label :class="labelClass">
        {{ words.balance }}
        <input
          v-model="balance"
          name="balance"
          inputmode="decimal"
          placeholder="0,00 €"
          :class="[fieldClass, 'font-display text-end font-semibold']"
        />
      </label>
      <label v-if="withSymbol" :class="labelClass">
        Símbolo de cotización
        <input
          v-model="symbol"
          name="symbol"
          placeholder="VWCE.DE, BTC-EUR o ISIN"
          autocapitalize="characters"
          :class="fieldClass"
        />
        <button
          v-if="suggestion && !symbol.trim()"
          type="button"
          class="text-accent-text outline-accent justify-self-start rounded-xs font-bold underline underline-offset-2 focus-visible:outline-2"
          data-ticker-suggestion
          @click="symbol = suggestion"
        >
          Usar {{ suggestion }}
        </button>
      </label>
    </form>

    <template #footer>
      <NeonButton @click="open = false">Cancelar</NeonButton>
      <NeonButton variant="primary" type="submit" :form="FORM_ID">
        {{ row ? 'Guardar' : 'Añadir' }}
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>
