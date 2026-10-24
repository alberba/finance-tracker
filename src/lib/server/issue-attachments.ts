import type { ResolvedAttachment } from './issue-report-schema'

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_UPLOADS_URL = 'https://uploads.github.com/user-attachments/assets'

export type AttachmentUploadResult = { ok: true; url: string } | { ok: false; error: string }

export interface AttachmentUploadContext {
  fetch: typeof fetch
  token: string
  owner: string
  repo: string
}

/**
 * Sube un adjunto a GitHub y devuelve la URL del recurso. Nunca lanza: un fallo
 * vuelve como `{ ok: false }` y lo decide el servicio de issues.
 */
export type AttachmentUploader = (
  attachment: ResolvedAttachment,
  context: AttachmentUploadContext,
) => Promise<AttachmentUploadResult>

/** El endpoint de adjuntos exige el id numérico del repositorio. */
async function fetchRepositoryId(context: AttachmentUploadContext): Promise<number> {
  const response = await context.fetch(
    `${GITHUB_API_BASE}/repos/${context.owner}/${context.repo}`,
    {
      headers: {
        Authorization: `Bearer ${context.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'finance-tracker-web-reporter',
      },
    },
  )
  if (!response.ok) {
    throw new Error(`No se pudo leer el repositorio (${response.status}).`)
  }
  const data = (await response.json()) as { id?: number }
  const id = Number(data.id)
  if (!Number.isFinite(id)) {
    throw new Error('Respuesta inválida al leer el repositorio.')
  }
  return id
}

export const uploadIssueAttachment: AttachmentUploader = async (attachment, context) => {
  try {
    const repositoryId = await fetchRepositoryId(context)
    const url = new URL(GITHUB_UPLOADS_URL)
    url.searchParams.set('name', attachment.name)
    url.searchParams.set('content_type', attachment.contentType)
    url.searchParams.set('repository_id', String(repositoryId))

    const response = await context.fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': attachment.contentType,
        'User-Agent': 'finance-tracker-web-reporter',
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
