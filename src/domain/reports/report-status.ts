/**
 * Resolución y descripción del estado de un reporte (#340).
 *
 * GitHub es la fuente de verdad. Una issue cerrada como duplicada sigue a su
 * principal hasta tres saltos, y solo por campos nativos (`state`,
 * `stateReason`, `duplicateOf`): el texto o los labels nunca producen una
 * duplicada.
 */

import type { IssueNode, ReportEntry, ReportIssueRef, ReportStatusTone } from './report-entry'

export const MAX_DUPLICATE_HOPS = 3

export interface ResolveFollowedResult {
  /** Última issue accesible de la cadena; ausente cuando no hay saltos. */
  followed?: IssueNode
  /** La cadena está rota: principal ausente, de otro repositorio o cíclica. */
  duplicateLinkUnavailable: boolean
}

function sameRepository(node: IssueNode, ownerRepo: string): boolean {
  return node.repository?.nameWithOwner?.toLowerCase() === ownerRepo.toLowerCase()
}

/**
 * Recorre `duplicateOf` mientras la issue actual esté cerrada como duplicada.
 * Se corta a los tres saltos: la última alcanzada se muestra con su estado, sin
 * considerarlo un enlace roto. Si un salto no se puede seguir (principal
 * ausente, de otro repositorio o cíclica), la entrada vuelve a la issue original
 * y conserva su estado: nunca se muestra un eslabón intermedio como destino.
 */
export function resolveFollowed<T extends IssueNode>(
  root: T,
  ownerRepo: string,
): ResolveFollowedResult & { followed?: T } {
  let current: T = root
  const visited = new Set([root.number])
  let hops = 0
  let duplicateLinkUnavailable = false

  while (
    hops < MAX_DUPLICATE_HOPS &&
    current.state === 'CLOSED' &&
    current.stateReason === 'DUPLICATE'
  ) {
    const next = current.duplicateOf
    if (!next || !sameRepository(next, ownerRepo) || visited.has(next.number)) {
      duplicateLinkUnavailable = true
      break
    }
    current = next as T
    visited.add(next.number)
    hops += 1
  }

  if (duplicateLinkUnavailable) {
    return { duplicateLinkUnavailable: true }
  }

  return {
    ...(hops > 0 ? { followed: current } : {}),
    duplicateLinkUnavailable: false,
  }
}

/** Palabra corta del estado de una issue (sin el prefijo «Cerrado ·»). */
export function issueStateWord(issue: ReportIssueRef): string {
  if (issue.state === 'OPEN') return 'Abierto'
  if (issue.stateReason === 'COMPLETED') return 'Completado'
  if (issue.stateReason === 'NOT_PLANNED') return 'No planificado'
  if (issue.stateReason === 'DUPLICATE') return 'Cerrado como duplicado'
  return 'Cerrado'
}

export function toIssueRef(node: IssueNode): ReportIssueRef {
  return {
    number: node.number,
    url: node.url,
    title: node.title,
    state: node.state,
    stateReason: node.stateReason,
  }
}

function toneFor(state: ReportIssueRef['state'] | ReportIssueRef['stateReason']): ReportStatusTone {
  if (state === 'OPEN') return 'warn'
  if (state === 'COMPLETED') return 'gain'
  return 'neutral'
}

/** Titular, dato secundario y aviso de una entrada o de un estado de issue. */
export interface ReportStatusDescription {
  headline: string
  secondary: string | null
  /** Issue cuyo estado se muestra (la seguida si existe). */
  state: ReportIssueRef | null
  tone: ReportStatusTone
  warning: string | null
}

function describeIssue(issue: ReportIssueRef): ReportStatusDescription {
  const reason = issue.stateReason
  if (issue.state === 'OPEN') {
    return {
      headline: 'Abierto',
      secondary: null,
      state: issue,
      tone: 'warn',
      warning: null,
    }
  }
  if (reason === 'COMPLETED') {
    return {
      headline: 'Cerrado · Completado',
      secondary: null,
      state: issue,
      tone: 'gain',
      warning: null,
    }
  }
  if (reason === 'NOT_PLANNED') {
    return {
      headline: 'Cerrado · No planificado',
      secondary: null,
      state: issue,
      tone: 'neutral',
      warning: null,
    }
  }
  if (reason === 'DUPLICATE') {
    return {
      headline: 'Cerrado como duplicado',
      secondary: null,
      state: issue,
      tone: 'neutral',
      warning: null,
    }
  }
  return {
    headline: 'Cerrado',
    secondary: null,
    state: issue,
    tone: 'neutral',
    warning: null,
  }
}

/** Única fuente de los textos de estado, compartida por lista, detalle y demo. */
export function describeReportStatus(entry: ReportEntry): ReportStatusDescription {
  if (entry.unavailable) {
    return {
      headline: `Reporte #${entry.number}`,
      secondary: null,
      state: null,
      tone: 'neutral',
      warning: 'Este reporte ya no está disponible en GitHub',
    }
  }

  if (entry.followed) {
    const followed: ReportIssueRef = entry.followed
    return {
      headline: `Se sigue en #${followed.number}`,
      secondary: `#${entry.number} · Cerrado como duplicado`,
      state: followed,
      tone: toneFor(followed.state === 'OPEN' ? 'OPEN' : followed.stateReason),
      warning: entry.duplicateLinkUnavailable
        ? 'El enlace a la principal no está disponible.'
        : null,
    }
  }

  const original = describeIssue(entry)
  if (entry.duplicateLinkUnavailable) {
    return { ...original, warning: 'El enlace a la principal no está disponible.' }
  }
  return original
}

/** Entrada a partir del nodo original y su seguimiento ya resuelto. */
export function buildAvailableEntry(
  root: IssueNode,
  resolved: ResolveFollowedResult,
  base: {
    submittedAt: string
    lastSeenAt: string
    hasUpdates: boolean
    statusChangedAt: string | null
  },
): ReportEntry {
  return {
    ...toIssueRef(root),
    ...base,
    ...(resolved.followed ? { followed: toIssueRef(resolved.followed) } : {}),
    ...(resolved.duplicateLinkUnavailable ? { duplicateLinkUnavailable: true } : {}),
  }
}
