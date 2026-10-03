import { computed, reactive, shallowRef } from 'vue'
import type { BitvavoPreview } from '../lib/bitvavo-types'
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

  async function request(body?: object, method = 'POST') {
    const response = await fetch('/api/integrations/bitvavo', {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.error || 'No se pudo completar la operación con Bitvavo.')
    return result
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
      const result = await request(undefined, 'GET')
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
      const result = await request({ action: 'preview' })
      for (const key of Object.keys(resolutions)) delete resolutions[key]
      preview.value = result
    })
  }
  async function confirm() {
    if (!preview.value || !canConfirm.value) return
    await perform(async () => {
      const result = await request({
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
