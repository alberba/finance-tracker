import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOpencodeEnricher,
  type IssueEnrichmentInput,
} from '../../src/lib/server/issue-enricher'

const report: IssueEnrichmentInput = {
  type: 'bug',
  summary: 'Error al guardar movimiento',
  description: 'Al pulsar guardar, no se persiste en servidor.',
  section: 'transactions',
  pathname: '/movimientos',
}

const ENDPOINT = 'https://opencode.ai/inference/go/openai/v1/chat/completions'

function completion(content: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
}

function fetchReturning(response: Response) {
  return vi.fn<typeof fetch>(async () => response)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('issue enricher', () => {
  it('envía el modelo, la clave y las cabeceras de sesión y user-agent, y devuelve el análisis', async () => {
    const fakeFetch = fetchReturning(completion('  ## Problema\nGuardar falla.  '))
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 1_000 })

    const analysis = await enrich(report, { OPENCODE_GO_API_KEY: 'secret-key' })

    expect(analysis).toBe('## Problema\nGuardar falla.')
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, init] = fakeFetch.mock.calls[0]
    expect(url).toBe(ENDPOINT)
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer secret-key')
    expect(headers.get('x-opencode-session')).toBeTruthy()
    expect(headers.get('User-Agent')).toBe('finance-tracker-issue-enricher')
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('deepseek-v4.1-flash')
    expect(body.messages.at(-1).content).toContain('Error al guardar movimiento')
    expect(body.messages.at(-1).content).toContain('/movimientos')
  })

  it('reutiliza el mismo x-opencode-session dentro del proceso', async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion('uno'))
      .mockResolvedValueOnce(completion('dos'))
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 1_000 })

    await enrich(report, { OPENCODE_GO_API_KEY: 'k' })
    await enrich(report, { OPENCODE_GO_API_KEY: 'k' })

    const first = new Headers(fakeFetch.mock.calls[0][1]?.headers).get('x-opencode-session')
    const second = new Headers(fakeFetch.mock.calls[1][1]?.headers).get('x-opencode-session')
    expect(first).toBeTruthy()
    expect(second).toBe(first)
  })

  it('sin clave devuelve null sin llamar al proveedor ni registrar nada', async () => {
    const fakeFetch = fetchReturning(completion('no debería usarse'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 1_000 })

    expect(await enrich(report, {})).toBeNull()
    expect(await enrich(report, { OPENCODE_GO_API_KEY: '   ' })).toBeNull()
    expect(fakeFetch).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('un error del proveedor devuelve null y se registra una sola vez', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fakeFetch = fetchReturning(new Response('upstream body SECRET_MARKER', { status: 500 }))
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 1_000 })

    expect(await enrich(report, { OPENCODE_GO_API_KEY: 'k' })).toBeNull()
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      '[issue-enricher] El proveedor devolvió 500.',
    )
  })

  it('un fallo de red devuelve null y se registra una sola vez', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    })
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 1_000 })

    expect(await enrich(report, { OPENCODE_GO_API_KEY: 'k' })).toBeNull()
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      '[issue-enricher] Fallo de red al consultar el proveedor.',
    )
  })

  it('una llamada que supera el plazo se aborta, devuelve null y se registra una sola vez', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fakeFetch = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 5 })

    expect(await enrich(report, { OPENCODE_GO_API_KEY: 'k' })).toBeNull()
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      '[issue-enricher] Tiempo de espera agotado.',
    )
  })

  it('una respuesta sin la forma esperada se descarta y se registra una sola vez', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cases: Response[] = [
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      completion(42),
      completion('   '),
      new Response('no es json', { status: 200 }),
    ]

    for (const response of cases) {
      consoleError.mockClear()
      const enrich = createOpencodeEnricher({
        fetch: fetchReturning(response),
        timeoutMs: 1_000,
      })
      expect(await enrich(report, { OPENCODE_GO_API_KEY: 'k' })).toBeNull()
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(
        '[issue-enricher] Respuesta del proveedor sin forma esperada.',
      )
    }
  })

  it('limita la longitud del análisis', async () => {
    const enrich = createOpencodeEnricher({
      fetch: fetchReturning(completion('a'.repeat(9_000))),
      timeoutMs: 1_000,
    })

    const analysis = await enrich(report, { OPENCODE_GO_API_KEY: 'k' })

    expect(analysis).toHaveLength(4_000)
  })
})
