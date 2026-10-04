<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import SettingsTabIntro from './SettingsTabIntro.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import StatusDot from '../ui/StatusDot.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import { useSettingsStore } from '../../stores/settings'
import { useStockEventsStore } from '../../stores/stockevents'

// Preferencias: the working year and currency, and the connection with Stock
// Events. Which list and ticker each symbol uses is set on its asset, and the
// cash list of each account on the account.
defineProps<{ isActive: boolean }>()

const settingsStore = useSettingsStore()
const stockEventsStore = useStockEventsStore()
const { viewModel } = storeToRefs(settingsStore)

const year = ref(String(viewModel.value.year))
const currency = ref(viewModel.value.currency)

// Keep the unsaved fields in step when the year or currency change elsewhere
// (the dashboard year control writes through the store).
watch(
  () => viewModel.value.year,
  (value) => {
    year.value = String(value)
  },
)
watch(
  () => viewModel.value.currency,
  (value) => {
    currency.value = value
  },
)

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
</script>

<template>
  <section
    id="settings-tab-preferences"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-preferences-button"
    data-settings-preferences
  >
    <SettingsTabIntro
      title="Preferencias y conexiones"
      description="Ajustes generales y la conexión con Stock Events."
    />

    <DocumentSurface>
      <NumberedBlock
        number="01"
        title="General"
        title-id="settings-general-title"
        description="Año de trabajo y moneda con los que se calcula todo el tracker."
      >
        <form
          class="grid gap-3.5 sm:grid-cols-[10rem_8rem_auto] sm:items-end"
          autocomplete="off"
          @submit.prevent="settingsStore.saveGeneral(year, currency)"
        >
          <BaseInput
            id="settings-year"
            v-model="year"
            label="Año de trabajo"
            name="settingsYear"
            type="number"
            min="2000"
            max="2100"
            class="[&_input]:font-display"
          />
          <BaseInput
            id="settings-currency"
            v-model="currency"
            label="Moneda"
            name="settingsCurrency"
            maxlength="3"
            class="[&_input]:font-mono [&_input]:uppercase"
          />
          <BaseButton
            id="save-settings-main"
            type="submit"
            variant="primary"
            class="justify-self-start"
          >
            Guardar ajustes
          </BaseButton>
        </form>
      </NumberedBlock>

      <NumberedBlock
        number="02"
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
              }}. Qué lista y ticker usa cada símbolo se decide en la ficha de su activo; la lista
              de efectivo, en la de cada cuenta.
            </p>
          </div>
        </div>
      </NumberedBlock>
    </DocumentSurface>
  </section>
</template>
