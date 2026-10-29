/**
 * Piezas compartidas de la API de GitHub, extraídas de `github-issues.ts` para
 * que el alta de reportes y el seguimiento usen las mismas cabeceras y la misma
 * configuración.
 */

import { Data, Effect } from 'effect'

import type { RuntimeEnv } from './cloudflare-env'
import { Http } from './http'

export const GITHUB_API_BASE = 'https://api.github.com'

export class GithubConfigError extends Data.TaggedError('GithubConfigError')<{
  message: string
}> {}

export class GithubApiError extends Data.TaggedError('GithubApiError')<{
  message: string
  status?: number
}> {}

export interface GithubConfig {
  token: string
  owner: string
  repo: string
}

/** Cabeceras de todas las llamadas a la API de GitHub de este servidor. */
export function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'finance-tracker-web-reporter',
  }
}

function requiredVar(
  name: keyof RuntimeEnv,
  env: RuntimeEnv,
): Effect.Effect<string, GithubConfigError> {
  const value = String(env[name] || '').trim()
  return value
    ? Effect.succeed(value)
    : Effect.fail(
        new GithubConfigError({ message: `Falta variable de entorno requerida: ${name}` }),
      )
}

function requiredAnyVar(
  names: ReadonlyArray<keyof RuntimeEnv>,
  env: RuntimeEnv,
): Effect.Effect<string, GithubConfigError> {
  for (const name of names) {
    const value = String(env[name] || '').trim()
    if (value) return Effect.succeed(value)
  }
  return Effect.fail(
    new GithubConfigError({
      message: `Falta variable de entorno requerida: ${names.join(' o ')}`,
    }),
  )
}

export function githubConfig(env: RuntimeEnv): Effect.Effect<GithubConfig, GithubConfigError> {
  return Effect.gen(function* () {
    const token = yield* requiredAnyVar(['GITHUB_ISSUE_TOKEN', 'GITHUB_TOKEN'], env)
    const owner = yield* requiredVar('GITHUB_OWNER', env)
    const repo = yield* requiredVar('GITHUB_REPO', env)
    return { token, owner, repo }
  })
}

/** El endpoint de adjuntos exige el id numérico del repositorio. */
export function fetchRepositoryId(
  config: GithubConfig,
): Effect.Effect<number, GithubApiError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* Effect.tryPromise({
      try: () =>
        http.request(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}`, {
          headers: githubHeaders(config.token),
        }),
      catch: () => new GithubApiError({ message: 'No se pudo contactar con GitHub.' }),
    })
    if (!response.ok) {
      return yield* new GithubApiError({
        message: `No se pudo leer el repositorio (${response.status}).`,
        status: response.status,
      })
    }
    const data = yield* Effect.promise(
      () => response.json().catch(() => null) as Promise<{ id?: number } | null>,
    )
    const id = Number(data?.id)
    if (!Number.isFinite(id)) {
      return yield* new GithubApiError({ message: 'Respuesta inválida al leer el repositorio.' })
    }
    return id
  })
}
