/**
 * Cálculo de «novedades» de un reporte (#340): cuenta un cambio de estado y un
 * comentario nuevo del mantenedor. Los comentarios propios y los de la
 * automatización nunca cuentan.
 */

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export interface HasUpdatesInput {
  lastSeenAt: string
  statusChangedAt: string | null
  latestMaintainerCommentAt: string | null
}

/** `true` si lo último que pasó en el reporte es posterior a la última lectura. */
export function computeHasUpdates(input: HasUpdatesInput): boolean {
  const seenAt = timestamp(input.lastSeenAt)
  if (seenAt === null) return false

  const candidates = [timestamp(input.statusChangedAt), timestamp(input.latestMaintainerCommentAt)]
  return candidates.some((candidate) => candidate !== null && candidate > seenAt)
}
