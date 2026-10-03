import { computed, shallowRef } from 'vue'
import { useSyncStore } from '../stores/sync'
import { resolveEntityId } from '../lib/client/command-mapping'
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
      const response = await fetch('/api/integrations/bitvavo')
      if (!response.ok) throw new Error('No se pudieron cargar los instrumentos.')
      instruments.value = (await response.json()).instruments
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
      const response = await fetch('/api/integrations/bitvavo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'linkInstrument',
          transactionId,
          instrumentId: instrument.id,
        }),
      })
      if (!response.ok) throw new Error((await response.json()).error || 'No se pudo vincular.')
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
