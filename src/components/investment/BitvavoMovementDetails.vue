<script setup lang="ts">
import { computed, useId } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SidePanel from '../ui/SidePanel.vue'
import { useBitvavoMovementDetails } from '../../composables/useBitvavoMovementDetails'
import { formatDecimal, formatShortDate } from '../../lib/format'
import type { Transaction } from '../../scripts/types'

const props = defineProps<{ transaction: Transaction }>()
const titleId = useId()
const operation = computed(() => props.transaction.remoteOperation)
const { open, instrumentId, busy, error, options, show, link } = useBitvavoMovementDetails(
  () => props.transaction,
)
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
      <dd>
        {{ formatShortDate(operation.date) }}, {{ operation.time }} · {{ operation.timeZone }}
      </dd>
      <dt>Operación</dt>
      <dd>
        {{ operation.side === 'buy' ? 'Compra' : 'Venta' }}
        <span class="font-mono">{{ operation.symbol }}</span>
      </dd>
      <dt>Cantidad</dt>
      <dd class="font-display tabular-nums">{{ formatDecimal(operation.quantity) }}</dd>
      <dt>Precio unitario EUR</dt>
      <dd class="font-display tabular-nums">
        {{ formatDecimal(operation.unitPrice, { minDigits: 2 }) }}
      </dd>
      <dt>Comisión EUR</dt>
      <dd class="font-display tabular-nums">
        {{ formatDecimal(operation.fee, { minDigits: 2 }) }}
      </dd>
      <dt>Total EUR</dt>
      <dd class="font-display tabular-nums">
        {{ formatDecimal(operation.cashAmount, { minDigits: 2 }) }}
      </dd>
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
