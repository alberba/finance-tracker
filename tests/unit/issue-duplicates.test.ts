import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import { findIssueCandidates } from '../../src/lib/server/issue-duplicates'

const ENV = { GITHUB_ISSUE_TOKEN: 'token', GITHUB_OWNER: 'acme', GITHUB_REPO: 'repo' }
const REPORT = {
  type: 'bug' as const,
  summary: 'El filtro de movimientos no persiste',
  description: 'Al recargar vuelve al valor anterior.',
  section: 'transactions',
  pathname: '/movimientos',
}

function searchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('findIssueCandidates', () => {
  it('no busca sin credenciales', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    const result = await Effect.runPromise(
      findIssueCandidates(REPORT, { GITHUB_OWNER: 'acme', GITHUB_REPO: 'repo' }, fetchFn),
    )
    expect(result).toEqual({ issues: [], status: 'unavailable' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('devuelve las candidatas y marca la búsqueda parcial si recorta', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      searchResponse({
        total_count: 2,
        incomplete_results: false,
        items: [
          {
            number: 12,
            title: 'Filtro roto',
            body: '### Resumen\nAlgo\n\n### Reportero\n- Identificador: privado',
            state: 'open',
          },
        ],
      }),
    )

    const result = await Effect.runPromise(
      findIssueCandidates(REPORT, ENV, fetchFn as typeof fetch),
    )
    expect(result.status).toBe('partial')
    expect(result.issues[0]).toMatchObject({ number: 12, truncated: false })
    expect(result.issues[0]?.body).not.toContain('Identificador')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('falla con un error etiquetado si GitHub rechaza la búsqueda', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => searchResponse({ message: 'boom' }, 500))

    await expect(
      Effect.runPromise(findIssueCandidates(REPORT, ENV, fetchFn as typeof fetch)),
    ).rejects.toMatchObject({ _tag: 'IssueCandidatesError', status: 500 })
  })

  it('falla con un error etiquetado si la red no responde', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    })

    await expect(
      Effect.runPromise(findIssueCandidates(REPORT, ENV, fetchFn as typeof fetch)),
    ).rejects.toMatchObject({ _tag: 'IssueCandidatesError' })
  })
})
