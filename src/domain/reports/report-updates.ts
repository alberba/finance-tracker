/**
 * Cálculo de «novedades» de un reporte (#340): cuenta un cambio de estado y un
 * comentario nuevo del mantenedor. Los comentarios propios y los de la
 * automatización nunca cuentan.
 */

import { classifyComment, type RawComment } from './reporter-comment'

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

export interface CommentWindow {
  /** Comentario del mantenedor más reciente posterior a `lastSeenAt`. */
  latestMaintainerAt: string | null
  /**
   * La página alcanzó un comentario anterior o igual a `lastSeenAt`, así que no
   * queda nada más nuevo por leer. Si es `false`, hay que pedir la página
   * anterior del hilo.
   */
  covered: boolean
}

/**
 * Lee una página de comentarios (la más reciente que se conozca) y dice si
 * dentro de ella hay un aviso del mantenedor posterior a la última lectura o si
 * hace falta seguir paginando hacia atrás. Sin tope fijo: la ventana se agota
 * cuando aparece un comentario ya visto.
 */
export function scanCommentWindow(
  comments: readonly RawComment[],
  lastSeenAt: string,
  context: { userId: string; botLogin: string },
): CommentWindow {
  const seenAt = timestamp(lastSeenAt)
  if (seenAt === null) return { latestMaintainerAt: null, covered: true }

  let latestMaintainerAt: string | null = null
  let covered = comments.length === 0

  for (const comment of comments) {
    const createdAt = timestamp(comment.createdAt)
    if (createdAt !== null && createdAt <= seenAt) covered = true
    if (classifyComment(comment, context) !== 'maintainer') continue
    if (createdAt === null || createdAt <= seenAt) continue
    const previous = timestamp(latestMaintainerAt)
    if (previous === null || createdAt > previous) latestMaintainerAt = comment.createdAt
  }

  return { latestMaintainerAt, covered: covered || latestMaintainerAt !== null }
}
