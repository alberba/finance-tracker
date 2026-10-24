/**
 * GitHub issue creation for the in-app report form (ADR-0006).
 *
 * Returns `Effect<CreatedIssue, GithubIssueError, Http>`: retries and the
 * type-less fallback are composed, and HTTP enters through the `Http` service.
 */

import { Data, Effect } from 'effect'
import type { RuntimeEnv } from './cloudflare-env'
import { Http } from './http'
import type { IssueReportPayload } from './issue-report-schema'

export interface CreatedIssue {
  number: number
  url: string
}

const GITHUB_API_BASE = 'https://api.github.com'
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const TYPE_RETRY_STATUS = new Set([400, 403, 404, 422])
const MAX_RETRIES = 2
const RETRY_DELAY = '500 millis'

export type GithubIssueType = 'Bug' | 'Feature'

export class GithubIssueError extends Data.TaggedError('GithubIssueError')<{
  message: string
}> {}

function requiredVar(name: keyof RuntimeEnv, env: RuntimeEnv): Effect.Effect<string, GithubIssueError> {
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

export function buildIssueBody(payload: IssueReportPayload): string {
  const reportType = canonicalReportType(payload.type)
  const githubType = getGithubIssueType(payload.type)
  const baseLines = [
    '## Reporte desde la web',
    '',
    '### Resumen',
    payload.summary,
    '',
    '### Problema o solicitud',
    payload.description,
    '',
    '### Contexto de ejecución',
    `- Tipo: ${reportType}`,
    `- Tipo de reporte: ${reportType}`,
    `- Tipo de issue de GitHub: ${githubType}`,
    `- Se envió desde la sección: ${payload.section}`,
    `- Se envió desde la ruta: ${payload.context.pathname || 'n/a'}`,
    `- Navegador: ${payload.context.userAgent || 'n/a'}`,
    `- Fecha cliente: ${payload.context.timestamp || 'n/a'}`,
  ]

  if (payload.stepsToReproduce) {
    baseLines.push('', '## Pasos para reproducir', '', payload.stepsToReproduce)
  }

  if (payload.expectedResult) {
    baseLines.push('', '## Resultado esperado', '', payload.expectedResult)
  }

  if (payload.actualResult) {
    baseLines.push('', '## Resultado actual', '', payload.actualResult)
  }

  return baseLines.join('\n').trim()
}

export function buildIssueLabels(type: IssueReportPayload['type']): string[] {
  // Keep labels short and compatible with GitHub's default labels. The
  // structured issue type is sent separately in the request body.
  return ['source:web-report', 'status:triage', canonicalReportType(type)]
}

function postIssue(
  token: string,
  owner: string,
  repo: string,
  body: object,
): Effect.Effect<Response, GithubIssueError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    return yield* Effect.tryPromise({
      try: (signal) =>
        http.request(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'finance-tracker-web-reporter',
          },
          body: JSON.stringify(body),
          signal,
        }),
      catch: () => new GithubIssueError({ message: 'No se pudo contactar con GitHub.' }),
    })
  })
}

/** Retries only the statuses GitHub documents as transient. */
function postWithRetry(
  token: string,
  owner: string,
  repo: string,
  body: object,
): Effect.Effect<Response, GithubIssueError, Http> {
  return Effect.gen(function* () {
    let response = yield* postIssue(token, owner, repo, body)
    for (let attempt = 0; attempt < MAX_RETRIES && RETRYABLE_STATUS.has(response.status); attempt++) {
      yield* Effect.sleep(RETRY_DELAY)
      response = yield* postIssue(token, owner, repo, body)
    }
    return response
  })
}

export function createIssueFromWebReport(
  payload: IssueReportPayload,
  env: RuntimeEnv,
): Effect.Effect<CreatedIssue, GithubIssueError, Http> {
  return Effect.gen(function* () {
    const token = yield* requiredAnyVar(['GITHUB_ISSUE_TOKEN', 'GITHUB_TOKEN'], env)
    const owner = yield* requiredVar('GITHUB_OWNER', env)
    const repo = yield* requiredVar('GITHUB_REPO', env)
    const baseRequestBody = {
      title: payload.summary.slice(0, 140),
      body: buildIssueBody(payload),
      labels: buildIssueLabels(payload.type),
    }
    const requestBody = {
      ...baseRequestBody,
      // GitHub accepts the issue type by name. If the repository does not have
      // issue types enabled, the fallback below creates the issue without it.
      type: getGithubIssueType(payload.type),
    }

    let response = yield* postWithRetry(token, owner, repo, requestBody)

    if (!response.ok) {
      const details = yield* Effect.promise(() => response.text())

      // Some GitHub installations expose labels/issues but not structured issue
      // types. A type rejection must not prevent the report from being created.
      if (TYPE_RETRY_STATUS.has(response.status)) {
        response = yield* postWithRetry(token, owner, repo, baseRequestBody)
      }
      if (!response.ok) {
        // El cuerpo de GitHub queda del lado del servidor: el mensaje del error
        // viaja a Sentry con `reportApiRouteFailure` y no debe repetirlo.
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
