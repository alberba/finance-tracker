/**
 * Piezas compartidas de la API de GitHub, extraídas de `github-issues.ts` para
 * que el alta de reportes y el seguimiento usen las mismas cabeceras y la misma
 * configuración.
 */

import { Data, Effect } from 'effect'

import type { RuntimeEnv } from './cloudflare-env'

export const GITHUB_API_BASE = 'https://api.github.com'

export class GithubConfigError extends Data.TaggedError('GithubConfigError')<{
  message: string
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
export async function fetchRepositoryId(
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
export function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => (pending ??= fn())
}
