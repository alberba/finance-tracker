<script setup lang="ts">
import { useMediaQuery } from '../../../composables/useMediaQuery'
import { useDataStore } from '../../../stores/data'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonDataDanger from './NeonDataDanger.vue'
import NeonDataSync from './NeonDataSync.vue'
import NeonDataSyncLine from './NeonDataSyncLine.vue'
import NeonDataTransfer from './NeonDataTransfer.vue'

// Datos in the new design (artboard «Datos · 2560 px», #446): the page title,
// then «Entrada y salida» (import, Bitvavo and export), «Sincronización» (the
// state of the queue) and, when the space can be wiped, «Zona peligrosa».
// The data, the files and the sync are the stores' (`useDataStore`,
// `useSyncStore`); this section only paints them. The mobile frame (artboard
// «Datos · móvil · Pixel 10», #447) puts the sync on one line above the rest
// and turns the transfer tiles into rows; which one shows follows the frame's
// media query, as in the other sections.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const { canStartFresh } = useDataStore()
const desktopFrame = useMediaQuery(FRAME_QUERY)
</script>

<template>
  <section
    v-show="isActive"
    id="data"
    class="@container mx-auto flex w-full max-w-[1640px] min-w-0 flex-col gap-5"
    aria-labelledby="data-title"
  >
    <header class="grid min-w-0 gap-2">
      <p
        class="text-muted text-label tracking-label motion-safe:animate-rise font-extrabold uppercase"
      >
        Copias y sincronización
      </p>
      <h1
        id="data-title"
        tabindex="-1"
        class="font-display motion-safe:animate-rise text-h1 font-bold outline-none"
      >
        Datos
      </h1>
      <p
        class="text-soft text-lede motion-safe:animate-rise max-w-155 motion-safe:[animation-delay:70ms]"
      >
        Trae datos de fuera, llévatelos cuando quieras y comprueba que todo está sincronizado.
      </p>
    </header>

    <div
      v-if="desktopFrame"
      class="grid min-w-0 grid-cols-1 items-stretch gap-5 @min-[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
    >
      <NeonDataTransfer />
      <NeonDataSync />
      <NeonDataDanger v-if="canStartFresh" class="@min-[900px]:col-span-2" />
    </div>
    <div v-else class="flex min-w-0 flex-col gap-4">
      <NeonDataSyncLine />
      <NeonDataTransfer mobile />
      <NeonDataDanger v-if="canStartFresh" />
    </div>
  </section>
</template>
