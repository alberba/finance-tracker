import { Data, Effect } from 'effect'

import type { ResolvedAttachment } from './issue-report-schema'

const GITHUB_UPLOADS_URL = 'https://uploads.github.com/user-attachments/assets'

export class AttachmentUploadError extends Data.TaggedError('AttachmentUploadError')<{
  message: string
  status?: number
}> {}

export interface AttachmentUploadContext {
  fetch: typeof fetch
  /** Cabeceras de autenticación y de la API de GitHub, las mismas que el resto de llamadas. */
  headers: Record<string, string>
  /** Id numérico del repositorio. El llamador lo resuelve una vez por reporte. */
  repositoryId: number
}

/**
 * Sube un adjunto a GitHub y devuelve la URL del recurso. Devuelve `Effect` con
 * un error etiquetado: ni el alta del reporte ni el hilo manejan promesas
 * sueltas entre módulos (ADR-0006).
 */
export type AttachmentUploader = (
  attachment: ResolvedAttachment,
  context: AttachmentUploadContext,
) => Effect.Effect<string, AttachmentUploadError>

export const uploadIssueAttachment: AttachmentUploader = (attachment, context) =>
  Effect.gen(function* () {
    const url = new URL(GITHUB_UPLOADS_URL)
    url.searchParams.set('name', attachment.name)
    url.searchParams.set('content_type', attachment.contentType)
    url.searchParams.set('repository_id', String(context.repositoryId))

    const response = yield* Effect.tryPromise({
      try: () =>
        context.fetch(url, {
          method: 'POST',
          headers: {
            ...context.headers,
            'Content-Type': attachment.contentType,
          },
          body: new Blob([attachment.bytes], { type: attachment.contentType }),
        }),
      catch: (error) =>
        new AttachmentUploadError({
          message: error instanceof Error ? error.message : 'Error desconocido.',
        }),
    })
    if (!response.ok) {
      return yield* new AttachmentUploadError({
        message: `GitHub devolvió ${response.status}.`,
        status: response.status,
      })
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ href?: string; url?: string }>,
      catch: () => new AttachmentUploadError({ message: 'Respuesta inválida de GitHub.' }),
    })
    const resourceUrl = String(data.href || data.url || '')
    if (!resourceUrl) {
      return yield* new AttachmentUploadError({ message: 'Respuesta sin URL del adjunto.' })
    }
    return resourceUrl
  })
