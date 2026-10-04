<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import SidePanel from '../ui/SidePanel.vue'
import StatusDot from '../ui/StatusDot.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import { useStockEventsStore } from '../../stores/stockevents'

const open = defineModel<boolean>('open', { required: true })
const stockEventsStore = useStockEventsStore()
const apiKey = shallowRef('')
const hasApiKey = computed(() => stockEventsStore.credentialConfigured)
const enabled = computed({
  get: () => stockEventsStore.settings.enabled,
  set: (value: boolean) => stockEventsStore.setEnabled(value),
})
const tradesToCash = computed({
  get: () => stockEventsStore.settings.tradesToCash === true,
  set: (value: boolean) => stockEventsStore.setTradesToCash(value),
})
const syncedCount = computed(
  () => stockEventsStore.symbolRows.filter((row) => row.sync && row.watchlistId).length,
)

const connection = computed(() => {
  if (stockEventsStore.connectionError) {
    return { tone: 'loss' as const, label: stockEventsStore.connectionError }
  }
  if (!hasApiKey.value) return { tone: 'warn' as const, label: 'Sin API key' }
  const lists = stockEventsStore.watchlists.length
  return {
    tone: 'gain' as const,
    label: lists
      ? `Conectado · ${lists === 1 ? '1 lista' : `${lists} listas`}`
      : 'API key guardada',
  }
})

async function saveApiKey(): Promise<void> {
  await stockEventsStore.saveApiKey(apiKey.value)
  apiKey.value = ''
  if (stockEventsStore.credentialConfigured) await stockEventsStore.loadWatchlists()
}

watch(open, (value) => {
  if (!value) apiKey.value = ''
})
</script>

<template>
  <SidePanel
    id="stockevents-connection-panel"
    v-model:open="open"
    title="Stock Events"
    title-id="stockevents-connection-title"
    kicker="Conexión · Sincronización"
  >
    <NumberedBlock
      number="01"
      title="Stock Events"
      title-id="settings-stockevents-title"
      description="Envía los movimientos de inversión nuevos a tu cartera de Stock Events."
    >
      <template #actions>
        <p class="text-sm font-semibold" data-stockevents-connection>
          <StatusDot :tone="connection.tone" :label="connection.label" />
        </p>
      </template>
      <div class="grid gap-5">
        <form
          class="grid gap-2.5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          @submit.prevent="saveApiKey"
        >
          <BaseInput
            v-model="apiKey"
            label="API key"
            type="password"
            :placeholder="hasApiKey ? 'Configurada · escribe para sustituirla' : 'se_live_…'"
            autocomplete="off"
            spellcheck="false"
            class="[&_input]:font-mono"
          />
          <BaseButton
            type="submit"
            variant="primary"
            :disabled="stockEventsStore.isSavingCredential"
          >
            {{ stockEventsStore.isSavingCredential ? 'Guardando…' : 'Guardar API key' }}
          </BaseButton>
          <BaseButton
            :disabled="!hasApiKey || stockEventsStore.isLoadingWatchlists"
            @click="stockEventsStore.loadWatchlists()"
          >
            {{ stockEventsStore.isLoadingWatchlists ? 'Cargando…' : 'Cargar listas' }}
          </BaseButton>
        </form>
        <p class="text-text-muted -mt-2 text-sm">
          Se crea en la web de Stock Events, en Settings › Data › API Keys (requiere suscripción
          Pro).
        </p>

        <div class="border-line divide-line grid divide-y border-y">
          <div class="flex items-center justify-between gap-4 py-2">
            <span class="grid gap-0.5">
              <span class="font-semibold">Sincronizar los movimientos nuevos</span>
              <span class="text-text-muted text-sm">
                Cada compra o venta se envía a Stock Events al guardarla.
              </span>
            </span>
            <ToggleSwitch
              v-model="enabled"
              label="Sincronizar nuevos movimientos con Stock Events"
            />
          </div>
          <div class="flex items-center justify-between gap-4 py-2">
            <span class="grid gap-0.5">
              <span class="font-semibold">Las compras y ventas mueven el efectivo</span>
              <span class="text-text-muted text-sm">
                Stock Events descuenta o suma su importe del efectivo de la lista.
              </span>
            </span>
            <ToggleSwitch
              v-model="tradesToCash"
              label="Las compras y ventas mueven el efectivo en Stock Events"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <BaseButton
            :disabled="!hasApiKey || !syncedCount || stockEventsStore.isChecking"
            @click="stockEventsStore.checkSymbols()"
          >
            {{ stockEventsStore.isChecking ? 'Comprobando…' : 'Comprobar símbolos' }}
          </BaseButton>
          <p class="text-text-muted max-w-[60ch] flex-1 text-sm">
            {{
              syncedCount === 1
                ? '1 símbolo sincronizado'
                : `${syncedCount} símbolos sincronizados`
            }}. Qué lista y ticker usa cada símbolo se decide en la ficha de su activo; la lista de
            efectivo, en la de cada cuenta.
          </p>
        </div>
      </div>
    </NumberedBlock>
  </SidePanel>
</template>
