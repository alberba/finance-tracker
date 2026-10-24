import { describe, expect, it, vi } from 'vitest'
import {
  buildIssueBody,
  createIssueFromWebReport,
  type IssueReporter,
} from '../../src/lib/server/github-issues'
import {
  parseIssueReportPayload,
  type IssueReportPayload,
} from '../../src/lib/server/issue-report-schema'

const payload: IssueReportPayload = {
  type: 'bug',
  summary: 'Error al guardar movimiento',
  description: 'Al pulsar guardar, no se persiste en servidor.',
  section: 'transactions',
  context: {
    userAgent: 'Playwright',
    pathname: '/movimientos',
    timestamp: '2026-02-23T10:00:00.000Z',
  },
}

const reporter: IssueReporter = {
  userId: 'user-42',
  email: 'ana@example.com',
  name: 'ana',
}

/** El error que lanzó la promesa: acá importa su `message`, no la respuesta. */
async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error('Se esperaba que la promesa fallara')
}

describe('github issues service', () => {
  it('crea issue y devuelve número/url', async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            number: 99,
            html_url: 'https://github.com/org/repo/issues/99',
          }),
          {
            status: 201,
          },
        ),
    )

    const result = await createIssueFromWebReport(
      payload,
      reporter,
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    )

    expect(result.number).toBe(99)
    expect(result.url).toContain('/issues/99')
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [, init] = fakeFetch.mock.calls[0]
    const body = JSON.parse(String(init?.body || '{}'))
    expect(body.labels).toEqual(
      expect.arrayContaining(['source:web-report', 'status:triage', 'bug']),
    )
    expect(body.labels).not.toContain('type:bug')
    expect(body.type).toBe('Bug')
    expect(body.body).toContain('### Resumen')
    expect(body.body).toContain('### Problema o solicitud')
    expect(body.body).toContain('- Se envió desde la sección: transactions')
    expect(body.body).toContain('- Se envió desde la ruta: /movimientos')
  })

  it('mapea una mejora a label y tipo Feature', async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            number: 15,
            html_url: 'https://github.com/org/repo/issues/15',
          }),
          { status: 201 },
        ),
    )

    await createIssueFromWebReport(
      {
        ...payload,
        type: 'feature',
      },
      reporter,
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    )

    const [, init] = fakeFetch.mock.calls[0]
    const body = JSON.parse(String(init?.body || '{}'))
    expect(body.labels).toContain('feature')
    expect(body.labels).not.toContain('type:enhancement')
    expect(body.type).toBe('Feature')
  })

  it('reintenta sin tipo estructurado si GitHub no lo admite', async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unknown issue type', { status: 422 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 16, html_url: 'https://x/issues/16' }), {
          status: 201,
        }),
      )

    const result = await createIssueFromWebReport(
      payload,
      reporter,
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    )

    expect(result.number).toBe(16)
    expect(fakeFetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(String(fakeFetch.mock.calls[0][1]?.body || '{}'))
    const fallbackBody = JSON.parse(String(fakeFetch.mock.calls[1][1]?.body || '{}'))
    expect(firstBody.type).toBe('Bug')
    expect(fallbackBody).not.toHaveProperty('type')
  })

  it('reintenta errores transitorios', async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 7, html_url: 'https://x/issues/7' }), {
          status: 201,
        }),
      )

    const result = await createIssueFromWebReport(
      payload,
      reporter,
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    )

    expect(result.number).toBe(7)
    expect(fakeFetch).toHaveBeenCalledTimes(2)
  })

  it('lanza error en fallo no recuperable', async () => {
    const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response('forbidden', { status: 403 }))

    await expect(
      createIssueFromWebReport(
        payload,
        reporter,
        {
          GITHUB_ISSUE_TOKEN: 'token',
          GITHUB_OWNER: 'org',
          GITHUB_REPO: 'repo',
        },
        { fetch: fakeFetch as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/GitHub API devolvió 403/)
    expect(loggedError).toHaveBeenCalledExactlyOnceWith(
      '[github] GitHub API devolvió 403',
      'forbidden',
    )
  })

  it('nombra el estado sin filtrar el cuerpo de GitHub en un fallo directo', async () => {
    const upstreamBody = 'UPSTREAM_BODY_MARKER_UNAUTHORIZED'
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(upstreamBody, { status: 401 }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = await captureError(
      createIssueFromWebReport(
        payload,
        reporter,
        {
          GITHUB_ISSUE_TOKEN: 'token',
          GITHUB_OWNER: 'org',
          GITHUB_REPO: 'repo',
        },
        { fetch: fakeFetch as unknown as typeof fetch },
      ),
    )

    expect(error.message).toContain('GitHub API devolvió 401')
    expect(error.message).not.toContain(upstreamBody)
    expect(consoleError).toHaveBeenCalledWith('[github] GitHub API devolvió 401', upstreamBody)
  })

  it('nombra el estado sin filtrar el cuerpo de GitHub cuando el reintento vuelve a fallar', async () => {
    const upstreamBody = 'UPSTREAM_BODY_MARKER_FORBIDDEN'
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(upstreamBody, { status: 403 }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = await captureError(
      createIssueFromWebReport(
        payload,
        reporter,
        {
          GITHUB_ISSUE_TOKEN: 'token',
          GITHUB_OWNER: 'org',
          GITHUB_REPO: 'repo',
        },
        { fetch: fakeFetch as unknown as typeof fetch },
      ),
    )

    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(error.message).toContain('GitHub API devolvió 403')
    expect(error.message).not.toContain(upstreamBody)
    expect(consoleError).toHaveBeenCalledWith('[github] GitHub API devolvió 403', upstreamBody)
  })

  it('usa GITHUB_TOKEN cuando GITHUB_ISSUE_TOKEN no está definido', async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            number: 5,
            html_url: 'https://github.com/org/repo/issues/5',
          }),
          {
            status: 201,
          },
        ),
    )

    await createIssueFromWebReport(
      payload,
      reporter,
      {
        GITHUB_TOKEN: 'fallback-token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    )

    const [, init] = fakeFetch.mock.calls[0]
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer fallback-token',
    })
  })

  it('lanza error si no hay ningún token configurado', async () => {
    const fakeFetch = vi.fn<typeof fetch>()

    await expect(
      createIssueFromWebReport(
        payload,
        reporter,
        {
          GITHUB_OWNER: 'org',
          GITHUB_REPO: 'repo',
        },
        { fetch: fakeFetch as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/GITHUB_ISSUE_TOKEN o GITHUB_TOKEN/)
    expect(fakeFetch).not.toHaveBeenCalled()
  })
})

describe('buildIssueBody', () => {
  it('omite por completo la sección «Problema o solicitud» cuando no hay descripción', () => {
    const body = buildIssueBody({ ...payload, description: '' }, reporter)

    expect(body).not.toContain('Problema o solicitud')
    expect(body).toContain('### Resumen')
    expect(body).toContain(payload.summary)
  })

  it('incluye la descripción tal cual la escribió la persona usuaria', () => {
    const description = 'Línea uno\n\n- detalle con *markdown* sin tocar'
    const body = buildIssueBody({ ...payload, description }, reporter)

    expect(body).toContain(`### Problema o solicitud\n${description}\n`)
  })

  it('conserva los saltos de línea de la descripción de extremo a extremo', () => {
    const parsed = parseIssueReportPayload({
      type: 'bug',
      summary: 'Filtro roto',
      description: 'Paso 1\n\nPaso 2:\n- primero\n- segundo',
      section: 'transactions',
      context: {},
    })

    const body = buildIssueBody(parsed, reporter)

    expect(body).toContain('### Problema o solicitud\nPaso 1\n\nPaso 2:\n- primero\n- segundo\n')
  })

  it('escribe nombre, email e identificador del reportero recibido', () => {
    const body = buildIssueBody(payload, reporter)

    expect(body).toContain('### Reportero')
    expect(body).toContain('- Nombre: ana')
    expect(body).toContain('- Email: ana@example.com')
    expect(body).toContain('- Identificador: user-42')
  })

  it('marca con n/a los datos del reportero que falten', () => {
    const body = buildIssueBody(payload, { userId: 'user-7', email: null, name: null })

    expect(body).toContain('- Nombre: n/a')
    expect(body).toContain('- Email: n/a')
    expect(body).toContain('- Identificador: user-7')
  })

  it('no escribe los campos retirados del formulario', () => {
    const body = buildIssueBody(payload, reporter)

    expect(body).not.toContain('Resultado esperado')
    expect(body).not.toContain('Resultado actual')
    expect(body).not.toContain('Pasos para reproducir')
  })
})

describe('createIssueFromWebReport con reportero', () => {
  it('envía el reportero en el cuerpo y omite la descripción vacía', async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ number: 3, html_url: 'https://x/issues/3' }), {
          status: 201,
        }),
    )

    await createIssueFromWebReport(
      { ...payload, description: '' },
      reporter,
      { GITHUB_ISSUE_TOKEN: 'token', GITHUB_OWNER: 'org', GITHUB_REPO: 'repo' },
      { fetch: fakeFetch as unknown as typeof fetch },
    )

    const [, init] = fakeFetch.mock.calls[0]
    const body = JSON.parse(String(init?.body || '{}'))
    expect(body.body).toContain('- Email: ana@example.com')
    expect(body.body).not.toContain('Problema o solicitud')
  })
})
