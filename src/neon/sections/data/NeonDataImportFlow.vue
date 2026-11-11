<script setup lang="ts">
import NeonButton from '../../ui/NeonButton.vue'
import NeonDataBitvavo from './NeonDataBitvavo.vue'
import { importStepLabel, type ImportOrigin, type ImportStep } from './view-model'

// The import flow that opens inside «Entrada y salida» (artboard «Datos ·
// 2560 px»): first where the data comes from, then a review before anything
// is replaced or added, then the result. A JSON copy replaces everything, so
// it waits for the queue to be empty; Bitvavo only adds what is new.
defineProps<{
  step: ImportStep
  origin: ImportOrigin | null
  /** Bitvavo needs the account's server, which the demo does not have. */
  bitvavo: boolean
  fileName: string | null
  /** Changes still waiting to be sent: a restore would drop them. */
  blocked: boolean
  syncing: boolean
  canSync: boolean
  working: boolean
  done: { title: string; text: string } | null
}>()

defineEmits<{
  close: []
  pick: [origin: ImportOrigin]
  back: []
  chooseFile: []
  confirmJson: []
  sync: []
  reset: []
  bitvavoDone: [result: { title: string; text: string }]
}>()

const ORIGIN_ICON = {
  json: 'M12 20V9M7 13l5-5 5 5M5 4h14',
  bitvavo: 'M3 17l6-6 4 4 8-8M15 7h6v6',
}
</script>

<template>
  <section
    id="data-import-flow"
    aria-labelledby="data-flow-title"
    class="bg-panel2 motion-safe:animate-sheet-in flex min-w-0 flex-col gap-4 rounded-[18px] p-[18px]"
    data-import-flow
  >
    <div class="flex items-center justify-between gap-3">
      <div class="grid min-w-0 gap-0.5">
        <h3 id="data-flow-title" class="text-block-title font-sans font-extrabold">Importar</h3>
        <p class="text-muted text-[13px]" data-import-step>{{ importStepLabel(step) }}</p>
      </div>
      <NeonButton @click="$emit('close')">Cerrar</NeonButton>
    </div>

    <ul v-if="step === 'origin'" class="grid list-none gap-2.5">
      <li>
        <button
          type="button"
          class="bg-panel text-text outline-accent flex min-h-18 w-full items-center gap-3.5 rounded-[18px] px-4 py-3.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          data-origin="json"
          @click="$emit('pick', 'json')"
        >
          <span
            class="bg-panel2 text-accent-text grid size-10 shrink-0 place-items-center rounded-full"
            aria-hidden="true"
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path :d="ORIGIN_ICON.json" />
            </svg>
          </span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="text-[16px] font-bold">Archivo JSON</span>
            <span class="text-muted text-[13px]">
              Una copia completa. Sustituye todos tus datos actuales.
            </span>
          </span>
          <svg
            class="text-muted size-[18px] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </li>
      <li v-if="bitvavo">
        <button
          type="button"
          class="bg-panel text-text outline-accent flex min-h-18 w-full items-center gap-3.5 rounded-[18px] px-4 py-3.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          data-origin="bitvavo"
          @click="$emit('pick', 'bitvavo')"
        >
          <span
            class="bg-panel2 text-accent-text grid size-10 shrink-0 place-items-center rounded-full"
            aria-hidden="true"
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path :d="ORIGIN_ICON.bitvavo" />
            </svg>
          </span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="text-[16px] font-bold">Bitvavo</span>
            <span class="text-muted text-[13px]">
              Compras y ventas de tu cuenta, con clave de solo lectura.
            </span>
          </span>
          <svg
            class="text-muted size-[18px] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </li>
    </ul>

    <div v-else-if="step === 'review' && origin === 'json'" class="flex flex-col gap-3.5">
      <template v-if="fileName">
        <p class="text-soft text-[15px]">
          Archivo <span class="text-text font-bold [overflow-wrap:anywhere]">{{ fileName }}</span
          >. Se sustituirán todos tus datos por los de este archivo. Lo que no esté en la copia se
          perderá.
        </p>
        <div
          v-if="blocked"
          class="bg-panel border-ctrl-line flex flex-col items-start gap-2.5 rounded-[18px] border-s-2 px-4 py-3.5"
          data-import-blocked
        >
          <p class="text-[15px] font-bold">
            Hay cambios sin sincronizar. Conéctate y vuelve a intentarlo.
          </p>
          <NeonButton
            variant="primary"
            :disabled="!canSync"
            :aria-busy="syncing"
            @click="$emit('sync')"
          >
            {{ syncing ? 'Sincronizando…' : 'Sincronizar ahora' }}
          </NeonButton>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <NeonButton @click="$emit('back')">Cambiar origen</NeonButton>
          <NeonButton
            danger
            :disabled="blocked || working"
            :aria-busy="working"
            @click="$emit('confirmJson')"
          >
            Sustituir mis datos
          </NeonButton>
        </div>
      </template>
      <template v-else>
        <p class="text-soft text-[15px]">
          Elige la copia JSON que exportaste. Se sustituirán todos tus datos por los de ese archivo.
        </p>
        <div class="flex flex-wrap items-center gap-2.5">
          <NeonButton @click="$emit('back')">Cambiar origen</NeonButton>
          <NeonButton variant="primary" @click="$emit('chooseFile')"
            >Elegir archivo JSON</NeonButton
          >
        </div>
      </template>
    </div>

    <NeonDataBitvavo
      v-else-if="step === 'review' && origin === 'bitvavo'"
      @done="$emit('bitvavoDone', $event)"
    >
      <template #back>
        <NeonButton @click="$emit('back')">Cambiar origen</NeonButton>
      </template>
    </NeonDataBitvavo>

    <div v-else-if="step === 'done' && done" class="flex flex-col items-start gap-3" role="status">
      <p class="text-[18px] font-extrabold" data-import-done>{{ done.title }}</p>
      <p class="text-soft text-[15px]">{{ done.text }}</p>
      <NeonButton @click="$emit('reset')">Hacer otra importación</NeonButton>
    </div>
  </section>
</template>
