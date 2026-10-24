/**
 * GitHub issue creation for the in-app report form (ADR-0006).
 *
 * Returns `Effect<CreatedIssue, GithubIssueError, Http>`: retries and the
 * type-less fallback are composed, and HTTP enters through the `Http` service.
 * Attachments, duplicate checking and the auxiliary-failure reporter stay
 * injectable for the tests, as they were before the migration.
 */

import { Data, Duration, Effect } from 'effect'
import type { RuntimeEnv } from './cloudflare-env'
import { reportReportSideFailure, type ReportSideFailureReporter } from './error-tracking'
import { Http } from './http'
import {
  checkIssueDuplicate,
  type IssueDuplicateChecker,
  type IssueDuplicateResult,
} from './issue-duplicate-checker'
import {
  uploadIssueAttachment,
  type AttachmentUploadContext,
  type AttachmentUploader,
  type AttachmentUploadResult,
} from './issue-attachments'
import type { IssueReportPayload } from './issue-report-schema'

export interface CreatedIssue {
  number: number
  url: string
  duplicate?: boolean
}

export interface GithubIssueClient {
  /** Subidor de adjuntos. Por defecto, el que habla con la API real de GitHub. */
  uploadAttachment?: AttachmentUploader
  /** Comprobación semántica previa; la redacción se ejecuta en GitHub Actions. */
  checkDuplicate?: IssueDuplicateChecker
  /** Aviso de los fallos auxiliares (subidas). Por defecto, Sentry; los tests inyectan un stub. */
  reportFailure?: ReportSideFailureReporter
}

/** Resultado de subir un adjunto, con el nombre que se muestra en la issue. */
export interface AttachmentOutcome {
  name: string
  result: AttachmentUploadResult
}

/**
 * Quien envía el reporte, tomado del principal autenticado en el servidor.
 * Nunca viene del payload del cliente.
 */
export interface IssueReporter {
  userId: string
  email: string | null
  name: string | null
}

const GITHUB_API_BASE = 'https://api.github.com'
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const TYPE_RETRY_STATUS = new Set([400, 403, 404, 422])
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

export type GithubIssueType = 'Bug' | 'Feature'

export class GithubIssueError extends Data.TaggedError('GithubIssueError')<{
  message: string
}> {}

/** Cabeceras de todas las llamadas a la API de GitHub de este servicio. */
function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'finance-tracker-web-reporter',
  }
}

/** El endpoint de adjuntos exige el id numérico del repositorio. */
async function fetchRepositoryId(
  request: typeof fetch,
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<number> {
  const response = await request(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers })
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

/** Ejecuta `fn` una sola vez y reutiliza su promesa en las llamadas siguientes. */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => (pending ??= fn())
}

function requiredVar(
  name: keyof RuntimeEnv,
  env: RuntimeEnv,
): Effect.Effect<string, GithubIssueError> {
  const value = String(env[name] || '').trim()
  return value
    ? Effect.succeed(value)
    : Effect.fail(new GithubIssueError({ message: `Falta variable de entorno requerida: ${name}` }))
}

function requiredAnyVar(
  names: ReadonlyArray<keyof RuntimeEnv>,
  env: RuntimeEnv,
): Effect.Effect<string, GithubIssueError> {
  for (const name of names) {
    const value = String(env[name] || '').trim()
    if (value) return Effect.succeed(value)
  }
  return Effect.fail(
    new GithubIssueError({ message: `Falta variable de entorno requerida: ${names.join(' o ')}` }),
  )
}

function canonicalReportType(type: IssueReportPayload['type']): 'bug' | 'feature' {
  return type === 'bug' ? 'bug' : 'feature'
}

export function getGithubIssueType(type: IssueReportPayload['type']): GithubIssueType {
  return canonicalReportType(type) === 'bug' ? 'Bug' : 'Feature'
}

function attachmentLines(outcomes: AttachmentOutcome[]): string[] {
  const lines = ['### Adjuntos']
  for (const { name, result } of outcomes) {
    // Los corchetes romperían la referencia Markdown; el nombre solo es alt text.
    const alt = name.replace(/[[\]()]/g, '')
    lines.push(
      result.ok
        ? `![${alt}](${result.url})`
        : `- ${alt}: no se pudo subir a GitHub; el reporte se creó sin esta imagen.`,
    )
  }
  return [...lines, '']
}

export function buildIssueBody(
  payload: IssueReportPayload,
  reporter: IssueReporter,
  attachments: AttachmentOutcome[] = [],
): string {
  const reportType = canonicalReportType(payload.type)
  const githubType = getGithubIssueType(payload.type)
  const lines = ['## Reporte desde la web', '', '### Resumen', payload.summary, '']

  // Sin descripción no se escribe el encabezado: una sección vacía ensucia la issue.
  if (payload.description) {
    lines.push('### Problema o solicitud', payload.description, '')
  }

  if (attachments.length > 0) {
    lines.push(...attachmentLines(attachments))
  }

  lines.push(
    '### Contexto de ejecución',
    `- Tipo: ${reportType}`,
    `- Tipo de reporte: ${reportType}`,
    `- Tipo de issue de GitHub: ${githubType}`,
    `- Se envió desde la sección: ${payload.section}`,
    `- Se envió desde la ruta: ${payload.context.pathname || 'n/a'}`,
    `- Navegador: ${payload.context.userAgent || 'n/a'}`,
    `- Fecha cliente: ${payload.context.timestamp || 'n/a'}`,
    '',
    '### Reportero',
    `- Nombre: ${reporter.name || 'n/a'}`,
    `- Email: ${reporter.email || 'n/a'}`,
    `- Identificador: ${reporter.userId}`,
  )

  return lines.join('\n').trim()
}

export function buildIssueLabels(type: IssueReportPayload['type']): string[] {
  // Keep labels short and compatible with GitHub's default labels. The
  // structured issue type is sent separately in the request body.
  return ['source:web-report', 'needs-triage', canonicalReportType(type)]
}

/** Motivo fijo para Sentry: solo el estado HTTP, nunca el texto libre del error. */
function uploadFailureReason(error: string): string {
  const status = /^GitHub devolvió (\d{3})\./.exec(error)?.[1]
  return status ? `http-${status}` : 'failed'
}

async function uploadAttachments(
  attachments: NonNullable<IssueReportPayload['attachments']>,
  uploader: AttachmentUploader,
  context: AttachmentUploadContext,
  reportFailure: ReportSideFailureReporter,
): Promise<AttachmentOutcome[]> {
  const outcomes: AttachmentOutcome[] = []
  for (const attachment of attachments) {
    let result: AttachmentUploadResult
    try {
      result = await uploader(attachment, context)
    } catch {
      // El subidor no debería lanzar; si lo hace, el reporte sigue adelante.
      result = { ok: false, error: 'Fallo inesperado al subir.' }
    }
    if (!result.ok) {
      // Solo el motivo corto: sin cuerpos de respuesta de GitHub, como el resto de logs.
      console.error('[github] Adjunto no subido', result.error)
      reportFailure({ stage: 'upload', reason: uploadFailureReason(result.error) })
    }
    outcomes.push({ name: attachment.name, result })
  }
  return outcomes
}

/**
 * La comprobación de duplicadas nunca bloquea el reporte: si algo falla, la issue se crea
 * con el texto original. Los comprobadores ya registran sus fallos; este catch cubre
 * solo un comprobador que lance pese al contrato.
 */
async function findDuplicate(
  payload: IssueReportPayload,
  env: RuntimeEnv,
  checkDuplicate: IssueDuplicateChecker,
  reportFailure: ReportSideFailureReporter,
): Promise<IssueDuplicateResult | null> {
  try {
    return await checkDuplicate(
      {
        type: canonicalReportType(payload.type),
        summary: payload.summary,
        description: payload.description,
        section: payload.section,
        pathname: payload.context.pathname,
      },
      env,
    )
  } catch {
    console.error('[github] La comprobación de duplicadas se omitió por un fallo inesperado.')
    reportFailure({ stage: 'duplicate', reason: 'unexpected' })
    return null
  }
}

function postIssue(
  request: typeof fetch,
  token: string,
  owner: string,
  repo: string,
  body: object,
): Effect.Effect<Response, GithubIssueError> {
  return Effect.tryPromise({
    try: (signal) =>
      request(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
    catch: () => new GithubIssueError({ message: 'No se pudo contactar con GitHub.' }),
  })
}

/** Retries only the statuses GitHub documents as transient. */
function postWithRetry(
  request: typeof fetch,
  token: string,
  owner: string,
  repo: string,
  body: object,
): Effect.Effect<Response, GithubIssueError> {
  return Effect.gen(function* () {
    let response = yield* postIssue(request, token, owner, repo, body)
    let attempt = 0
    while (attempt < MAX_RETRIES && RETRYABLE_STATUS.has(response.status)) {
      yield* Effect.sleep(Duration.millis(RETRY_DELAY_MS * (attempt + 1)))
      response = yield* postIssue(request, token, owner, repo, body)
      attempt += 1
    }
    return response
  })
}

export function createIssueFromWebReport(
  payload: IssueReportPayload,
  reporter: IssueReporter,
  env: RuntimeEnv,
  client: GithubIssueClient = {},
): Effect.Effect<CreatedIssue, GithubIssueError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const token = yield* requiredAnyVar(['GITHUB_ISSUE_TOKEN', 'GITHUB_TOKEN'], env)
    const owner = yield* requiredVar('GITHUB_OWNER', env)
    const repo = yield* requiredVar('GITHUB_REPO', env)
    const headers = githubHeaders(token)
    const uploadAttachment = client.uploadAttachment ?? uploadIssueAttachment
    const checkDuplicate = client.checkDuplicate ?? checkIssueDuplicate
    const reportFailure = client.reportFailure ?? reportReportSideFailure
    const title = payload.summary.slice(0, 140)
    const labels = buildIssueLabels(payload.type)

    const duplicate = yield* Effect.promise(() =>
      findDuplicate(payload, env, checkDuplicate, reportFailure),
    )
    if (duplicate) {
      return { ...duplicate, duplicate: true }
    }

    // Los adjuntos se suben antes de crear la issue para poder referenciarlos en
    // el cuerpo. Un fallo de subida queda anotado en el cuerpo, nunca bloquea.
    // El id del repositorio se lee como mucho una vez por reporte, aunque haya varios adjuntos.
    const outcomes = yield* Effect.promise(() =>
      uploadAttachments(
        payload.attachments ?? [],
        uploadAttachment,
        {
          fetch: http.request,
          headers,
          repositoryId: once(() => fetchRepositoryId(http.request, owner, repo, headers)),
        },
        reportFailure,
      ),
    )

    const baseRequestBody = {
      title,
      body: buildIssueBody(payload, reporter, outcomes),
      labels,
    }
    const requestBody = {
      ...baseRequestBody,
      // GitHub accepts the issue type by name. If the repository does not have
      // issue types enabled, the fallback below creates the issue without it.
      type: getGithubIssueType(payload.type),
    }

    let response = yield* postWithRetry(http.request, token, owner, repo, requestBody)

    if (!response.ok) {
      if (TYPE_RETRY_STATUS.has(response.status)) {
        response = yield* postWithRetry(http.request, token, owner, repo, baseRequestBody)
      }
      if (!response.ok) {
        // El cuerpo de GitHub queda del lado del servidor: el mensaje del error
        // viaja a Sentry con `reportApiRouteFailure` y no debe repetirlo.
        const details = yield* Effect.promise(() => response.text())
        console.error(`[github] GitHub API devolvió ${response.status}`, details.slice(0, 500))
        return yield* new GithubIssueError({
          message: `GitHub API devolvió ${response.status}.`,
        })
      }
    }

    const data = yield* Effect.promise(
      () =>
        response.json().catch(() => null) as Promise<{
          number?: number
          html_url?: string
        } | null>,
    )
    const issueNumber = Number(data?.number)
    const issueUrl = String(data?.html_url || '')
    if (!Number.isFinite(issueNumber) || !issueUrl) {
      return yield* new GithubIssueError({ message: 'Respuesta inválida al crear issue en GitHub.' })
    }

    return { number: issueNumber, url: issueUrl }
  })
}
