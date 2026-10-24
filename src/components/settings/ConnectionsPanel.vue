<script setup lang="ts">
import { nextTick, shallowRef, watch } from 'vue'
import SettingsTabIntro from './SettingsTabIntro.vue'
import { defineAsyncComponent } from 'vue'

// Only needed when the Bitvavo panel opens: keep its adapter out of startup.
const BitvavoImportPanel = defineAsyncComponent(() => import('./BitvavoImportPanel.vue'))
import StockEventsPanel from './StockEventsPanel.vue'

defineProps<{ isActive: boolean }>()

const stockEventsOpen = shallowRef(false)
const bitvavoOpen = shallowRef(false)
const bitvavoLauncher = shallowRef<HTMLElement | null>(null)

// The panel is mounted on demand, so it unmounts before its own close handler
// can restore focus; the launcher is refocused from here instead.
watch(bitvavoOpen, async (open) => {
  if (open) return
  await nextTick()
  bitvavoLauncher.value?.focus()
})
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

function openProvider(event: MouseEvent, open: () => void): void {
  // WebKit doesn't focus buttons on pointer clicks. SidePanel needs the
  // launcher focused before opening so it can restore it when closing; the
  // Bitvavo panel also remembers it because it mounts on demand.
  bitvavoLauncher.value = event.currentTarget as HTMLElement
  ;(event.currentTarget as HTMLButtonElement).focus()
  open()
}
</script>

<template>
  <section
    id="settings-tab-connections"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-connections-button"
  >
    <SettingsTabIntro
      title="Conexiones"
      description="Gestiona los servicios conectados a tu tracker."
    />
    <section aria-label="Conexiones">
      <ul class="grid gap-4 sm:grid-cols-2" aria-label="Proveedores disponibles">
        <li v-for="provider in providers" :key="provider.id">
          <button
            type="button"
            class="border-line bg-panel text-text-main hover:border-primary hover:bg-subtle focus-visible:outline-primary flex h-full w-full cursor-pointer flex-col gap-5 rounded-lg border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            :aria-label="provider.name"
            :aria-describedby="`${provider.id}-connection-description`"
            :aria-controls="`${provider.id}-connection-panel`"
            aria-haspopup="dialog"
            @click="openProvider($event, provider.open)"
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
              class="text-text-main flex w-full items-center justify-between gap-2 text-sm font-bold"
            >
              {{ provider.action }}
              <span aria-hidden="true">→</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
    <StockEventsPanel v-model:open="stockEventsOpen" />
    <BitvavoImportPanel v-if="bitvavoOpen" v-model:open="bitvavoOpen" />
  </section>
</template>
