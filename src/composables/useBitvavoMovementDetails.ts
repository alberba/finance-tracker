import { computed, shallowRef } from 'vue'
import { useSyncStore } from '../stores/sync'
import { resolveEntityId } from '../lib/client/command-mapping'
import { runClientHttp } from '../lib/client/runtime'
import { requestBitvavo } from '../lib/client/bitvavo-api'
import type { Transaction } from '../scripts/types'

export function useBitvavoMovementDetails(transaction: () => Transaction) {
  const open = shallowRef(false)
  const instrumentId = shallowRef('')
  const busy = shallowRef(false)
  const error = shallowRef('')
  const instruments = shallowRef<Array<{ id: string; symbol: string; name: string | null }>>([])
  const sync = useSyncStore()
  const options = computed(() => [
    { value: '', label: 'Selecciona un instrumento' },
    ...instruments.value.map((instrument) => ({
      value: instrument.id,
      label: `${instrument.symbol} · ${instrument.name}`,
    })),
  ])
  async function show() {
    open.value = true
    error.value = ''
    try {
      const body = await runClientHttp(
        requestBitvavo<{ instruments: Array<{ id: string; symbol: string; name: string | null }> }>(
          undefined,
          'GET',
        ),
      )
      instruments.value = body.instruments
    } catch (failure) {
      error.value =
        failure instanceof Error ? failure.message : 'No se pudieron cargar los instrumentos.'
    }
  }
  async function link() {
    busy.value = true
    error.value = ''
    try {
      const transactionId = await resolveEntityId('transaction', transaction().id)
      // Instruments use their own catalog identity in the server bootstrap.
      const instrument = instruments.value.find((item) => item.id === instrumentId.value)
      if (!transactionId || !instrument) throw new Error('Selecciona un instrumento disponible.')
      await runClientHttp(
        requestBitvavo({
          action: 'linkInstrument',
          transactionId,
          instrumentId: instrument.id,
        }),
      )
      await sync.refreshFromServer()
      open.value = false
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'No se pudo vincular.'
    } finally {
      busy.value = false
    }
  }
  return { open, instrumentId, busy, error, options, show, link }
}
