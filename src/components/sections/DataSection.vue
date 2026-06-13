<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useDataStore } from '../../stores/data'

withDefaults(
  defineProps<{
    isActive?: boolean
  }>(),
  { isActive: false },
)

const dataStore = useDataStore()
const { summary } = storeToRefs(dataStore)

function onImportChange(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) {
    return
  }
  const file = input.files?.[0]
  if (file) {
    dataStore.importJson(file)
  }
  input.value = ''
}

function onResetSeed(): void {
  const confirmed = window.confirm(
    'Se reiniciará todo y se cargará el seed original. ¿Continuar?',
  )
  if (confirmed) {
    dataStore.resetSeed()
  }
}
</script>

<template>
  <section
    id="data"
    class="panel"
    :class="{ 'is-active': isActive }"
    aria-labelledby="data-title"
  >
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Copias y exportación</p>
        <h2 id="data-title">Datos y backups</h2>
        <p>Exporta, importa y reinicia el tracker sin perder historial.</p>
      </div>
    </div>

    <div class="cards-grid slim">
      <article class="kpi-card">
        <p>Movimientos</p>
        <strong id="data-total-transactions">{{ summary.totalTransactions }}</strong>
      </article>
      <article class="kpi-card">
        <p>Snapshots</p>
        <strong id="data-total-snapshots">{{ summary.totalSnapshots }}</strong>
      </article>
      <article class="kpi-card">
        <p>Aportes</p>
        <strong id="data-total-contributions">{{ summary.totalContributions }}</strong>
      </article>
    </div>

    <div class="data-actions">
      <button id="export-json" class="primary-btn" type="button" @click="dataStore.exportJson()">
        Exportar JSON
      </button>
      <label class="file-btn">
        Importar JSON
        <input
          id="import-json"
          name="importJson"
          type="file"
          accept="application/json"
          aria-label="Importar archivo JSON"
          @change="onImportChange"
        />
      </label>
      <button
        id="export-transactions-csv"
        class="secondary-btn"
        type="button"
        @click="dataStore.exportTransactionsCsv()"
      >
        Exportar movimientos CSV
      </button>
      <button id="reset-seed" class="danger-btn" type="button" @click="onResetSeed">
        Reiniciar con datos semilla
      </button>
    </div>

    <article class="card">
      <h3>Estado</h3>
      <p id="data-meta">{{ summary.meta }}</p>
    </article>
  </section>
</template>
