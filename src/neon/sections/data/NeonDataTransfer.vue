<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, useTemplateRef } from 'vue'

import { useDataStore } from '../../../stores/data'
import { useSyncStore } from '../../../stores/sync'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDataImportFlow from './NeonDataImportFlow.vue'
import NeonCard from '../../ui/NeonCard.vue'
import {
  bitvavoImported,
  canSyncNow,
  exportContents,
  jsonImported,
  lastImportNote,
  type ImportOrigin,
  type ImportResult,
  type ImportStep,
} from './view-model'

// «Entrada y salida» (artboard «Datos · 2560 px»): two tiles side by side.
// Importar opens the import flow under them; Exportar lists the two files the
// app can hand over and what a copy holds. The last import and export of this
// visit are noted at the foot of each tile.
const dataStore = useDataStore()
const syncStore = useSyncStore()
const { summary } = storeToRefs(dataStore)
// A plain value of the store, not a ref: `storeToRefs` would leave it out.
const backsUpServerData = dataStore.backsUpServerData
const { pendingCount, syncStatus, connection } = storeToRefs(syncStore)

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const importOpen = ref(false)
const origin = ref<ImportOrigin | null>(null)
const file = ref<File | null>(null)
const working = ref(false)
const done = ref<ImportResult | null>(null)
const lastImport = ref('')
const lastExport = ref('')

const step = computed<ImportStep>(() => (done.value ? 'done' : origin.value ? 'review' : 'origin'))
const contents = computed(() => exportContents(summary.value))

function toggleImport(): void {
  if (importOpen.value) closeImport()
  else importOpen.value = true
}

function closeImport(): void {
  importOpen.value = false
  reset()
}

function reset(): void {
  origin.value = null
  file.value = null
  done.value = null
}

function pick(next: ImportOrigin): void {
  origin.value = next
  if (next === 'json') fileInput.value?.click()
}

function onFileChange(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const chosen = input.files?.[0]
  input.value = ''
  if (!chosen) return
  file.value = chosen
  origin.value = 'json'
  done.value = null
  importOpen.value = true
}

async function confirmJson(): Promise<void> {
  const chosen = file.value
  if (!chosen || working.value) return
  working.value = true
  try {
    if (await dataStore.importJson(chosen)) {
      done.value = jsonImported(backsUpServerData)
      lastImport.value = lastImportNote('json')
    }
  } finally {
    working.value = false
  }
}

function onBitvavoDone(counts: { imported: number; duplicates: number }): void {
  done.value = bitvavoImported(counts.imported, counts.duplicates)
  lastImport.value = lastImportNote('bitvavo', counts.imported)
}

async function exportJson(): Promise<void> {
  if (await dataStore.exportJson()) lastExport.value = 'Último: JSON exportado.'
}

function exportCsv(): void {
  dataStore.exportTransactionsCsv()
  lastExport.value = 'Último: CSV exportado.'
}

function syncNow(): void {
  void syncStore.syncNow()
}
</script>

<template>
  <NeonCard
    title="Entrada y salida"
    title-id="data-transfer-title"
    class="motion-safe:animate-rise motion-safe:[animation-delay:70ms]"
  >
    <p class="text-muted text-note -mt-2">Lo que entra y sale de tu espacio.</p>

    <div class="grid grid-cols-1 gap-3.5 @min-[760px]:grid-cols-2">
      <button
        type="button"
        class="bg-panel2 text-text outline-accent flex min-w-0 flex-col items-start gap-3 rounded-[18px] p-[22px] text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
        :aria-expanded="importOpen"
        aria-controls="data-import-flow"
        data-import-toggle
        @click="toggleImport"
      >
        <span
          class="bg-panel text-accent-text rounded-field grid size-11 place-items-center"
          aria-hidden="true"
        >
          <svg
            class="size-[22px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />
          </svg>
        </span>
        <span class="text-block-title font-sans font-extrabold">Importar</span>
        <span class="text-soft text-[15px]">
          Restaura una copia completa{{
            backsUpServerData ? ' o trae las operaciones de Bitvavo' : ''
          }}.
        </span>
        <span class="flex flex-wrap gap-2">
          <span
            v-for="chip in backsUpServerData ? ['Archivo JSON', 'Bitvavo'] : ['Archivo JSON']"
            :key="chip"
            class="border-ctrl-line text-soft rounded-pill text-meta inline-flex min-h-7 items-center border px-2.5 font-extrabold"
          >
            {{ chip }}
          </span>
        </span>
        <span v-if="lastImport" class="text-muted text-meta mt-auto" data-last-import>
          {{ lastImport }}
        </span>
        <span class="text-accent-text text-note font-extrabold">
          {{ importOpen ? 'Cerrar importación' : 'Empezar importación' }}
        </span>
      </button>

      <div class="bg-panel2 flex min-w-0 flex-col gap-2.5 rounded-[18px] p-[22px]">
        <span
          class="bg-panel text-accent-text rounded-field grid size-11 place-items-center"
          aria-hidden="true"
        >
          <svg
            class="size-[22px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
        </span>
        <h3 class="text-block-title font-sans font-extrabold">Exportar</h3>
        <p class="text-soft text-[15px]">
          Descarga un archivo con tus datos. Nada cambia en el tracker.
        </p>
        <p class="text-muted text-note" data-export-contents>
          <template v-for="(part, index) in contents" :key="index">
            <span v-if="part.figure" class="font-display text-soft text-meta font-semibold">{{
              part.text
            }}</span>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
        <div class="border-line mt-auto flex flex-col gap-3 border-t pt-3.5">
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p class="min-w-0 text-[16px] font-bold">
              Copia completa <span class="text-muted text-meta font-semibold">JSON</span>
            </p>
            <NeonButton id="export-json" @click="exportJson">Exportar JSON</NeonButton>
          </div>
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p class="min-w-0 text-[16px] font-bold">
              Movimientos <span class="text-muted text-meta font-semibold">CSV</span>
            </p>
            <NeonButton id="export-transactions-csv" @click="exportCsv">Exportar CSV</NeonButton>
          </div>
          <p v-if="lastExport" class="text-muted text-meta" data-last-export>{{ lastExport }}</p>
        </div>
      </div>
    </div>

    <input
      id="import-json"
      ref="fileInput"
      name="importJson"
      type="file"
      accept="application/json"
      class="hidden"
      tabindex="-1"
      aria-label="Importar archivo JSON"
      @change="onFileChange"
    />

    <NeonDataImportFlow
      v-if="importOpen"
      :step="step"
      :origin="origin"
      :bitvavo="backsUpServerData"
      :file-name="file?.name ?? null"
      :blocked="pendingCount > 0"
      :syncing="syncStatus === 'syncing'"
      :can-sync="canSyncNow(connection === 'online', syncStatus)"
      :working="working"
      :done="done"
      @close="closeImport"
      @pick="pick"
      @back="reset"
      @choose-file="fileInput?.click()"
      @confirm-json="confirmJson"
      @sync="syncNow"
      @reset="reset"
      @bitvavo-done="onBitvavoDone"
    />
  </NeonCard>
</template>
