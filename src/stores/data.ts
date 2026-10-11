/** JSON backups use the authenticated relational export; demo remains local. */
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { buildDataSummaryViewModel, buildTransactionsCsv } from '../domain/data/view-model'
import { useToast } from '../composables/useToast'
import { fetchBackup, restoreBackup } from '../lib/client/data-backup'
import { initializeFreshState } from '../lib/client/state-initialize'
import { isDemoMode } from '../scripts/demo-mode'
import { useFinancialStateStore } from './financial-state'
import { useSyncStore } from './sync'

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

  /** The JSON backup lives in D1 and a restore replaces what is there. */
  const backsUpServerData = !isDemoMode()

  async function exportJson(): Promise<void> {
    if (backsUpServerData) {
      const result = await fetchBackup()
      if (!result.ok) {
        showToast(`No se pudo exportar: ${result.error}`)
        return
      }
      const day = new Date().toISOString().slice(0, 10)
      downloadBlob(result.value, 'application/json', `finance-tracker-${day}.json`)
      showToast('JSON exportado.')
      return
    }
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

  async function importJson(file: File): Promise<void> {
    if (backsUpServerData) {
      await restoreJson(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'))
        financialStateStore.replaceState(data)
        showToast('JSON importado correctamente.')
      } catch {
        showToast('No se pudo importar el archivo.')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  async function restoreJson(file: File): Promise<void> {
    // Commands still queued point at rows the restore is about to delete:
    // send them first, and refuse while any remain (offline).
    const syncStore = useSyncStore()
    await syncStore.flush()
    if (syncStore.pendingCount > 0) {
      showToast('Hay cambios sin sincronizar. Conéctate y vuelve a intentarlo.')
      return
    }
    const result = await restoreBackup(await file.text())
    if (!result.ok) {
      showToast(`No se pudo importar: ${result.error}`)
      return
    }
    showToast(
      result.value.skipped > 0
        ? `JSON importado; ${result.value.skipped} elementos sin cuenta o categoría se omitieron. Recargando…`
        : 'JSON importado correctamente. Recargando…',
    )
    window.location.reload()
  }

  /** "Empezar de cero" provisions a private space for authenticated users. */
  const canStartFresh = !isDemoMode()

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
    backsUpServerData,
    canStartFresh,
    startFresh,
  }
})
