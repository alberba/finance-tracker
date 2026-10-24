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

/** Respuesta con la forma pedida en el prompt: tres apartados y dos criterios. */
const WELL_FORMED = [
  '**Problema**: El guardado de movimientos no llega al servidor.',
  '**Área probable**: movimientos',
  '**Criterios de aceptación**:',
  '- [ ] Guardar un movimiento lo persiste en el servidor.',
  '- [ ] Recargar la página muestra el movimiento guardado.',
].join('\n')

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
    const fakeFetch = fetchReturning(completion(`  ${WELL_FORMED}  `))
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 1_000 })

    const analysis = await enrich(report, { OPENCODE_GO_API_KEY: 'secret-key' })

    expect(analysis).toBe(WELL_FORMED)
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
    expect(body.messages[0].content).toContain('**Criterios de aceptación**:')
    expect(body.messages.at(-1).content).toContain('Error al guardar movimiento')
    expect(body.messages.at(-1).content).toContain('/movimientos')
  })

  it('reutiliza el mismo x-opencode-session dentro del proceso', async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion(WELL_FORMED))
      .mockResolvedValueOnce(completion(WELL_FORMED))
    const enrich = createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 1_000 })

    await enrich(report, { OPENCODE_GO_API_KEY: 'k' })
    await enrich(report, { OPENCODE_GO_API_KEY: 'k' })

    const first = new Headers(fakeFetch.mock.calls[0][1]?.headers).get('x-opencode-session')
    const second = new Headers(fakeFetch.mock.calls[1][1]?.headers).get('x-opencode-session')
    expect(first).toBeTruthy()
    expect(second).toBe(first)
  })

  it('sin clave devuelve null sin llamar al proveedor ni registrar nada', async () => {
    const fakeFetch = fetchReturning(completion(WELL_FORMED))
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
    const malformed = [
      // Sin envoltorio de la respuesta de chat.
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      completion(42),
      completion('   '),
      new Response('no es json', { status: 200 }),
      // Texto libre sin los apartados pedidos.
      completion('Este reporte parece un error de guardado.'),
      // Falta el apartado de área probable.
      completion(
        [
          '**Problema**: El guardado falla.',
          '**Criterios de aceptación**:',
          '- [ ] Guardar persiste.',
          '- [ ] Recargar muestra el dato.',
        ].join('\n'),
      ),
      // Un solo criterio.
      completion(WELL_FORMED.replace(/\n- \[ \] Recargar.*$/, '')),
      // Cinco criterios.
      completion([WELL_FORMED, '- [ ] Tercero.', '- [ ] Cuarto.', '- [ ] Quinto.'].join('\n')),
      // Criterios sin la casilla Markdown.
      completion(WELL_FORMED.replace(/- \[ \] /g, '- ')),
      // Prosa después de los criterios.
      completion(`${WELL_FORMED}\nEspero que ayude.`),
    ]

    for (const response of malformed) {
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

  it('descarta un análisis por encima de 4.000 caracteres en vez de cortarlo', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const oversized = WELL_FORMED.replace('movimientos', `movimientos${'a'.repeat(4_000)}`)
    const enrich = createOpencodeEnricher({
      fetch: fetchReturning(completion(oversized)),
      timeoutMs: 1_000,
    })

    expect(await enrich(report, { OPENCODE_GO_API_KEY: 'k' })).toBeNull()
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      '[issue-enricher] Respuesta del proveedor sin forma esperada.',
    )
  })

  describe('aviso de fallos', () => {
    function enricherWith(fakeFetch: typeof fetch, reportFailure = vi.fn()) {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      return {
        enrich: createOpencodeEnricher({ fetch: fakeFetch, timeoutMs: 50, reportFailure }),
        reportFailure,
      }
    }

    it('un 401 del proveedor se avisa una vez con el estado, sin texto del proveedor', async () => {
      const { enrich, reportFailure } = enricherWith(
        fetchReturning(new Response('SECRET_MARKER', { status: 401 })),
      )

      await enrich(report, { OPENCODE_GO_API_KEY: 'secret-key' })

      expect(reportFailure).toHaveBeenCalledTimes(1)
      expect(reportFailure).toHaveBeenCalledWith({ stage: 'enrich', reason: 'http-401' })
    })

    it('un fallo de red se avisa como network', async () => {
      const { enrich, reportFailure } = enricherWith(
        vi.fn<typeof fetch>(async () => {
          throw new TypeError('fetch failed')
        }),
      )

      await enrich(report, { OPENCODE_GO_API_KEY: 'secret-key' })

      expect(reportFailure).toHaveBeenCalledWith({ stage: 'enrich', reason: 'network' })
    })

    it('un plazo agotado se avisa como timeout', async () => {
      const { enrich, reportFailure } = enricherWith(
        vi.fn<typeof fetch>(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              )
            }),
        ),
      )

      await enrich(report, { OPENCODE_GO_API_KEY: 'secret-key' })

      expect(reportFailure).toHaveBeenCalledWith({ stage: 'enrich', reason: 'timeout' })
    })

    it('una respuesta sin la forma esperada se avisa como shape', async () => {
      const { enrich, reportFailure } = enricherWith(fetchReturning(completion('texto libre')))

      await enrich(report, { OPENCODE_GO_API_KEY: 'secret-key' })

      expect(reportFailure).toHaveBeenCalledWith({ stage: 'enrich', reason: 'shape' })
    })

    it('sin clave no hay red ni aviso', async () => {
      const fakeFetch = fetchReturning(completion(WELL_FORMED))
      const { enrich, reportFailure } = enricherWith(fakeFetch)

      await enrich(report, {})

      expect(fakeFetch).not.toHaveBeenCalled()
      expect(reportFailure).not.toHaveBeenCalled()
    })

    it('un análisis válido no avisa de nada', async () => {
      const { enrich, reportFailure } = enricherWith(fetchReturning(completion(WELL_FORMED)))

      await enrich(report, { OPENCODE_GO_API_KEY: 'secret-key' })

      expect(reportFailure).not.toHaveBeenCalled()
    })
  })
})
