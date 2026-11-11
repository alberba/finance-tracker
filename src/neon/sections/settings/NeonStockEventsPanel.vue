<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import { useStockEventsStore } from '../../../stores/stockevents'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonSwitch from '../../ui/NeonSwitch.vue'

// Stock Events: the API key, whether new movements are sent and whether trades
// move the cash of the list. Which list and ticker each symbol uses is decided
// in the old design's cards for now.
const open = defineModel<boolean>('open', { required: true })
const store = useStockEventsStore()
const apiKey = shallowRef('')

const hasApiKey = computed(() => store.credentialConfigured)
const enabled = computed({
  get: () => store.settings.enabled,
  set: (value: boolean) => store.setEnabled(value),
})
const tradesToCash = computed({
  get: () => store.settings.tradesToCash === true,
  set: (value: boolean) => store.setTradesToCash(value),
})
const syncedCount = computed(
  () => store.symbolRows.filter((row) => row.sync && row.watchlistId).length,
)

const status = computed(() => {
  if (store.connectionError) return store.connectionError
  if (!hasApiKey.value) return 'Sin API key'
  const lists = store.watchlists.length
  if (!lists) return 'API key guardada'
  return `Conectado · ${lists === 1 ? '1 lista' : `${lists} listas`}`
})

async function saveApiKey(): Promise<void> {
  await store.saveApiKey(apiKey.value)
  apiKey.value = ''
  if (store.credentialConfigured) await store.loadWatchlists()
}

watch(open, (value) => {
  if (!value) apiKey.value = ''
})

const FIELD =
  'border-ctrl-line bg-panel text-text rounded-field outline-accent box-border min-h-[46px] w-full min-w-0 border px-3.5 font-mono text-[16px] focus-visible:outline-2 focus-visible:outline-offset-2'
</script>

<template>
  <NeonDetailPanel v-model:open="open" title="Stock Events" kicker="Conexión · Sincronización">
    <p class="text-muted text-note">
      Envía los movimientos de inversión nuevos a tu cartera de Stock Events.
    </p>
    <p class="text-[15px] font-bold" data-stockevents-connection>{{ status }}</p>
    <form class="grid gap-2.5" autocomplete="off" @submit.prevent="saveApiKey">
      <label class="text-muted text-meta grid gap-1.5 font-bold">
        API key
        <input
          v-model="apiKey"
          type="password"
          spellcheck="false"
          :placeholder="hasApiKey ? 'Configurada · escribe para sustituirla' : 'se_live_…'"
          :class="FIELD"
        />
      </label>
      <div class="flex flex-wrap gap-2.5">
        <NeonButton variant="primary" type="submit" :disabled="store.isSavingCredential">
          {{ store.isSavingCredential ? 'Guardando…' : 'Guardar API key' }}
        </NeonButton>
        <NeonButton
          :disabled="!hasApiKey || store.isLoadingWatchlists"
          @click="store.loadWatchlists()"
        >
          {{ store.isLoadingWatchlists ? 'Cargando…' : 'Cargar listas' }}
        </NeonButton>
      </div>
      <p class="text-muted text-meta">
        Se crea en la web de Stock Events, en Settings › Data › API Keys (requiere suscripción Pro).
      </p>
    </form>

    <div class="grid">
      <div class="border-line flex min-h-16 items-center justify-between gap-4 border-t py-2.5">
        <span class="grid">
          <span class="text-[16px] font-bold">Sincronizar los movimientos nuevos</span>
          <span class="text-muted text-meta">Cada compra o venta se envía al guardarla.</span>
        </span>
        <NeonSwitch v-model="enabled" label="Sincronizar nuevos movimientos con Stock Events" />
      </div>
      <div class="border-line flex min-h-16 items-center justify-between gap-4 border-y py-2.5">
        <span class="grid">
          <span class="text-[16px] font-bold">Las compras y ventas mueven el efectivo</span>
          <span class="text-muted text-meta">
            Stock Events descuenta o suma su importe del efectivo de la lista.
          </span>
        </span>
        <NeonSwitch
          v-model="tradesToCash"
          label="Las compras y ventas mueven el efectivo en Stock Events"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <NeonButton
        :disabled="!hasApiKey || !syncedCount || store.isChecking"
        @click="store.checkSymbols()"
      >
        {{ store.isChecking ? 'Comprobando…' : 'Comprobar símbolos' }}
      </NeonButton>
      <p class="text-muted text-note flex-1">
        {{
          syncedCount === 1 ? '1 símbolo sincronizado' : `${syncedCount} símbolos sincronizados`
        }}.
      </p>
    </div>
  </NeonDetailPanel>
</template>
