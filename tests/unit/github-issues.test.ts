import { describe, expect, it, vi } from 'vitest'

import { createIssueFromWebReport as createGithubIssue } from '../../src/lib/server/github-issues'
import { runHttp } from '../../src/lib/server/runtime'

const payload = {
  type: 'bug',
  screen: 'transactions',
  reference: '00000000-0000-4000-8000-000000000100',
} as const

function createIssueFromWebReport(
  payload: Parameters<typeof createGithubIssue>[0],
  env: Parameters<typeof createGithubIssue>[1],
  request: typeof fetch,
) {
  return runHttp(createGithubIssue(payload, env), request)
}

async function captureError(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error('Expected the request to fail')
    },
    (error) => error,
  )
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
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      fakeFetch,
    )

    expect(result.number).toBe(99)
    expect(result.url).toContain('/issues/99')
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [, init] = fakeFetch.mock.calls[0]
    const body = JSON.parse(String(init?.body || '{}'))
    expect(body.labels).toEqual(
      expect.arrayContaining(['source:web-report', 'needs-triage', 'bug']),
    )
    expect(body.labels).not.toContain('type:bug')
    expect(body.type).toBe('Bug')
    expect(body).toMatchObject({
      title: 'Incidencia en Movimientos',
      body: expect.stringContaining('Referencia del caso: 00000000-0000-4000-8000-000000000100'),
    })
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
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      fakeFetch,
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
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      fakeFetch,
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
      {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      fakeFetch,
    )

    expect(result.number).toBe(7)
    expect(fakeFetch).toHaveBeenCalledTimes(2)
  })

  it('nombra el estado sin filtrar el cuerpo de GitHub en un fallo directo', async () => {
    const upstreamBody = 'UPSTREAM_BODY_MARKER_UNAUTHORIZED'
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(upstreamBody, { status: 401 }))

    const error = await captureError(
      createIssueFromWebReport(
        payload,
        {
          GITHUB_ISSUE_TOKEN: 'token',
          GITHUB_OWNER: 'org',
          GITHUB_REPO: 'repo',
        },
        fakeFetch,
      ),
    )

    expect(error.message).toContain('GitHub API devolvió 401')
    expect(error.message).not.toContain(upstreamBody)
  })

  it('nombra el estado sin filtrar el cuerpo de GitHub cuando el reintento vuelve a fallar', async () => {
    const upstreamBody = 'UPSTREAM_BODY_MARKER_FORBIDDEN'
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(upstreamBody, { status: 403 }))

    const error = await captureError(
      createIssueFromWebReport(
        payload,
        {
          GITHUB_ISSUE_TOKEN: 'token',
          GITHUB_OWNER: 'org',
          GITHUB_REPO: 'repo',
        },
        fakeFetch,
      ),
    )

    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(error.message).toContain('GitHub API devolvió 403')
    expect(error.message).not.toContain(upstreamBody)
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
      {
        GITHUB_TOKEN: 'fallback-token',
        GITHUB_OWNER: 'org',
        GITHUB_REPO: 'repo',
      },
      fakeFetch,
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
        {
          GITHUB_OWNER: 'org',
          GITHUB_REPO: 'repo',
        },
        fakeFetch,
      ),
    ).rejects.toThrow(/GITHUB_ISSUE_TOKEN o GITHUB_TOKEN/)
    expect(fakeFetch).not.toHaveBeenCalled()
  })
})
