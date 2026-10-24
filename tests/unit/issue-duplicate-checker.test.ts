import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDuplicateChecker,
  type IssueDuplicateInput,
} from '../../src/lib/server/issue-duplicate-checker'

const report: IssueDuplicateInput = {
  type: 'bug',
  summary: 'Error al guardar movimiento',
  description: 'Al pulsar guardar, no se persiste en servidor.',
  section: 'transactions',
  pathname: '/movimientos',
}
const env = {
  OPENCODE_GO_API_KEY: 'key',
  GITHUB_ISSUE_TOKEN: 'token',
  GITHUB_OWNER: 'org',
  GITHUB_REPO: 'repo',
}
const candidate = { number: 7, title: report.summary, body: report.description, state: 'open' }
const search = (items: unknown[] = [candidate]) =>
  new Response(JSON.stringify({ items, total_count: items.length, incomplete_results: false }))
const completion = (content: unknown = JSON.stringify({ duplicateNumber: 7 })) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }))

afterEach(() => vi.restoreAllMocks())

describe('comprobación semántica de duplicadas', () => {
  it('busca abiertas y cerradas, consulta DeepSeek y devuelve un enlace validado', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(search())
      .mockResolvedValueOnce(completion())
    const result = await createDuplicateChecker({ fetch, timeoutMs: 1_000 })(report, env)
    expect(result).toEqual({ number: 7, url: 'https://github.com/org/repo/issues/7' })
    const url = new URL(String(fetch.mock.calls[0][0]))
    expect(url.pathname).toBe('/search/issues')
    expect(url.searchParams.get('q')).toContain('repo:org/repo is:issue')
    expect(url.searchParams.get('q')).not.toMatch(/is:(open|closed)/)
    const init = fetch.mock.calls[1][1]!
    expect(JSON.parse(String(init.body)).model).toBe('deepseek-v4.1-flash')
    expect(new Headers(init.headers).get('x-opencode-session')).toBeTruthy()
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer key')
  })

  it('sin clave no consulta GitHub ni el modelo', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    expect(await createDuplicateChecker({ fetch, timeoutMs: 50 })(report, {})).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sin candidatas evita una llamada al modelo', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(search([]))
    expect(await createDuplicateChecker({ fetch, timeoutMs: 50 })(report, env)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['closed', 'missing', 'truncated', 'uncertain'])(
    'no descarta el reporte si la coincidencia está %s',
    async (kind) => {
      const items =
        kind === 'missing'
          ? [{ ...candidate, number: 8 }]
          : [
              {
                ...candidate,
                state: kind === 'closed' ? 'closed' : 'open',
                body: kind === 'truncated' ? 'a'.repeat(8_001) : candidate.body,
              },
            ]
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(search(items))
        .mockResolvedValueOnce(
          completion(JSON.stringify({ duplicateNumber: kind === 'uncertain' ? null : 7 })),
        )
      expect(await createDuplicateChecker({ fetch, timeoutMs: 50 })(report, env)).toBeNull()
    },
  )

  it('elimina los metadatos del reportero antes de llamar al modelo', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        search([
          {
            ...candidate,
            body: `${candidate.body}\n### Contexto de ejecución\nNavegador privado\n### Reportero\nEmail: PRIVATE_MARKER`,
          },
        ]),
      )
      .mockResolvedValueOnce(completion())
    await createDuplicateChecker({ fetch, timeoutMs: 50 })(report, env)
    const prompt = String(fetch.mock.calls[1][1]?.body)
    expect(prompt).not.toContain('PRIVATE_MARKER')
    expect(prompt).not.toContain('Navegador privado')
  })

  it.each(['http', 'network', 'shape'])(
    'un fallo de búsqueda %s omite el modelo y no bloquea el reporte',
    async (kind) => {
      const fetch = vi.fn<typeof globalThis.fetch>()
      if (kind === 'network') fetch.mockRejectedValueOnce(new Error('network'))
      else fetch.mockResolvedValueOnce(new Response('{}', { status: kind === 'http' ? 403 : 200 }))
      expect(await createDuplicateChecker({ fetch, timeoutMs: 50 })(report, env)).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['http', 'network', 'shape', 'timeout'])(
    'un fallo del modelo %s devuelve null y se registra sin texto libre',
    async (kind) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(search())
      if (kind === 'http')
        fetch.mockResolvedValueOnce(new Response('SECRET_MARKER', { status: 401 }))
      if (kind === 'network') fetch.mockRejectedValueOnce(new Error('SECRET_MARKER'))
      if (kind === 'shape') fetch.mockResolvedValueOnce(completion('no es JSON'))
      if (kind === 'timeout')
        fetch.mockImplementationOnce(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('SECRET_MARKER')))
            }),
        )
      const reportFailure = vi.fn()
      expect(
        await createDuplicateChecker({ fetch, timeoutMs: 10, reportFailure })(report, env),
      ).toBeNull()
      expect(reportFailure).toHaveBeenCalledExactlyOnceWith({
        stage: 'duplicate',
        reason: kind === 'http' ? 'http-401' : kind,
      })
      expect(JSON.stringify(reportFailure.mock.calls)).not.toContain('SECRET_MARKER')
    },
  )
})
