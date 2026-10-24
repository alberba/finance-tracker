import { computed, reactive, shallowRef } from 'vue'
import type { BitvavoPreview } from '../lib/bitvavo-types'
import { runClientHttp } from '../lib/client/runtime'
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

  async function request<T = Record<string, unknown>>(
    body?: object,
    method: 'GET' | 'POST' | 'PUT' = 'POST',
  ): Promise<T> {
    // The panel is opened on demand; keep its adapter out of the startup chunk.
    const { requestBitvavo } = await import('../lib/client/bitvavo-api')
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
  async function load() {
    await perform(async () => {
      const result = await request<{
        configured: boolean
        destinations?: Array<{ id: string; name: string }>
        connection?: { accountId: string; startDate: string; timeZone: string }
      }>(undefined, 'GET')
      configured.value = result.configured
      destinations.value = result.destinations || []
      if (result.connection)
        Object.assign(form, {
          accountId: result.connection.accountId,
          startDate: result.connection.startDate,
          timeZone: result.connection.timeZone,
        })
    })
  }
  async function connect() {
    await perform(async () => {
      await sync.flush()
      await request({ ...form }, 'PUT')
      form.apiKey = ''
      form.apiSecret = ''
      configured.value = true
      preview.value = null
      notice.value = 'Conexión validada. Las credenciales se han cifrado en el servidor.'
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
    })
  }
  return {
    form,
    destinations,
    configured,
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
  }
}
