<script setup lang="ts">
import { computed, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import SidePanel from '../ui/SidePanel.vue'
import PillTag from '../ui/PillTag.vue'
import { useBitvavoImport } from '../../composables/useBitvavoImport'
import {
  formatDecimal,
  formatMoney,
  formatQuotePrice,
  formatShortDate,
  formatTime,
} from '../../lib/format'
const open = defineModel<boolean>('open', { required: true })
const {
  form,
  destinations,
  configured,
  busy,
  error,
  notice,
  preview,
  resolutions,
  canConfirm,
  load,
  connect,
  generatePreview,
  confirm,
} = useBitvavoImport()
const accountOptions = computed(() => [
  { value: '', label: 'Selecciona una cuenta EUR' },
  ...destinations.value.map((account) => ({ value: account.id, label: account.name })),
])
const purchases = computed(
  () => preview.value?.operations.filter((op) => op.side === 'buy').length ?? 0,
)
const sales = computed(
  () => preview.value?.operations.filter((op) => op.side === 'sell').length ?? 0,
)
watch(
  open,
  (value) => {
    if (value) {
      void load()
    } else {
      form.apiKey = ''
      form.apiSecret = ''
    }
  },
  { immediate: true },
)
function close() {
  open.value = false
  form.apiKey = ''
  form.apiSecret = ''
}
</script>

<template>
  <SidePanel
    id="bitvavo-connection-panel"
    v-model:open="open"
    kicker="Conexión · Historial de cuenta"
    title="Bitvavo"
    title-id="bitvavo-import-title"
  >
    <p class="text-text-muted text-sm">
      Cuenta normal de Bitvavo. Crea una clave con exclusivamente permiso de lectura, sin
      negociación ni retiradas.
    </p>
    <form id="bitvavo-connection-form" class="grid gap-4" @submit.prevent="connect">
      <details :open="!configured">
        <summary class="cursor-pointer font-semibold">
          {{ configured ? 'Actualizar conexión' : 'Conectar cuenta' }}
        </summary>
        <fieldset :disabled="busy" class="mt-4 grid gap-4">
          <legend class="sr-only">Configuración Bitvavo</legend>
          <BaseInput
            v-model="form.apiKey"
            label="API key"
            name="bitvavoApiKey"
            type="password"
            autocomplete="off"
            required
          />
          <BaseInput
            v-model="form.apiSecret"
            label="Secreto API"
            name="bitvavoApiSecret"
            type="password"
            autocomplete="off"
            required
          />
          <BaseSelect
            v-model="form.accountId"
            label="Cuenta de destino"
            name="bitvavoAccount"
            :options="accountOptions"
            required
          />
          <BaseInput
            v-model="form.startDate"
            label="Fecha inicial"
            name="bitvavoStartDate"
            type="date"
            required
          />
          <BaseInput
            v-model="form.timeZone"
            label="Zona horaria"
            name="bitvavoTimeZone"
            required
            placeholder="Europe/Madrid"
          />
          <BaseButton type="submit">Validar y guardar conexión</BaseButton>
        </fieldset>
      </details>
    </form>
    <BaseButton v-if="configured" :disabled="busy" @click="generatePreview"
      >Preparar vista previa</BaseButton
    >
    <p v-if="busy" role="status">Consultando Bitvavo…</p>
    <p v-if="error" role="alert" class="text-loss">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="preview" class="grid gap-4" aria-label="Vista previa Bitvavo">
      <h3 class="font-display text-xl font-semibold">
        {{ purchases }} compras · {{ sales }} ventas
      </h3>
      <p class="text-text-muted text-sm">
        {{ preview.incompatible.length }} incompatibles. Se importarán todas las operaciones
        compatibles. Resuelve cada posible duplicado antes de confirmar.
      </p>
      <article
        v-for="operation in preview.operations"
        :key="operation.externalId"
        class="border-line grid gap-3 border-t pt-4"
      >
        <div class="flex items-center justify-between gap-3">
          <strong class="font-mono">{{ operation.symbol }}</strong
          ><PillTag>{{ operation.side === 'buy' ? 'Compra' : 'Venta' }}</PillTag>
        </div>
        <p class="text-text-muted text-sm">
          {{ formatShortDate(operation.date) }},
          {{ formatTime(operation.executedAt, operation.timeZone) }} · {{ operation.timeZone }}
        </p>
        <dl class="grid grid-cols-2 gap-2 text-sm">
          <dt>Cantidad</dt>
          <dd class="font-display text-right tabular-nums">
            {{ formatDecimal(operation.quantity) }}
          </dd>
          <dt>Precio unitario</dt>
          <dd class="font-display text-right tabular-nums">
            {{ formatQuotePrice(Number(operation.unitPrice), 'EUR') }}
          </dd>
          <dt>Comisión</dt>
          <dd class="font-display text-right tabular-nums">{{ formatMoney(operation.fee) }}</dd>
          <dt>Total</dt>
          <dd class="font-display text-right tabular-nums">
            {{ formatMoney(operation.cashAmount) }}
          </dd>
        </dl>
        <p v-if="operation.alreadyImported" class="text-text-muted text-sm">Ya importado</p>
        <BaseSelect
          v-else-if="operation.candidates.length"
          v-model="resolutions[operation.externalId]"
          :label="`Resolver ${operation.symbol} del ${formatShortDate(operation.date)}`"
          required
        >
          <option :value="undefined" disabled>Elige una resolución</option>
          <option value="">Crear un movimiento nuevo</option>
          <option
            v-for="candidate in operation.candidates"
            :key="candidate.id"
            :value="candidate.id"
          >
            Vincular: {{ candidate.description }} ({{ formatShortDate(candidate.date) }})
          </option>
        </BaseSelect>
        <p v-else class="text-text-muted text-sm">Nuevo movimiento · No declarado</p>
      </article>
      <ul v-if="preview.incompatible.length" class="text-text-muted text-sm">
        <li v-for="operation in preview.incompatible" :key="operation.externalId">
          {{ operation.externalId }}: {{ operation.reason }}
        </li>
      </ul>
    </section>
    <template #footer>
      <BaseButton @click="close">Cerrar</BaseButton>
      <BaseButton v-if="preview" variant="primary" :disabled="busy || !canConfirm" @click="confirm"
        >Confirmar importación completa</BaseButton
      >
    </template>
  </SidePanel>
</template>
