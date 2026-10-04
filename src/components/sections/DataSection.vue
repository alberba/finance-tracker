<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, useTemplateRef } from 'vue'

import AppSection from '../ui/AppSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import FigureStrip from '../ui/FigureStrip.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import PageHeader from '../ui/PageHeader.vue'
import { useDataStore } from '../../stores/data'

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const dataStore = useDataStore()
const { summary, canStartFresh, backsUpServerData } = storeToRefs(dataStore)

const countFormat = new Intl.NumberFormat('es-ES')
const figures = computed(() => [
  { label: 'Movimientos', value: countFormat.format(summary.value.totalTransactions) },
  { label: 'Snapshots', value: countFormat.format(summary.value.totalSnapshots) },
  { label: 'Aportes', value: countFormat.format(summary.value.totalContributions) },
])

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const pendingFile = ref<File | null>(null)
const confirmImportOpen = ref(false)
const confirmFreshOpen = ref(false)

function onImportChange(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) {
    return
  }
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  pendingFile.value = file
  confirmImportOpen.value = true
}

function onConfirmImport(): void {
  if (pendingFile.value) {
    void dataStore.importJson(pendingFile.value)
  }
  pendingFile.value = null
}
</script>

<template>
  <AppSection id="data" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader
        kicker="Copias y exportación"
        title="Datos y backups"
        title-id="data-title"
        lede="Guarda una copia de tus datos, restáurala o llévate los movimientos a una hoja de cálculo."
      />

      <DocumentSurface>
        <NumberedBlock
          number="01"
          title="Estado"
          title-id="data-status-title"
          :description="
            backsUpServerData
              ? 'Lo que contiene tu espacio ahora mismo; es lo que guarda una copia.'
              : 'Lo que contiene el tracker ahora mismo; es lo que guarda una copia.'
          "
        >
          <FigureStrip :items="figures" data-data-figures />
          <p v-if="!backsUpServerData" id="data-meta" class="text-text-muted text-sm">
            {{ summary.meta }}
          </p>
        </NumberedBlock>

        <NumberedBlock
          number="02"
          title="Exportar"
          title-id="data-export-title"
          description="Descarga un archivo con tus datos. Nada cambia en el tracker."
        >
          <ul class="divide-line border-line divide-y border-t" data-data-exports>
            <li
              class="grid items-center gap-x-6 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
              data-export="json"
            >
              <div class="grid min-w-0 gap-1">
                <p class="text-text-main font-bold">
                  Copia completa <span class="text-text-muted text-sm">JSON</span>
                </p>
                <p class="text-text-muted text-sm">
                  Cuentas, movimientos, presupuesto, patrimonio, inversión y ajustes. Es el archivo
                  que se importa en el paso 03.
                </p>
              </div>
              <BaseButton
                id="export-json"
                variant="primary"
                class="justify-self-start"
                @click="void dataStore.exportJson()"
              >
                Exportar JSON
              </BaseButton>
            </li>
            <li
              class="grid items-center gap-x-6 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
              data-export="csv"
            >
              <div class="grid min-w-0 gap-1">
                <p class="text-text-main font-bold">
                  Movimientos <span class="text-text-muted text-sm">CSV</span>
                </p>
                <p class="text-text-muted text-sm">
                  Solo los movimientos, para abrirlos en una hoja de cálculo. No se puede importar.
                </p>
              </div>
              <BaseButton
                id="export-transactions-csv"
                class="justify-self-start"
                @click="dataStore.exportTransactionsCsv()"
              >
                Exportar CSV
              </BaseButton>
            </li>
          </ul>
        </NumberedBlock>

        <NumberedBlock
          number="03"
          title="Importar"
          title-id="data-import-title"
          description="Restaura una copia completa. Sustituye todos tus datos actuales por los del archivo."
        >
          <template #actions>
            <BaseButton @click="fileInput?.click()">Elegir archivo JSON</BaseButton>
            <input
              id="import-json"
              ref="fileInput"
              name="importJson"
              type="file"
              accept="application/json"
              class="hidden"
              tabindex="-1"
              aria-label="Importar archivo JSON"
              @change="onImportChange"
            />
          </template>
        </NumberedBlock>

        <NumberedBlock
          v-if="canStartFresh"
          number="04"
          title="Empezar de cero"
          title-id="data-fresh-title"
          description="Crea un espacio nuevo y vacío: año actual, euros, sin cuentas ni movimientos."
        >
          <template #actions>
            <BaseButton id="start-fresh" variant="danger" @click="confirmFreshOpen = true">
              Empezar de cero
            </BaseButton>
          </template>
        </NumberedBlock>
      </DocumentSurface>
    </div>

    <ConfirmDialog
      v-model:open="confirmImportOpen"
      title="¿Importar esta copia?"
      title-id="data-import-confirm-title"
      confirm-label="Sustituir mis datos"
      @confirm="onConfirmImport"
    >
      Se sustituirán todos tus datos por los de
      <span class="text-text-main font-mono text-sm">{{ pendingFile?.name }}</span
      >. Lo que no esté en la copia se perderá.
    </ConfirmDialog>

    <ConfirmDialog
      v-model:open="confirmFreshOpen"
      title="¿Empezar de cero?"
      title-id="data-fresh-confirm-title"
      confirm-label="Crear espacio vacío"
      @confirm="void dataStore.startFresh()"
    >
      Se creará un espacio nuevo y vacío (año actual, EUR, sin cuentas ni movimientos).
    </ConfirmDialog>
  </AppSection>
</template>
