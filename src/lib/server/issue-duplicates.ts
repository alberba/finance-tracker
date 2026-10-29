import { Data, Effect } from 'effect'
import { z } from 'zod'

import type { RuntimeEnv } from './cloudflare-env'

/**
 * Campos del reporte que se envían al buscador de candidatas. El reportero
 * (email, nombre, identificador) y el user-agent nunca salen del servidor.
 */
export interface IssueDuplicateInput {
  type: 'bug' | 'feature'
  summary: string
  description: string
  section: string
  pathname: string
}

const candidateSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
})
const searchSchema = z.object({
  items: z.array(candidateSchema),
  total_count: z.number(),
  incomplete_results: z.boolean(),
})

export interface IssueCandidates {
  issues: Array<z.infer<typeof candidateSchema> & { truncated: boolean }>
  status: 'searched' | 'partial' | 'unavailable'
}

/** Fallo de la búsqueda; el alta de reportes decide si degrada a «unavailable». */
export class IssueCandidatesError extends Data.TaggedError('IssueCandidatesError')<{
  message: string
  status?: number
}> {}

/** Acota coste y latencia; nunca presenta una búsqueda limitada como exhaustiva. */
export function findIssueCandidates(
  report: IssueDuplicateInput,
  env: RuntimeEnv,
  fetchFn: typeof fetch,
): Effect.Effect<IssueCandidates, IssueCandidatesError> {
  return Effect.gen(function* () {
    const token = env.GITHUB_ISSUE_TOKEN || env.GITHUB_TOKEN
    if (!token || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return { issues: [], status: 'unavailable' }
    }
    // Solo palabras: el texto del usuario no puede inyectar calificadores de búsqueda.
    const words = [
      ...new Set(`${report.summary} ${report.description}`.match(/[\p{L}\p{N}]{4,}/gu)),
    ]
      .filter(
        (word) =>
          word.length <= 40 &&
          !/^(para|desde|cuando|como|este|esta|quiero|error|problema)$/i.test(word),
      )
      .slice(0, 5)
    if (words.length === 0) return { issues: [], status: 'unavailable' }
    const query = `repo:${env.GITHUB_OWNER}/${env.GITHUB_REPO} is:issue in:title,body ${words.map((word) => `"${word}"`).join(' OR ')}`

    const response = yield* Effect.tryPromise({
      try: () =>
        fetchFn(
          `https://api.github.com/search/issues?${new URLSearchParams({ q: query, per_page: '20' })}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'finance-tracker-web-reporter',
            },
            signal: AbortSignal.timeout(3_000),
          },
        ),
      catch: () => new IssueCandidatesError({ message: 'No se pudo contactar con GitHub.' }),
    })
    if (!response.ok) {
      return yield* new IssueCandidatesError({
        message: `GitHub devolvió ${response.status} al buscar duplicadas.`,
        status: response.status,
      })
    }
    const data = yield* Effect.tryPromise({
      try: () => response.json().then((body) => searchSchema.parse(body)),
      catch: () => new IssueCandidatesError({ message: 'GitHub devolvió una búsqueda inválida.' }),
    })

    let partial = data.incomplete_results || data.total_count > data.items.length
    const issues = data.items.map((issue) => {
      // Los metadatos de cuenta de reportes anteriores tampoco se envían al proveedor.
      const body = (issue.body ?? '').split(/^### (?:Reportero|Contexto de ejecución)\s*$/m)[0]
      if (body.length > 8_000) partial = true
      return { ...issue, body: body.slice(0, 8_000), truncated: body.length > 8_000 }
    })
    return { issues, status: partial ? 'partial' : 'searched' }
  })
}
