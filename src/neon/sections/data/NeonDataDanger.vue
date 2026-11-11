<script setup lang="ts">
import { ref } from 'vue'

import { useDataStore } from '../../../stores/data'
import NeonButton from '../../ui/NeonButton.vue'

// «Zona peligrosa» (artboard «Datos · 2560 px»): a dashed block, the only one
// that can wipe the space. «Empezar de cero» asks once more, in place, before
// it creates the empty space.
const dataStore = useDataStore()
const confirming = ref(false)

async function startFresh(): Promise<void> {
  confirming.value = false
  await dataStore.startFresh()
}
</script>

<template>
  <section
    aria-labelledby="data-danger-title"
    class="border-line rounded-card motion-safe:animate-rise flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-4 border border-dashed px-6 py-[22px] motion-safe:[animation-delay:210ms] @max-lg:px-3 @max-lg:py-4"
    data-data-danger
  >
    <div class="grid min-w-0 flex-[1_1_360px] gap-1.5">
      <h2 id="data-danger-title" class="text-block-title font-sans font-extrabold">
        Zona peligrosa
      </h2>
      <p class="text-muted text-note">
        Empezar de cero crea un espacio nuevo y vacío: año actual, euros, sin cuentas ni
        movimientos.
      </p>
    </div>

    <NeonButton v-if="!confirming" id="start-fresh" danger @click="confirming = true">
      Empezar de cero
    </NeonButton>

    <div
      v-else
      class="flex min-w-0 flex-[1_1_360px] flex-col gap-3"
      role="alertdialog"
      aria-labelledby="data-fresh-title"
    >
      <p id="data-fresh-title" class="text-[16px] font-extrabold">¿Empezar de cero?</p>
      <p class="text-soft text-[15px]">
        Se creará un espacio nuevo y vacío (año actual, EUR, sin cuentas ni movimientos). Si quieres
        conservar lo de ahora, exporta antes una copia.
      </p>
      <div class="flex flex-wrap gap-2.5">
        <NeonButton @click="confirming = false">Cancelar</NeonButton>
        <NeonButton danger @click="startFresh">Crear espacio vacío</NeonButton>
      </div>
    </div>
  </section>
</template>
