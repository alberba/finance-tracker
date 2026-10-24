import { describe, expect, it, vi } from 'vitest'
import {
  uploadIssueAttachment,
  type AttachmentUploadContext,
} from '../../src/lib/server/issue-attachments'
import { createIssueFromWebReport, type IssueReporter } from '../../src/lib/server/github-issues'
import {
  parseIssueReportPayload,
  type IssueReportPayload,
  type ResolvedAttachment,
} from '../../src/lib/server/issue-report-schema'

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
  const context = (fetchFn: typeof fetch): AttachmentUploadContext => ({
    fetch: fetchFn,
    token: 'token',
    owner: 'org',
    repo: 'repo',
  })

  it('sube los bytes al endpoint de adjuntos y devuelve la URL del recurso', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.startsWith('https://api.github.com/repos/org/repo')) {
        return jsonHeaders({ id: 123456 })
      }
      return jsonHeaders({ href: 'https://github.com/user-attachments/assets/abc' })
    })

    const result = await uploadIssueAttachment(attachment, context(fakeFetch as typeof fetch))

    expect(result).toEqual({
      ok: true,
      url: 'https://github.com/user-attachments/assets/abc',
    })
    const uploadCall = fakeFetch.mock.calls.find(([input]) =>
      String(input).startsWith('https://uploads.github.com/user-attachments/assets'),
    )
    expect(uploadCall).toBeDefined()
    const [uploadUrl, init] = uploadCall!
    const url = new URL(String(uploadUrl))
    expect(url.searchParams.get('name')).toBe('pantalla.png')
    expect(url.searchParams.get('content_type')).toBe('image/png')
    expect(url.searchParams.get('repository_id')).toBe('123456')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
    const sent = new Uint8Array(await (init?.body as Blob).arrayBuffer())
    expect(sent).toEqual(PNG_BYTES)
  })

  it('devuelve error sin lanzar cuando GitHub rechaza la subida', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith('https://api.github.com')) return jsonHeaders({ id: 1 })
      return new Response('forbidden', { status: 403 })
    })

    const result = await uploadIssueAttachment(attachment, context(fakeFetch as typeof fetch))

    expect(result.ok).toBe(false)
  })

  it('devuelve error sin lanzar cuando la red falla', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    })

    const result = await uploadIssueAttachment(attachment, context(fakeFetch as typeof fetch))

    expect(result.ok).toBe(false)
  })
})

describe('createIssueFromWebReport con adjuntos', () => {
  it('escribe la sección «Adjuntos» con una referencia por imagen subida', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => issueResponse())
    const uploadAttachment = vi.fn(async () => ({
      ok: true as const,
      url: 'https://github.com/user-attachments/assets/abc',
    }))

    await createIssueFromWebReport(reportWith([attachment]), reporter, ENV, {
      fetch: fakeFetch as typeof fetch,
      uploadAttachment,
    })

    expect(uploadAttachment).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fakeFetch.mock.calls[0][1]?.body))
    expect(body.body).toContain('### Adjuntos')
    expect(body.body).toContain('![pantalla.png](https://github.com/user-attachments/assets/abc)')
  })

  it('crea la issue igualmente y lo indica si una subida falla', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => issueResponse())
    const uploadAttachment = vi.fn(async () => ({ ok: false as const, error: 'GitHub 500' }))

    const result = await createIssueFromWebReport(reportWith([attachment]), reporter, ENV, {
      fetch: fakeFetch as typeof fetch,
      uploadAttachment,
    })

    expect(result.number).toBe(77)
    const body = JSON.parse(String(fakeFetch.mock.calls[0][1]?.body))
    expect(body.body).toContain('### Adjuntos')
    expect(body.body).toContain('pantalla.png')
    expect(body.body).toContain('no se pudo subir')
    expect(body.body).not.toContain('![pantalla.png]')
  })

  it('un reporte sin adjuntos no incluye la sección y no sube nada', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => issueResponse())
    const uploadAttachment = vi.fn()

    await createIssueFromWebReport(reportWith(undefined), reporter, ENV, {
      fetch: fakeFetch as typeof fetch,
      uploadAttachment,
    })

    expect(uploadAttachment).not.toHaveBeenCalled()
    const body = JSON.parse(String(fakeFetch.mock.calls[0][1]?.body))
    expect(body.body).not.toContain('### Adjuntos')
  })
})
