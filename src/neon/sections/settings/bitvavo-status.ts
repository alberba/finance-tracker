import type { BitvavoConnectionState, SkippedOperation } from '../../../lib/bitvavo-types'
import { formatShortDate, formatStamp, formatTime } from '../../../lib/format'

/** The state of a connection that already imported, in one short phrase. */
export function bitvavoStatus(connection: BitvavoConnectionState): {
  label: string
  alert: boolean
} {
  if (connection.needsAttention) return { label: 'Requiere atención', alert: true }
  switch (connection.lastAttemptStatus) {
    case 'failed':
      return { label: 'Falló el último intento', alert: true }
    case 'warning':
      return { label: 'Sincronizada con omitidas', alert: false }
    case 'success':
      return { label: 'Sincronizada', alert: false }
    case 'attention':
      // The rejected key was replaced; the next sync confirms the new one.
      return { label: 'Clave reemplazada', alert: false }
    default:
      return { label: 'Sin sincronizar', alert: false }
  }
}

/** «26/09, 10:42», or a dash when it never happened. */
export function bitvavoStamp(instant: number | null): string {
  return instant == null ? '—' : formatStamp(new Date(instant).toISOString())
}

/** The four counters of the last correct sync, in a fixed order. */
export function bitvavoCounters(
  connection: BitvavoConnectionState,
): Array<{ label: string; value: number }> {
  const counts = connection.lastCounts ?? { created: 0, updated: 0, unchanged: 0, skipped: 0 }
  return [
    { label: 'Creadas', value: counts.created },
    { label: 'Actualizadas', value: counts.updated },
    { label: 'Sin cambios', value: counts.unchanged },
    { label: 'Omitidas', value: counts.skipped },
  ]
}

/** «1 ene 2020, 11:00» in the connection's zone, or «Fecha desconocida». */
export function skippedWhen(operation: SkippedOperation, timeZone: string): string {
  if (!operation.executedAt) return 'Fecha desconocida'
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone }).format(
    Date.parse(operation.executedAt),
  )
  return `${formatShortDate(date)}, ${formatTime(operation.executedAt, timeZone)}`
}
