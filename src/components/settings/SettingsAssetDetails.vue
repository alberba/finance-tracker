<script setup lang="ts">
import { computed } from 'vue'

import SettingsSymbolSync from './SettingsSymbolSync.vue'
import PanelSectionTitle from '../ui/PanelSectionTitle.vue'
import { useSettingsAssets } from '../../composables/useSettingsAssets'

// An asset groups the investment value and Stock Events destinations.
// Quotes themselves are configured by symbol in the Cotizaciones tab.
const props = defineProps<{ assetId: string }>()

const { assets } = useSettingsAssets()
const asset = computed(() => assets.value.find((item) => item.id === props.assetId))
</script>

<template>
  <template v-if="asset">
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
