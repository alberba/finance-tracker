<script setup lang="ts">
import { computed, watch } from 'vue'

import { useBitvavoImport } from '../../../composables/useBitvavoImport'
import {
  formatDecimal,
  formatMoney,
  formatQuotePrice,
  formatShortDate,
  formatTime,
} from '../../../lib/format'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'

// Bitvavo: connects the account with a read-only key, prepares a preview of
// its purchases and sales in euros and imports them once every possible
// duplicate is resolved.
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

const purchases = computed(
  () => preview.value?.operations.filter((op) => op.side === 'buy').length ?? 0,
)
const sales = computed(
  () => preview.value?.operations.filter((op) => op.side === 'sell').length ?? 0,
)

watch(
  open,
  (value) => {
    if (value) void load()
    else {
      form.apiKey = ''
      form.apiSecret = ''
    }
  },
  { immediate: true },
)

const FIELD =
  'border-ctrl-line bg-panel text-text rounded-field outline-accent box-border min-h-[46px] w-full min-w-0 border px-3.5 text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2'
const LABEL = 'text-muted grid min-w-0 gap-1.5 text-meta font-bold'
</script>

<template>
  <NeonDetailPanel v-model:open="open" title="Bitvavo" kicker="Conexión · Historial de cuenta">
    <p class="text-muted text-note">
      Cuenta normal de Bitvavo. Crea una clave con exclusivamente permiso de lectura, sin
      negociación ni retiradas.
    </p>
    <form id="neon-bitvavo-form" class="grid gap-4" autocomplete="off" @submit.prevent="connect">
      <details :open="!configured" class="grid gap-4">
        <summary class="cursor-pointer text-[16px] font-bold">
          {{ configured ? 'Actualizar conexión' : 'Conectar cuenta' }}
        </summary>
        <fieldset :disabled="busy" class="grid gap-4 pbs-4">
          <legend class="sr-only">Configuración Bitvavo</legend>
          <label :class="LABEL">
            API key
            <input v-model="form.apiKey" type="password" required :class="FIELD" />
          </label>
          <label :class="LABEL">
            Secreto API
            <input v-model="form.apiSecret" type="password" required :class="FIELD" />
          </label>
          <label :class="LABEL">
            Cuenta de destino
            <select v-model="form.accountId" required :class="FIELD">
              <option value="">Selecciona una cuenta EUR</option>
              <option v-for="account in destinations" :key="account.id" :value="account.id">
                {{ account.name }}
              </option>
            </select>
          </label>
          <label :class="LABEL">
            Fecha inicial
            <input v-model="form.startDate" type="date" required :class="FIELD" />
          </label>
          <label :class="LABEL">
            Zona horaria
            <input v-model="form.timeZone" required placeholder="Europe/Madrid" :class="FIELD" />
          </label>
          <NeonButton class="justify-self-start" type="submit"
            >Validar y guardar conexión</NeonButton
          >
        </fieldset>
      </details>
    </form>

    <NeonButton
      v-if="configured"
      class="justify-self-start"
      :disabled="busy"
      @click="generatePreview"
    >
      Preparar vista previa
    </NeonButton>
    <p v-if="busy" role="status" class="text-muted text-note">Consultando Bitvavo…</p>
    <p v-if="error" role="alert" class="text-loss text-note">{{ error }}</p>
    <p v-if="notice" role="status" class="text-note">{{ notice }}</p>

    <section v-if="preview" class="grid gap-4" aria-label="Vista previa Bitvavo">
      <h3 class="font-display text-[20px] font-semibold">
        {{ purchases }} compras · {{ sales }} ventas
      </h3>
      <p class="text-muted text-note">
        {{ preview.incompatible.length }} incompatibles. Se importarán todas las operaciones
        compatibles. Resuelve cada posible duplicado antes de confirmar.
      </p>
      <article
        v-for="operation in preview.operations"
        :key="operation.externalId"
        class="border-line grid gap-2.5 border-t pbs-4"
      >
        <div class="flex items-center justify-between gap-3">
          <strong class="font-mono">{{ operation.symbol }}</strong>
          <span class="text-muted text-meta font-bold">{{
            operation.side === 'buy' ? 'Compra' : 'Venta'
          }}</span>
        </div>
        <p class="text-muted text-note">
          {{ formatShortDate(operation.date) }},
          {{ formatTime(operation.executedAt, operation.timeZone) }} · {{ operation.timeZone }}
        </p>
        <dl class="text-note grid grid-cols-2 gap-2">
          <dt>Cantidad</dt>
          <dd class="font-display text-end">{{ formatDecimal(operation.quantity) }}</dd>
          <dt>Precio unitario</dt>
          <dd class="font-display text-end">
            {{ formatQuotePrice(Number(operation.unitPrice), 'EUR') }}
          </dd>
          <dt>Comisión</dt>
          <dd class="font-display text-end">{{ formatMoney(operation.fee) }}</dd>
          <dt>Total</dt>
          <dd class="font-display text-end">{{ formatMoney(operation.cashAmount) }}</dd>
        </dl>
        <p v-if="operation.alreadyImported" class="text-muted text-note">Ya importado</p>
        <label v-else-if="operation.candidates.length" :class="LABEL">
          {{ `Resolver ${operation.symbol} del ${formatShortDate(operation.date)}` }}
          <select v-model="resolutions[operation.externalId]" required :class="FIELD">
            <option :value="undefined" disabled>Elige una resolución</option>
            <option value="">Crear un movimiento nuevo</option>
            <option
              v-for="candidate in operation.candidates"
              :key="candidate.id"
              :value="candidate.id"
            >
              Vincular: {{ candidate.description }} ({{ formatShortDate(candidate.date) }})
            </option>
          </select>
        </label>
        <p v-else class="text-muted text-note">Nuevo movimiento · No declarado</p>
      </article>
      <ul v-if="preview.incompatible.length" class="text-muted text-note">
        <li v-for="operation in preview.incompatible" :key="operation.externalId">
          {{ operation.externalId }}: {{ operation.reason }}
        </li>
      </ul>
    </section>

    <template #footer>
      <NeonButton @click="open = false">Cerrar</NeonButton>
      <NeonButton v-if="preview" variant="primary" :disabled="busy || !canConfirm" @click="confirm">
        Confirmar importación completa
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>
