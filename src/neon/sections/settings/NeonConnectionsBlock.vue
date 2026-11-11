<script setup lang="ts">
import { defineAsyncComponent, nextTick, shallowRef, watch } from 'vue'

import NeonSettingsBlock from './NeonSettingsBlock.vue'
import NeonStockEventsPanel from './NeonStockEventsPanel.vue'

// Only needed when the Bitvavo panel opens: keep its adapter out of startup.
const NeonBitvavoPanel = defineAsyncComponent(() => import('./NeonBitvavoPanel.vue'))

// Conexiones: the services linked to the tracker, each one opening its panel.
const stockEventsOpen = shallowRef(false)
const bitvavoOpen = shallowRef(false)

const providers = [
  {
    id: 'stockevents',
    name: 'Stock Events',
    initials: 'SE',
    description: 'Sincroniza movimientos de inversión y efectivo con tus listas de seguimiento.',
    action: 'Ajustes y sincronización',
    open: stockEventsOpen,
  },
  {
    id: 'bitvavo',
    name: 'Bitvavo',
    initials: 'BV',
    description: 'Conecta tu cuenta e importa el historial de compras y ventas en euros.',
    action: 'Ajustes e importación',
    open: bitvavoOpen,
  },
]

const launcher = shallowRef<HTMLElement | null>(null)

function launch(event: MouseEvent, open: { value: boolean }): void {
  // WebKit does not focus a button on a pointer click, and the panel hands the
  // focus back to what had it.
  launcher.value = event.currentTarget as HTMLButtonElement
  launcher.value.focus()
  open.value = true
}

// The Bitvavo panel is mounted on demand, so it is gone before it could give
// the focus back: the launcher gets it from here.
watch(bitvavoOpen, async (open) => {
  if (open) return
  await nextTick()
  launcher.value?.focus()
})
</script>

<template>
  <NeonSettingsBlock
    id="conexiones"
    title="Conexiones"
    description="Gestiona los servicios conectados a tu tracker."
  >
    <ul
      class="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4"
      aria-label="Servicios conectados"
    >
      <li v-for="provider in providers" :key="provider.id" class="flex">
        <article
          class="bg-panel border-line rounded-card flex min-w-0 flex-1 flex-col gap-3.5 border px-6 py-[22px]"
        >
          <div class="flex items-center gap-3.5">
            <span
              class="bg-panel2 text-accent-text font-display grid size-[46px] shrink-0 place-items-center rounded-full text-[14px] font-bold"
              aria-hidden="true"
            >
              {{ provider.initials }}
            </span>
            <h3 class="text-block-title font-sans font-extrabold">{{ provider.name }}</h3>
          </div>
          <p class="text-muted text-note">{{ provider.description }}</p>
          <button
            type="button"
            class="text-text outline-accent -mx-4 inline-flex min-h-11 items-center gap-2 self-start px-4 text-[15px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            :aria-label="provider.name"
            aria-haspopup="dialog"
            @click="launch($event, provider.open)"
          >
            {{ provider.action }}
            <span aria-hidden="true">→</span>
          </button>
        </article>
      </li>
    </ul>
    <NeonStockEventsPanel v-model:open="stockEventsOpen" />
    <NeonBitvavoPanel v-if="bitvavoOpen" v-model:open="bitvavoOpen" />
  </NeonSettingsBlock>
</template>
