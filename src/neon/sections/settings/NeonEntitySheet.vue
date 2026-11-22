<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { formatMoney } from '../../../lib/format'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { useEntityActions, type EntityKind } from './entity-actions'

// The mobile sheet of Cuentas, Activos and Pasivos: what the desktop table
// edits in place (name and starting balance) and its add row (plus the symbol
// of a new asset). With a row it edits that one; without one it creates.
const props = defineProps<{
  kind: EntityKind
  row: { id: string; name: string; openingBalance: number } | null
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
    symbol.value = ''
  },
  { immediate: true },
)

const title = computed(() => (props.row ? words.edit : words.fresh))
const withSymbol = computed(() => props.kind === 'investmentAssets' && !props.row)

function submit(): void {
  const done = props.row
    ? actions.save(props.row, name.value, balance.value)
    : actions.add(name.value, balance.value, symbol.value)
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
          placeholder="VWCE.DE"
          autocapitalize="characters"
          :class="fieldClass"
        />
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
