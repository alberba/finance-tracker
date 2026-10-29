/**
 * Contrato compartido de «Mis reportes» (#340), usado por el servidor, el
 * cliente y la demo. Es puro: ni Effect, ni `window`, ni red.
 *
 * La identidad de una entrada es la issue **original** del reporte; cuando esa
 * issue se cierra como duplicada, `followed` apunta a la principal cuyo estado
 * e hilo se muestran.
 */

export type IssueState = 'OPEN' | 'CLOSED'
export type IssueStateReason = 'COMPLETED' | 'NOT_PLANNED' | 'DUPLICATE' | 'REOPENED' | null
/** Tono del punto de estado; el texto siempre lleva el significado. */
export type ReportStatusTone = 'warn' | 'gain' | 'neutral'

export interface ReportIssueRef {
  number: number
  url: string
  title: string
  state: IssueState
  stateReason: IssueStateReason
}

/** Nodo de GitHub que necesita el dominio para resolver una cadena de duplicadas. */
export interface IssueNode extends ReportIssueRef {
  repository: { nameWithOwner: string } | null
  duplicateOf?: IssueNode | null
}

interface ReportEntryBase {
  /** Número de la issue ORIGINAL: clave de la API y de la UI. */
  number: number
  /** ISO, de la tabla de propiedad. */
  submittedAt: string
  /** ISO, de la tabla; marca hasta dónde ha leído la persona. */
  lastSeenAt: string
  hasUpdates: boolean
}

export interface AvailableReportEntry extends ReportEntryBase, ReportIssueRef {
  unavailable?: false
  /** Presente solo cuando se sigue una principal (≥ 1 salto). */
  followed?: ReportIssueRef
  /** `DUPLICATE` sin principal utilizable: se conserva el estado original y se avisa. */
  duplicateLinkUnavailable?: boolean
  /** Último cierre o reapertura (original o seguida), ISO o `null`. */
  statusChangedAt: string | null
}

export interface UnavailableReportEntry extends ReportEntryBase {
  unavailable: true
}

export type ReportEntry = AvailableReportEntry | UnavailableReportEntry

export interface ThreadAttachment {
  name: string
  url: string
}

export interface ThreadItem {
  /** `databaseId` del comentario de GitHub. */
  id: number
  kind: 'reporter' | 'maintainer'
  /** «Tú» para el reportero o el login del mantenedor. */
  author: string
  createdAt: string
  editedAt: string | null
  /** Markdown sin cabecera, marcadores ni bloque de adjuntos. */
  text: string
  attachments: ThreadAttachment[]
  editable: boolean
}

export interface ReportDetail {
  report: ReportEntry
  /** La issue cuyo hilo se muestra: la original o la principal que se sigue. */
  threadIssue: ReportIssueRef | null
  /** Ascendente por fecha; el hilo completo, sin recortes. */
  thread: ThreadItem[]
  canComment: boolean
  /** Lo que la persona envió al crear el reporte; `null` si no se conserva. */
  original: string | null
  /** Cuerpo actual de la issue propia, sin contexto ni reportero; `null` si no aporta nada. */
  issueDescription: string | null
  /** ISO del servidor al empezar a leer; base de `markSeen` ([D4]). */
  fetchedAt: string
}

export interface ReportsListResponse {
  ok: true
  reports: ReportEntry[]
  hasMore: boolean
  /** Cursor opaco de la página siguiente; `null` en la última. */
  nextCursor: string | null
  /** Contador global de novedades; solo llega en la primera página. */
  unseenCount?: number
  fetchedAt: string
}

export interface ReportDetailResponse {
  ok: true
  detail: ReportDetail
}

export interface ReportCommentResponse {
  ok: true
  comment: ThreadItem
}

/** Respuesta de un alta de reporte: `tracked` dice si quedó en «Mis reportes». */
export interface ReportCreatedResponse {
  ok: true
  issueNumber: number
  issueUrl: string
  tracked: boolean
}
