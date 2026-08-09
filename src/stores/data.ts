/**
 * WP7b note: `importJson`/`resetSeed` use `reloadState` (whole-blob
 * replace), not `commitState` — they were never in scope for the
 * per-entity sync-command mapping layer (`src/lib/client/command-mapping.ts`).
 * The v2 sync path already has dedicated endpoints for these flows
 * (`/api/data/import`, `/api/state/reset`, `/api/state/initialize` via
 * `startFresh`/`initializeFreshState` below), so nothing here needs wiring.
 */
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildDataSummaryViewModel, buildTransactionsCsv } from '../domain/data/view-model'
import { useToast } from '../composables/useToast'
import { isSyncV2Enabled } from '../lib/client/feature-flags'
import { initializeFreshState } from '../lib/client/state-initialize'
import { BASE_SEED } from '../scripts/state'
import { clone } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'

function downloadBlob(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const useDataStore = defineStore('data', () => {
  const financialStateStore = useFinancialStateStore()
  const { showToast } = useToast()

  const summary = computed(() => buildDataSummaryViewModel(financialStateStore.state))

  function exportJson(): void {
    const state = financialStateStore.state
    downloadBlob(
      JSON.stringify(state, null, 2),
      'application/json',
      `finance-tracker-${state.year}.json`,
    )
    showToast('JSON exportado.')
  }

  function exportTransactionsCsv(): void {
    const state = financialStateStore.state
    downloadBlob(
      buildTransactionsCsv(state),
      'text/csv;charset=utf-8',
      `movimientos-${state.year}.csv`,
    )
    showToast('CSV exportado.')
  }

  function importJson(file: File): void {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'))
        financialStateStore.reloadState(data)
        showToast('JSON importado correctamente.')
      } catch {
        showToast('No se pudo importar el archivo.')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  function resetSeed(): void {
    financialStateStore.reloadState(clone(BASE_SEED))
    showToast('Tracker reiniciado con datos semilla.')
  }

  /** "Empezar de cero" (WP8) — only meaningful on the v2 sync path. */
  const canStartFresh = isSyncV2Enabled()

  async function startFresh(): Promise<void> {
    if (!canStartFresh) {
      return
    }
    const result = await initializeFreshState()
    if (!result.ok) {
      showToast(result.error ?? 'No se pudo crear el espacio nuevo.')
      return
    }
    showToast(
      result.alreadyInitialized
        ? 'Ya tienes un espacio inicializado.'
        : 'Espacio nuevo creado. Recargando…',
    )
    window.location.reload()
  }

  return {
    summary,
    exportJson,
    exportTransactionsCsv,
    importJson,
    resetSeed,
    canStartFresh,
    startFresh,
  }
})
