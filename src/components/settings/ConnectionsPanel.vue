<script setup lang="ts">
import { shallowRef } from 'vue'
import BitvavoImportPanel from './BitvavoImportPanel.vue'
import StockEventsPanel from './StockEventsPanel.vue'
import { isSyncV2Enabled } from '../../lib/client/feature-flags'

const stockEventsOpen = shallowRef(false)
const bitvavoOpen = shallowRef(false)
const bitvavoEnabled = isSyncV2Enabled()
const providers = [
  {
    id: 'stockevents',
    name: 'Stock Events',
    initials: 'SE',
    description: 'Sincroniza movimientos de inversión y efectivo con tus listas de seguimiento.',
    action: 'Ajustes y sincronización',
    open: () => {
      stockEventsOpen.value = true
    },
  },
  ...(bitvavoEnabled
    ? [
        {
          id: 'bitvavo',
          name: 'Bitvavo',
          initials: 'BV',
          description: 'Conecta tu cuenta e importa el historial de compras y ventas en euros.',
          action: 'Ajustes e importación',
          open: () => {
            bitvavoOpen.value = true
          },
        },
      ]
    : []),
]
</script>

<template>
  <section id="cfg-connections" class="settings-block" aria-labelledby="connections-title">
    <header>
      <span class="settings-block__num">09</span>
      <h3 id="connections-title">Conexiones</h3>
      <p>Gestiona los servicios conectados a tu tracker.</p>
    </header>
    <div class="settings-block__body">
      <ul class="grid gap-4 sm:grid-cols-2" aria-label="Proveedores disponibles">
        <li v-for="provider in providers" :key="provider.id">
          <button
            type="button"
            class="border-line bg-panel text-text-main hover:border-primary hover:bg-subtle focus-visible:outline-primary flex h-full w-full cursor-pointer flex-col gap-5 rounded-lg border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            :aria-label="provider.name"
            :aria-describedby="`${provider.id}-connection-description`"
            :aria-controls="`${provider.id}-connection-panel`"
            aria-haspopup="dialog"
            @click="provider.open()"
          >
            <span class="flex w-full items-center gap-3">
              <span
                class="bg-primary/10 text-primary inline-flex size-11 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold"
                aria-hidden="true"
                >{{ provider.initials }}</span
              >
              <span class="font-display text-xl font-bold">{{ provider.name }}</span>
            </span>
            <span
              :id="`${provider.id}-connection-description`"
              class="text-text-muted flex-1 text-sm leading-relaxed"
              >{{ provider.description }}</span
            >
            <span
              class="text-primary flex w-full items-center justify-between gap-2 text-sm font-bold"
            >
              {{ provider.action }}
              <span aria-hidden="true">→</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
    <StockEventsPanel v-model:open="stockEventsOpen" />
    <BitvavoImportPanel v-if="bitvavoEnabled" v-model:open="bitvavoOpen" />
  </section>
</template>
