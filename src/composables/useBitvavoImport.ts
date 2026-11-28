import { computed, reactive, shallowRef } from 'vue'
import type {
  BitvavoConnectionState,
  BitvavoPreview,
  BitvavoSyncCounts,
} from '../lib/bitvavo-types'
import { runClientHttp } from '../lib/client/runtime'
import { requestBitvavo } from '../lib/client/bitvavo-api'
import { useSyncStore } from '../stores/sync'

export function useBitvavoImport() {
  const sync = useSyncStore()
  const form = reactive({
    apiKey: '',
    apiSecret: '',
    accountId: '',
    startDate: '',
    timeZone: 'Europe/Madrid',
  })
  const destinations = shallowRef<Array<{ id: string; name: string }>>([])
  const configured = shallowRef(false)
  const connection = shallowRef<BitvavoConnectionState | null>(null)
  const busy = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  const preview = shallowRef<BitvavoPreview | null>(null)
  const resolutions = reactive<Record<string, string>>({})
  const canConfirm = computed(
    () =>
      Boolean(preview.value) &&
      preview.value!.operations.every(
        (op) =>
          op.alreadyImported || !op.candidates.length || resolutions[op.externalId] !== undefined,
      ),
  )

  function request<T = Record<string, unknown>>(
    body?: object,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
  ): Promise<T> {
    return runClientHttp(requestBitvavo<T>(body, method))
  }
  async function perform(work: () => Promise<void>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      await work()
    } catch (failure) {
      error.value =
        failure instanceof Error ? failure.message : 'No se pudo completar la operación.'
    } finally {
      busy.value = false
    }
  }
  async function refresh() {
    const result = await request<{
      configured: boolean
      destinations?: Array<{ id: string; name: string }>
      connection?: BitvavoConnectionState | null
    }>(undefined, 'GET')
    configured.value = result.configured
    destinations.value = result.destinations || []
    connection.value = result.connection ?? null
    if (result.connection)
      Object.assign(form, {
        accountId: result.connection.accountId,
        startDate: result.connection.startDate,
        timeZone: result.connection.timeZone,
      })
  }
  async function load() {
    await perform(refresh)
  }
  async function connect() {
    await perform(async () => {
      await sync.flush()
      // Empty key fields keep the stored credential.
      const { apiKey, apiSecret, ...settings } = form
      const replacing = Boolean(apiKey || apiSecret)
      await request({ ...settings, ...(replacing ? { apiKey, apiSecret } : {}) }, 'PUT')
      form.apiKey = ''
      form.apiSecret = ''
      preview.value = null
      await refresh()
      // A zone change rewrites the local date and time of imported movements.
      await sync.refreshFromServer()
      notice.value = replacing
        ? 'Conexión validada. Las credenciales se han cifrado en el servidor.'
        : 'Configuración guardada.'
    })
  }
  /** Runs a sync and always reloads the state, so a failure shows as the last attempt. */
  async function runSync(action: 'sync' | 'retrySkipped') {
    await perform(async () => {
      await sync.flush()
      try {
        const result = await request<{ counts: BitvavoSyncCounts }>({ action })
        await sync.refreshFromServer()
        const { created, updated, unchanged, skipped } = result.counts
        notice.value = `Sincronización completada: ${created} creadas, ${updated} actualizadas, ${unchanged} sin cambios y ${skipped} omitidas.`
      } finally {
        await refresh().catch(() => undefined)
      }
    })
  }
  const synchronize = () => runSync('sync')
  const retrySkipped = () => runSync('retrySkipped')
  async function disconnect() {
    await perform(async () => {
      await request(undefined, 'DELETE')
      configured.value = false
      connection.value = null
      preview.value = null
      notice.value = 'Bitvavo desconectado. Los movimientos importados se conservan.'
    })
  }
  async function generatePreview() {
    await perform(async () => {
      await sync.flush()
      const result = await request<BitvavoPreview>({ action: 'preview' })
      for (const key of Object.keys(resolutions)) delete resolutions[key]
      preview.value = result
    })
  }
  async function confirm() {
    if (!preview.value || !canConfirm.value) return
    await perform(async () => {
      const result = await request<{ imported: number }>({
        action: 'confirm',
        previewId: preview.value!.id,
        resolutions: Object.entries(resolutions).map(([externalId, choice]) => ({
          externalId,
          transactionId: choice || null,
        })),
      })
      await sync.refreshFromServer()
      notice.value = `${result.imported} movimientos importados. Los campos financieros están gobernados por Bitvavo.`
      preview.value = null
      await refresh()
    })
  }
  return {
    form,
    destinations,
    configured,
    connection,
    busy,
    error,
    notice,
    preview,
    resolutions,
    canConfirm,
    load,
    connect,
    generatePreview,
    confirm,
    synchronize,
    retrySkipped,
    disconnect,
  }
}
