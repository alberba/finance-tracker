/**
 * Marcadores y clasificación de los comentarios de un reporte (#340).
 *
 * Las aclaraciones se publican con el token del bot, así que su autoría real
 * vive en un marcador oculto. Un comentario solo es «Tú» cuando el marcador
 * coincide con el principal autenticado **y** el autor es el login del bot
 * ([D1]): el marcador por sí solo es público y falsificable.
 */

export const REPORTER_MARKER_PREFIX = '<!-- finance-tracker:reporter-comment user='
export const REPORTER_ATTACHMENTS_MARKER = '<!-- finance-tracker:reporter-attachments -->'
export const REPORTER_HEADER = '**Aclaración del reportero**'
export const AUTOMATION_MARKERS = ['<!-- web-report-agent-brief -->', '<!-- web-report-enriched -->']

/** Mismos límites que el formulario de alta. */
export const REPORTER_COMMENT_MAX_LENGTH = 4000
export const REPORTER_COMMENT_MAX_ATTACHMENTS = 3

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const MARKER_PATTERN = /^<!-- finance-tracker:reporter-comment user=([^\s>]+) -->\r?\n?/
const ATTACHMENT_LINE_PATTERN = /^!\[([^\]]*)\]\(([^)\s]+)\)$/

export interface RawCommentAuthor {
  login: string
  /** REST devuelve `type: 'Bot'`; GraphQL, `__typename: 'Bot'`. */
  type?: string
  __typename?: string
}

export interface RawComment {
  databaseId: number
  createdAt: string
  updatedAt?: string
  body: string
  author: RawCommentAuthor | null
}

export interface ReporterComment {
  userId: string
  text: string
  attachments: Array<{ name: string; url: string }>
}

/** Neutraliza los marcadores ocultos y las menciones del texto de la persona ([D2]). */
export function sanitizeReporterText(text: string): string {
  return text.replace(/<!--/g, '&lt;!--').replace(/@(?=[A-Za-z0-9_-])/g, '@\u200b')
}

export function desanitizeReporterText(text: string): string {
  return text.replace(/&lt;!--/g, '<!--').replace(/@\u200b/g, '@')
}

function attachmentAlt(name: string): string {
  return name.replace(/[[\]()]/g, '').trim() || 'adjunto'
}

export function buildReporterCommentBody(input: {
  userId: string
  text: string
  attachments?: Array<{ name: string; url: string }>
}): string {
  const lines = [
    `${REPORTER_MARKER_PREFIX}${input.userId} -->`,
    REPORTER_HEADER,
    '',
    sanitizeReporterText(input.text.trim()),
  ]

  if (input.attachments?.length) {
    lines.push('', REPORTER_ATTACHMENTS_MARKER)
    for (const attachment of input.attachments.slice(0, REPORTER_COMMENT_MAX_ATTACHMENTS)) {
      lines.push(`![${attachmentAlt(attachment.name)}](${attachment.url})`)
    }
  }

  return lines.join('\n').trim()
}

function isAllowedAttachmentUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (url.hostname === 'github.com') return url.pathname.startsWith('/user-attachments/')
    return url.hostname === 'githubusercontent.com' || url.hostname.endsWith('.githubusercontent.com')
  } catch {
    return false
  }
}

/** Devuelve `null` si el cuerpo no empieza por el marcador de aclaración. */
export function parseReporterComment(body: string): ReporterComment | null {
  const source = body ?? ''
  if (!source.startsWith(REPORTER_MARKER_PREFIX)) return null
  const marker = MARKER_PATTERN.exec(source)
  if (!marker) return null

  const userId = marker[1]
  if (!USER_ID_PATTERN.test(userId)) return null

  let rest = source.slice(marker[0].length)
  // La cabecera visible es tolerante: se elimina si está en la primera línea.
  if (rest.startsWith(REPORTER_HEADER)) {
    rest = rest.slice(REPORTER_HEADER.length).replace(/^\r?\n?/, '')
  }

  const markerIndex = rest.lastIndexOf(REPORTER_ATTACHMENTS_MARKER)
  const textPart = markerIndex === -1 ? rest : rest.slice(0, markerIndex)
  const attachmentPart = markerIndex === -1 ? '' : rest.slice(markerIndex + REPORTER_ATTACHMENTS_MARKER.length)

  const attachments: Array<{ name: string; url: string }> = []
  for (const line of attachmentPart.split(/\r?\n/)) {
    if (attachments.length >= REPORTER_COMMENT_MAX_ATTACHMENTS) break
    const match = ATTACHMENT_LINE_PATTERN.exec(line.trim())
    if (!match) continue
    const [, name, url] = match
    if (!isAllowedAttachmentUrl(url)) continue
    attachments.push({ name: name || 'adjunto', url })
  }

  return {
    userId,
    text: desanitizeReporterText(textPart.trim()),
    attachments,
  }
}

export type CommentKind = 'automation' | 'mine' | 'maintainer' | 'hidden'

function isAutomation(comment: RawComment): boolean {
  const author = comment.author
  if (author?.type === 'Bot' || author?.__typename === 'Bot') return true
  return AUTOMATION_MARKERS.some((marker) => comment.body.includes(marker))
}

/**
 * Clasificación: primero manda el marcador de aclaración (el texto de la
 * persona neutraliza los marcadores de automatización, así que no pueden
 * colisionar); después, la automatización; el resto es del mantenedor.
 */
export function classifyComment(
  comment: RawComment,
  context: { userId: string; botLogin: string },
): CommentKind {
  const parsed = parseReporterComment(comment.body)
  if (parsed) {
    const isOwn = parsed.userId === context.userId
    const isBotAuthor = comment.author?.login === context.botLogin
    return isOwn && isBotAuthor ? 'mine' : 'hidden'
  }

  if (isAutomation(comment)) return 'automation'

  return 'maintainer'
}
