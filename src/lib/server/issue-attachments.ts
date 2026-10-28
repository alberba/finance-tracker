import type { ResolvedAttachment } from './issue-report-schema'

const GITHUB_UPLOADS_URL = 'https://uploads.github.com/user-attachments/assets'

export type AttachmentUploadResult = { ok: true; url: string } | { ok: false; error: string }

export interface AttachmentUploadContext {
  fetch: typeof fetch
  /** Cabeceras de autenticación y de la API de GitHub, las mismas que el resto de llamadas. */
  headers: Record<string, string>
  /** Id numérico del repositorio. El llamador lo resuelve una vez por reporte. */
  repositoryId: number
}

/**
 * Sube un adjunto a GitHub y devuelve la URL del recurso. Nunca lanza: un fallo
 * vuelve como `{ ok: false }` y lo decide el servicio de issues.
 */
export type AttachmentUploader = (
  attachment: ResolvedAttachment,
  context: AttachmentUploadContext,
) => Promise<AttachmentUploadResult>

export const uploadIssueAttachment: AttachmentUploader = async (attachment, context) => {
  try {
    const url = new URL(GITHUB_UPLOADS_URL)
    url.searchParams.set('name', attachment.name)
    url.searchParams.set('content_type', attachment.contentType)
    url.searchParams.set('repository_id', String(context.repositoryId))

    const response = await context.fetch(url, {
      method: 'POST',
      headers: {
        ...context.headers,
        'Content-Type': attachment.contentType,
      },
      body: new Blob([attachment.bytes], { type: attachment.contentType }),
    })
    if (!response.ok) {
      return { ok: false, error: `GitHub devolvió ${response.status}.` }
    }

    const data = (await response.json()) as { href?: string; url?: string }
    const resourceUrl = String(data.href || data.url || '')
    if (!resourceUrl) {
      return { ok: false, error: 'Respuesta sin URL del adjunto.' }
    }
    return { ok: true, url: resourceUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.'
    return { ok: false, error: message }
  }
}
