import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AttachmentUploadError,
  uploadIssueAttachment,
  type AttachmentUploadContext,
} from '../../src/lib/server/issue-attachments'
import {
  createIssueFromWebReport as createIssueFromWebReportEffect,
  type IssueReporter,
} from '../../src/lib/server/github-issues'
import { Http } from '../../src/lib/server/http'
import {
  parseIssueReportPayload,
  type IssueReportPayload,
  type ResolvedAttachment,
} from '../../src/lib/server/issue-report-schema'

// Sentry es el límite externo: un SDK falso recoge los eventos que saldrían hacia Sentry.
const sentry = vi.hoisted(() => {
  const events: Array<{ message: string; tags: Record<string, string> }> = []
  let tags: Record<string, string> = {}
  return {
    events,
    sdk: {
      withScope: (
        handler: (scope: {
          setTag: (key: string, value: string) => void
          setFingerprint: () => void
        }) => void,
      ) => {
        tags = {}
        handler({ setTag: (key, value) => (tags[key] = value), setFingerprint: () => {} })
      },
      captureMessage: (message: string) => {
        events.push({ message, tags })
      },
    },
  }
})
vi.mock('@sentry/cloudflare', () => sentry.sdk)

beforeEach(() => {
  sentry.events.length = 0
})

const ENV = { GITHUB_ISSUE_TOKEN: 'token', GITHUB_OWNER: 'org', GITHUB_REPO: 'repo' }

const reporter: IssueReporter = { userId: 'user-42', email: 'ana@example.com', name: 'ana' }

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const attachment: ResolvedAttachment = {
  name: 'pantalla.png',
  contentType: 'image/png',
  bytes: PNG_BYTES,
}

function reportWith(attachments?: ResolvedAttachment[]): IssueReportPayload {
  const base = parseIssueReportPayload({
    type: 'bug',
    summary: 'Captura del filtro roto',
    description: 'Se ve en la captura.',
    section: 'transactions',
    context: { pathname: '/movimientos' },
  })
  return { ...base, attachments }
}

function issueResponse() {
  return new Response(
    JSON.stringify({ number: 77, html_url: 'https://github.com/org/repo/issues/77' }),
    { status: 201 },
  )
}

function jsonHeaders(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('uploadIssueAttachment', () => {
  const context = (fetchFn: typeof fetch, repositoryId = 123456): AttachmentUploadContext => ({
    fetch: fetchFn,
    headers: { Authorization: 'Bearer token' },
    repositoryId,
  })
  const upload = (fetchFn: typeof fetch): Promise<string> =>
    Effect.runPromise(uploadIssueAttachment(attachment, context(fetchFn)))

  it('sube los bytes al endpoint de adjuntos con el id del repositorio y devuelve la URL', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () =>
      jsonHeaders({ href: 'https://github.com/user-attachments/assets/abc' }),
    )

    const result = await upload(fakeFetch as typeof fetch)

    expect(result).toBe('https://github.com/user-attachments/assets/abc')
    const [uploadUrl, init] = fakeFetch.mock.calls[0]
    const url = new URL(String(uploadUrl))
    expect(url.origin + url.pathname).toBe('https://uploads.github.com/user-attachments/assets')
    expect(url.searchParams.get('name')).toBe('pantalla.png')
    expect(url.searchParams.get('content_type')).toBe('image/png')
    expect(url.searchParams.get('repository_id')).toBe('123456')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('image/png')
    const sent = new Uint8Array(await (init?.body as Blob).arrayBuffer())
    expect(sent).toEqual(PNG_BYTES)
  })

  it('falla con un error etiquetado cuando GitHub rechaza la subida', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response('forbidden', { status: 403 }))

    await expect(upload(fakeFetch as typeof fetch)).rejects.toMatchObject({
      _tag: 'AttachmentUploadError',
      message: 'GitHub devolvió 403.',
      status: 403,
    })
  })

  it('falla con un error etiquetado cuando la red falla', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    })

    const error = await upload(fakeFetch as typeof fetch).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(AttachmentUploadError)
    expect(error).toMatchObject({ message: 'network down' })
    expect((error as AttachmentUploadError).status).toBeUndefined()
  })
})

const REPO_URL = 'https://api.github.com/repos/org/repo'
const UPLOAD_URL = 'https://uploads.github.com/'

interface GithubFake {
  /** Respuesta de `GET /repos/org/repo` (id del repositorio). */
  repository?: () => Response
  /** Respuesta del endpoint de subida de adjuntos. */
  upload?: () => Response
  requests: Array<{ url: string; body: string }>
  fetch: typeof fetch
}

/** GitHub como único borde externo: el subidor de adjuntos y el servicio de issues son los reales. */
function githubFake(overrides: Pick<GithubFake, 'repository' | 'upload'> = {}): GithubFake {
  const fake: GithubFake = {
    repository: () => jsonHeaders({ id: 123456 }),
    upload: () => jsonHeaders({ href: 'https://github.com/user-attachments/assets/abc' }),
    ...overrides,
    requests: [],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      fake.requests.push({ url, body: typeof init?.body === 'string' ? init.body : '' })
      if (url === REPO_URL) return fake.repository!()
      if (url.startsWith(UPLOAD_URL)) return fake.upload!()
      return issueResponse()
    }) as typeof fetch,
  }
  return fake
}

/** El test es el borde: ejecuta el efecto con el `fetch` falso como capa Http. */
function createIssueFromWebReport(
  payload: IssueReportPayload,
  github: GithubFake,
): Promise<{ number: number; url: string }> {
  return Effect.runPromise(
    Effect.provideService(createIssueFromWebReportEffect(payload, reporter, ENV), Http, {
      request: github.fetch,
    }),
  )
}

function issueBody(github: GithubFake): string {
  const created = github.requests.find(({ url }) => url.endsWith('/issues'))
  return JSON.parse(created!.body).body
}

describe('createIssueFromWebReport con adjuntos', () => {
  it('escribe la sección «Adjuntos» con una referencia por imagen subida', async () => {
    const github = githubFake()

    await createIssueFromWebReport(reportWith([attachment]), github)

    expect(issueBody(github)).toContain('### Adjuntos')
    expect(issueBody(github)).toContain(
      '![pantalla.png](https://github.com/user-attachments/assets/abc)',
    )
  })

  it('crea la issue igualmente y lo indica si una subida falla', async () => {
    const github = githubFake({ upload: () => new Response('boom', { status: 500 }) })
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await createIssueFromWebReport(reportWith([attachment]), github)

    expect(result.number).toBe(77)
    expect(logError.mock.calls).toContainEqual([
      '[github] Adjunto no subido',
      'GitHub devolvió 500.',
    ])
    expect(issueBody(github)).toContain('### Adjuntos')
    expect(issueBody(github)).toContain('pantalla.png')
    expect(issueBody(github)).toContain('no se pudo subir')
    expect(issueBody(github)).not.toContain('![pantalla.png]')
  })

  it('avisa de una subida fallida con el estado HTTP y sin texto libre', async () => {
    const github = githubFake({ upload: () => new Response('forbidden', { status: 403 }) })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await createIssueFromWebReport(reportWith([attachment]), github)

    expect(sentry.events).toHaveLength(1)
    expect(sentry.events[0].tags).toEqual({ 'report.stage': 'upload', 'report.reason': 'http-403' })
  })

  it('un error de subida sin estado se avisa con un motivo fijo, no con su texto', async () => {
    const github = githubFake({
      upload: () => {
        throw new Error('texto libre SECRET_MARKER')
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await createIssueFromWebReport(reportWith([attachment]), github)

    expect(sentry.events).toHaveLength(1)
    expect(sentry.events[0].tags).toEqual({ 'report.stage': 'upload', 'report.reason': 'failed' })
    expect(JSON.stringify(sentry.events)).not.toContain('SECRET_MARKER')
  })

  it('un reporte sin adjuntos no incluye la sección y no sube nada', async () => {
    const github = githubFake()

    await createIssueFromWebReport(reportWith(undefined), github)

    expect(github.requests.map(({ url }) => url)).toEqual([`${REPO_URL}/issues`])
    expect(issueBody(github)).not.toContain('### Adjuntos')
  })

  it('crea la issue sin adjuntos cuando no se puede leer el id del repositorio', async () => {
    const github = githubFake({ repository: () => jsonHeaders({ message: 'Not Found' }, 404) })
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await createIssueFromWebReport(reportWith([attachment]), github)

    expect(result.number).toBe(77)
    expect(github.requests.some(({ url }) => url.startsWith(UPLOAD_URL))).toBe(false)
    expect(logError.mock.calls).toContainEqual([
      '[github] Adjunto no subido',
      'No se pudo leer el repositorio (404).',
    ])
    expect(issueBody(github)).toContain('no se pudo subir')
  })

  it('lee el id del repositorio una sola vez aunque el reporte traiga varios adjuntos', async () => {
    const github = githubFake()

    await createIssueFromWebReport(reportWith([attachment, attachment, attachment]), github)

    const urls = github.requests.map(({ url }) => url)
    expect(urls.filter((url) => url === REPO_URL)).toHaveLength(1)
    expect(urls.filter((url) => url.startsWith(UPLOAD_URL))).toHaveLength(3)
    expect(urls.filter((url) => url.includes('repository_id=123456'))).toHaveLength(3)
  })
})
