<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SidePanel from '../ui/SidePanel.vue'
import { useSyncStore } from '../../stores/sync'
import { resolveEntityId } from '../../lib/client/command-mapping'
import type { Transaction } from '../../scripts/types'

const props = defineProps<{ transaction: Transaction }>()
const titleId = useId()
const open = shallowRef(false)
const instrumentId = shallowRef('')
const busy = shallowRef(false)
const error = shallowRef('')
const instruments = shallowRef<Array<{ id: string; symbol: string; name: string | null }>>([])
const sync = useSyncStore()
const operation = computed(() => props.transaction.remoteOperation)
const options = computed(() => [
  { value: '', label: 'Selecciona un instrumento' },
  ...instruments.value.map((instrument) => ({
    value: instrument.id,
    label: `${instrument.symbol} · ${instrument.name}`,
  })),
])
async function show() {
  open.value = true
  try {
    const response = await fetch('/api/integrations/bitvavo')
    if (!response.ok) throw new Error('No se pudieron cargar los instrumentos.')
    instruments.value = (await response.json()).instruments
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : 'No se pudieron cargar los instrumentos.'
  }
}
async function link() {
  busy.value = true
  error.value = ''
  try {
    const transactionId = await resolveEntityId('transaction', props.transaction.id)
    // Instruments use their own catalog identity in the server bootstrap.
    const instrument = instruments.value.find((item) => item.id === instrumentId.value)
    if (!transactionId || !instrument) throw new Error('Selecciona un instrumento disponible.')
    const response = await fetch('/api/integrations/bitvavo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'linkInstrument',
        transactionId,
        instrumentId: instrument.id,
      }),
    })
    if (!response.ok) throw new Error((await response.json()).error || 'No se pudo vincular.')
    await sync.refreshFromServer()
    open.value = false
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No se pudo vincular.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseButton @click="show">Ver operación Bitvavo</BaseButton>
  <SidePanel
    v-model:open="open"
    class="text-left"
    kicker="Operación importada"
    title="Detalle Bitvavo"
    :title-id="titleId"
  >
    <p class="text-text-muted text-sm">
      Bitvavo gobierna los campos financieros. Puedes cambiar su declaración y vincular un
      instrumento.
    </p>
    <dl v-if="operation" class="grid grid-cols-2 gap-3 text-sm">
      <dt>Identidad externa</dt>
      <dd class="font-mono break-all">{{ operation.externalId }}</dd>
      <dt>Instante</dt>
      <dd class="font-mono break-all">{{ operation.executedAt }}</dd>
      <dt>Fecha y hora local</dt>
      <dd>{{ operation.date }} {{ operation.time }} · {{ operation.timeZone }}</dd>
      <dt>Operación</dt>
      <dd>{{ operation.side === 'buy' ? 'Compra' : 'Venta' }} {{ operation.symbol }}</dd>
      <dt>Cantidad</dt>
      <dd class="font-mono break-all">{{ operation.quantity }}</dd>
      <dt>Precio unitario EUR</dt>
      <dd class="font-mono break-all">{{ operation.unitPrice }}</dd>
      <dt>Comisión EUR</dt>
      <dd class="font-mono break-all">{{ operation.fee }}</dd>
      <dt>Total EUR</dt>
      <dd class="font-mono break-all">{{ operation.cashAmount }}</dd>
    </dl>
    <p v-if="!transaction.instrumentId" class="font-semibold">Pendiente de vincular</p>
    <BaseSelect v-model="instrumentId" label="Instrumento" :options="options" />
    <p v-if="error" role="alert" class="text-loss">{{ error }}</p>
    <template #footer
      ><BaseButton :disabled="busy || !instrumentId" variant="primary" @click="link"
        >Vincular instrumento</BaseButton
      ></template
    >
  </SidePanel>
</template>
