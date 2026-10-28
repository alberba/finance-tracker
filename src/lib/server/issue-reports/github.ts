/**
 * Cliente de GitHub del seguimiento de reportes (#340).
 *
 * GraphQL para estado nativo (`state`, `stateReason`, `duplicateOf`) e hilo;
 * REST para leer, crear, editar y borrar comentarios. Todas las llamadas tienen
 * un plazo de 8 s; solo se reintentan las lecturas.
 */

import { Duration, Effect } from 'effect'

import type { IssueNode, IssueState, IssueStateReason } from '../../../domain/reports/report-entry'
import type { RawComment } from '../../../domain/reports/reporter-comment'
import { GITHUB_API_BASE, githubHeaders, type GithubConfig } from '../github-api'
import { Http } from '../http'
import { ReportsGithubError } from './errors'

const REQUEST_TIMEOUT_MS = 8_000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

export interface GraphIssueNode extends IssueNode {
  statusChangedAt: string | null
  recentComments: RawComment[]
}

interface GraphIssuePayload {
  number?: number
  url?: string
  title?: string
  state?: string
  stateReason?: string | null
  repository?: { nameWithOwner?: string } | null
  timelineItems?: { nodes?: Array<{ __typename?: string; createdAt?: string }> }
  comments?: { nodes?: RawCommentPayload[] }
  duplicateOf?: GraphIssuePayload | null
}

interface RawCommentPayload {
  databaseId?: number
  createdAt?: string
  updatedAt?: string
  body?: string
  author?: { __typename?: string; login?: string } | null
}

interface GraphqlBody {
  data?: { repository?: Record<string, GraphIssuePayload | null> | null } | null
  errors?: Array<{ type?: string; path?: Array<string | number>; message?: string }>
}

const ISSUE_FIELDS = `number url title state stateReason
  repository { nameWithOwner }
  timelineItems(last: 1, itemTypes: [CLOSED_EVENT, REOPENED_EVENT]) {
    nodes { __typename ... on ClosedEvent { createdAt } ... on ReopenedEvent { createdAt } }
  }`

const RECENT_COMMENTS = `comments(last: 5) {
    nodes { databaseId createdAt body author { __typename login } }
  }`

function graphqlError(message: string, status?: number): ReportsGithubError {
  return new ReportsGithubError({ message, ...(status === undefined ? {} : { status }) })
}

function issueNode(payload: GraphIssuePayload | null): GraphIssueNode | null {
  if (!payload || typeof payload.number !== 'number' || !payload.url) return null
  const comments = payload.comments?.nodes ?? []
  return {
    number: payload.number,
    url: payload.url,
    title: payload.title ?? '',
    state: (payload.state === 'CLOSED' ? 'CLOSED' : 'OPEN') as IssueState,
    stateReason: (payload.stateReason as IssueStateReason) ?? null,
    repository: payload.repository?.nameWithOwner
      ? { nameWithOwner: payload.repository.nameWithOwner }
      : null,
    statusChangedAt: payload.timelineItems?.nodes?.[0]?.createdAt ?? null,
    recentComments: comments
      .filter((comment) => typeof comment.databaseId === 'number' && typeof comment.body === 'string')
      .map((comment) => ({
        databaseId: comment.databaseId as number,
        createdAt: comment.createdAt ?? '',
        body: comment.body as string,
        author: comment.author?.login
          ? { login: comment.author.login, __typename: comment.author.__typename }
          : null,
      })),
    ...(payload.duplicateOf ? { duplicateOf: issueNode(payload.duplicateOf) } : {}),
  }
}

function withTimeout(request: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  return request(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

/** Una lectura: reintenta solo los estados transitorios que GitHub documenta. */
function readWithRetry(
  request: typeof fetch,
  url: string,
  init: RequestInit,
): Effect.Effect<Response, ReportsGithubError> {
  return Effect.gen(function* () {
    const run = Effect.tryPromise({
      try: () => withTimeout(request, url, init),
      catch: () => graphqlError('No se pudo contactar con GitHub.'),
    })
    let response = yield* run
    let attempt = 0
    while (attempt < MAX_RETRIES && RETRYABLE_STATUS.has(response.status)) {
      yield* Effect.sleep(Duration.millis(RETRY_DELAY_MS * (attempt + 1)))
      response = yield* run
      attempt += 1
    }
    return response
  })
}

function write(
  request: typeof fetch,
  url: string,
  init: RequestInit,
): Effect.Effect<Response, ReportsGithubError> {
  return Effect.tryPromise({
    try: () => withTimeout(request, url, init),
    catch: () => graphqlError('No se pudo contactar con GitHub.'),
  })
}

function logFailure(context: string, status: number, body: string): void {
  console.error(`[reports] ${context} devolvió ${status}`, body.slice(0, 500))
}

function issueFields(comments: boolean, depth: number): string {
  const fields = `...F ${comments ? '...C' : ''}`
  if (depth <= 0) return `{ ${fields} }`
  return `{ ${fields} duplicateOf ${issueFields(comments, depth - 1)} }`
}

/** Resuelve el login del bot una vez por token (`/user` no existe para GitHub Apps). */
export function resolveBotLogin(
  config: GithubConfig,
  configuredLogin: string | undefined,
): Effect.Effect<string, ReportsGithubError, Http> {
  return Effect.gen(function* () {
    const trimmed = configuredLogin?.trim()
    if (trimmed) return trimmed
    const cached = botLogins.get(config.token)
    if (cached) return cached

    const http = yield* Http
    const response = yield* readWithRetry(http.request, `${GITHUB_API_BASE}/user`, {
      headers: githubHeaders(config.token),
    })
    if (!response.ok) {
      const body = yield* Effect.promise(() => response.text().catch(() => ''))
      logFailure('GET /user', response.status, body)
      return yield* graphqlError('No se pudo resolver la cuenta del bot.', response.status)
    }
    const data = yield* Effect.promise(
      () => response.json().catch(() => null) as Promise<{ login?: string } | null>,
    )
    const login = data?.login?.trim()
    if (!login) return yield* graphqlError('GitHub no devolvió la cuenta del bot.')
    botLogins.set(config.token, login)
    return login
  })
}

const botLogins = new Map<string, string>()

export function fetchIssueChain(
  config: GithubConfig,
  numbers: number[],
  options: { comments: boolean },
): Effect.Effect<Map<number, GraphIssueNode | null>, ReportsGithubError, Http> {
  return Effect.gen(function* () {
    if (numbers.length === 0) return new Map()
    const http = yield* Http
    const aliases = numbers
      .map((number) => `i${number}: issue(number: ${number}) ${issueFields(options.comments, 3)}`)
      .join('\n')
    const fragments = `fragment F on Issue { ${ISSUE_FIELDS} }${
      options.comments ? `\nfragment C on Issue { ${RECENT_COMMENTS} }` : ''
    }`
    const query = `query ($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
${aliases}
  }
}
${fragments}`

    const response = yield* readWithRetry(http.request, `${GITHUB_API_BASE}/graphql`, {
      method: 'POST',
      headers: { ...githubHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner: config.owner, name: config.repo } }),
    })

    const raw = yield* Effect.promise(() => response.text().catch(() => ''))
    if (!response.ok) {
      logFailure('POST /graphql', response.status, raw)
      return yield* graphqlError('GitHub rechazó la consulta.', response.status)
    }

    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as GraphqlBody,
      catch: () => graphqlError('GitHub devolvió una respuesta inválida.'),
    })

    const unexpected = (parsed.errors ?? []).filter((error) => {
      const expected =
        error.type === 'NOT_FOUND' &&
        Boolean(error.path?.some((part) => /^i\d+$/.test(String(part))))
      return !expected
    })
    if (unexpected.length > 0) {
      console.error('[reports] GraphQL devolvió errores', unexpected.map((error) => error.message))
      return yield* graphqlError('GitHub devolvió un error al consultar las issues.')
    }
    if (!parsed.data?.repository) {
      return yield* graphqlError('GitHub no devolvió el repositorio.')
    }

    const result = new Map<number, GraphIssueNode | null>()
    for (const number of numbers) {
      result.set(number, issueNode(parsed.data.repository[`i${number}`] ?? null))
    }
    return result
  })
}

export interface IssueThread {
  totalCount: number
  comments: RawComment[]
}

export function fetchIssueThread(
  config: GithubConfig,
  number: number,
): Effect.Effect<IssueThread, ReportsGithubError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const query = `query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      comments(last: 100) {
        totalCount
        nodes { databaseId createdAt updatedAt body author { __typename login } }
      }
    }
  }
}`
    const response = yield* readWithRetry(http.request, `${GITHUB_API_BASE}/graphql`, {
      method: 'POST',
      headers: { ...githubHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { owner: config.owner, name: config.repo, number },
      }),
    })
    const raw = yield* Effect.promise(() => response.text().catch(() => ''))
    if (!response.ok) {
      logFailure('POST /graphql (hilo)', response.status, raw)
      return yield* graphqlError('GitHub rechazó la consulta del hilo.', response.status)
    }
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as GraphqlBody & {
        data?: { repository?: { issue?: { comments?: { totalCount?: number; nodes?: RawCommentPayload[] } } | null } | null }
      },
      catch: () => graphqlError('GitHub devolvió una respuesta inválida.'),
    })
    const comments = parsed.data?.repository?.issue?.comments
    if (!comments) {
      if (parsed.errors?.length) {
        console.error('[reports] GraphQL del hilo devolvió errores', parsed.errors)
        return yield* graphqlError('GitHub devolvió un error al consultar el hilo.')
      }
      return { totalCount: 0, comments: [] }
    }
    return {
      totalCount: Number(comments.totalCount ?? comments.nodes?.length ?? 0),
      comments: (comments.nodes ?? [])
        .filter((comment) => typeof comment.databaseId === 'number' && typeof comment.body === 'string')
        .map((comment) => ({
          databaseId: comment.databaseId as number,
          createdAt: comment.createdAt ?? '',
          updatedAt: comment.updatedAt,
          body: comment.body as string,
          author: comment.author?.login
            ? { login: comment.author.login, __typename: comment.author.__typename }
            : null,
        })),
    }
  })
}

export interface GithubComment {
  databaseId: number
  body: string
  issueNumber: number
  createdAt: string
  updatedAt: string
  author: { login: string; type?: string } | null
}

interface RestCommentPayload {
  id?: number
  body?: string
  issue_url?: string
  created_at?: string
  updated_at?: string
  user?: { login?: string; type?: string } | null
}

function restComment(payload: RestCommentPayload): GithubComment | null {
  if (typeof payload.id !== 'number' || typeof payload.body !== 'string') return null
  const issueNumber = Number(payload.issue_url?.split('/').pop())
  if (!Number.isFinite(issueNumber)) return null
  return {
    databaseId: payload.id,
    body: payload.body,
    issueNumber,
    createdAt: payload.created_at ?? '',
    updatedAt: payload.updated_at ?? payload.created_at ?? '',
    author: payload.user?.login ? { login: payload.user.login, type: payload.user.type } : null,
  }
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export function fetchComment(
  config: GithubConfig,
  commentId: number,
): Effect.Effect<GithubComment | null, ReportsGithubError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* readWithRetry(
      http.request,
      `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues/comments/${commentId}`,
      { headers: githubHeaders(config.token) },
    )
    if (response.status === 404) return null
    if (!response.ok) {
      const body = yield* Effect.promise(() => response.text().catch(() => ''))
      logFailure('GET comment', response.status, body)
      return yield* graphqlError('No se pudo leer el comentario.', response.status)
    }
    const data = yield* Effect.promise(() => readJson<RestCommentPayload>(response))
    return data ? restComment(data) : null
  })
}

function mutateComment(
  config: GithubConfig,
  method: 'POST' | 'PATCH',
  url: string,
  body: string,
  failureMessage: string,
): Effect.Effect<GithubComment, ReportsGithubError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* write(http.request, url, {
      method,
      headers: { ...githubHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!response.ok) {
      const text = yield* Effect.promise(() => response.text().catch(() => ''))
      logFailure(`${method} comment`, response.status, text)
      return yield* graphqlError(failureMessage, response.status)
    }
    const data = yield* Effect.promise(() => readJson<RestCommentPayload>(response))
    const comment = data ? restComment(data) : null
    if (!comment) return yield* graphqlError(failureMessage, response.status)
    return comment
  })
}

export function createComment(
  config: GithubConfig,
  issueNumber: number,
  body: string,
): Effect.Effect<GithubComment, ReportsGithubError, Http> {
  return mutateComment(
    config,
    'POST',
    `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`,
    body,
    'No se pudo publicar la aclaración.',
  )
}

export function updateComment(
  config: GithubConfig,
  commentId: number,
  body: string,
): Effect.Effect<GithubComment, ReportsGithubError, Http> {
  return mutateComment(
    config,
    'PATCH',
    `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues/comments/${commentId}`,
    body,
    'No se pudo guardar la aclaración.',
  )
}

export function deleteComment(
  config: GithubConfig,
  commentId: number,
): Effect.Effect<void, ReportsGithubError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* write(
      http.request,
      `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues/comments/${commentId}`,
      { method: 'DELETE', headers: githubHeaders(config.token) },
    )
    if (!response.ok) {
      const text = yield* Effect.promise(() => response.text().catch(() => ''))
      logFailure('DELETE comment', response.status, text)
      return yield* graphqlError('No se pudo borrar la aclaración.', response.status)
    }
  })
}
