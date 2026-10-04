<script setup lang="ts">
import { computed, ref } from 'vue'

import SettingsInstrumentEditor from './SettingsInstrumentEditor.vue'
import SettingsInstrumentForm from './SettingsInstrumentForm.vue'
import SettingsSymbolSync from './SettingsSymbolSync.vue'
import BaseButton from '../ui/BaseButton.vue'
import PanelSectionTitle from '../ui/PanelSectionTitle.vue'
import { useSettingsAssets } from '../../composables/useSettingsAssets'

// The sections of an asset's card below its opening value: where its quote
// comes from (instruments and their movements) and how its symbols reach
// Stock Events. Everything here applies at once.
const props = defineProps<{ assetId: string }>()

const { assets } = useSettingsAssets()
const asset = computed(() => assets.value.find((item) => item.id === props.assetId))
const addingInstrument = ref(false)
</script>

<template>
  <template v-if="asset">
    <section class="border-line grid gap-4 border-t pt-6" aria-labelledby="settings-asset-quotes">
      <PanelSectionTitle id="settings-asset-quotes" as="h3">Cotización</PanelSectionTitle>
      <SettingsInstrumentEditor
        v-for="instrument in asset.instruments"
        :key="instrument.id"
        :instrument="instrument"
      />
      <p v-if="!asset.instruments.length" class="text-text-muted text-sm">
        Sin cotización: añade el instrumento con el que se cotiza este activo.
      </p>
      <SettingsInstrumentForm
        v-if="!asset.instruments.length || addingInstrument"
        :asset-id="asset.id"
      />
      <BaseButton
        v-else
        variant="ghost"
        class="justify-self-start"
        @click="addingInstrument = true"
      >
        Añadir otro instrumento
      </BaseButton>
    </section>

    <section
      class="border-line grid gap-4 border-t pt-6"
      aria-labelledby="settings-asset-stockevents"
    >
      <PanelSectionTitle id="settings-asset-stockevents" as="h3">Stock Events</PanelSectionTitle>
      <SettingsSymbolSync v-for="row in asset.syncRows" :key="row.symbol" :row="row" />
      <p v-if="!asset.syncRows.length" class="text-text-muted text-sm">
        Cuando el activo tenga un símbolo, aquí eliges si sus movimientos se envían a Stock Events.
      </p>
    </section>
  </template>
</template>
