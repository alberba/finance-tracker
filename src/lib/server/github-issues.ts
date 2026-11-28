/**
 * GitHub issue creation for the in-app report form (ADR-0006).
 *
 * Returns `Effect<CreatedIssue, GithubIssueError, Http>`: retries and the
 * type-less fallback are composed, and HTTP enters through the `Http` service.
 */

import { Data, Duration, Effect } from 'effect'
import {
  publicReportSummary,
  type ReportScreen,
  type ReportTopic,
} from '../../domain/reports/diagnostic'
import type { RuntimeEnv } from './cloudflare-env'
import { Http } from './http'
import { GITHUB_API_BASE, githubConfig, githubHeaders } from './github-api'
import type { IssueReportPayload } from './issue-report-schema'

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const TYPE_RETRY_STATUS = new Set([400, 403, 404, 422])
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

type ReportType = IssueReportPayload['type']

export class GithubIssueError extends Data.TaggedError('GithubIssueError')<{
  message: string
}> {}

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
  report: { type: ReportType; screen: ReportScreen; reference: string; topic?: ReportTopic },
  env: RuntimeEnv,
) {
  return Effect.gen(function* () {
    const { request } = yield* Http
    const { token, owner, repo } = yield* githubConfig(env).pipe(
      Effect.mapError((error) => new GithubIssueError({ message: error.message })),
    )
    const type = report.type === 'bug' ? 'Bug' : 'Feature'
    const title = publicReportSummary(report.type, report.screen, report.topic)
    const base = {
      title,
      body: `## Reporte desde la web\n\n${title}\n\nReferencia del caso: ${report.reference}\n\n<!-- web-report-private -->`,
      labels: ['source:web-report', 'needs-triage', type.toLowerCase()],
    }
    let response = yield* postWithRetry(request, token, owner, repo, { ...base, type })
    if (TYPE_RETRY_STATUS.has(response.status)) {
      response = yield* postWithRetry(request, token, owner, repo, base)
    }
    if (!response.ok) {
      return yield* new GithubIssueError({ message: `GitHub API devolvió ${response.status}.` })
    }
    const data = yield* Effect.promise(
      () =>
        response.json().catch(() => null) as Promise<{ number?: number; html_url?: string } | null>,
    )
    if (!Number.isSafeInteger(data?.number) || !data?.number || !data.html_url) {
      return yield* new GithubIssueError({
        message: 'Respuesta inválida al crear issue en GitHub.',
      })
    }
    return { number: data.number, url: data.html_url }
  })
}
