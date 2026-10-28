import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthPrincipal } from '../../../../src/lib/server/auth/principal'
import { createTestDb, type TestDatabase } from '../setup'
import { seedUser } from '../repositories/fixtures'

let currentDb: TestDatabase['db']
vi.mock('../../../../src/db/client', () => ({
  getDb: () => currentDb,
}))

interface FakeComment {
  id: number
  body: string
  issueNumber: number
  createdAt: string
  updatedAt: string
  login: string
  type?: string
}

interface FakeIssue {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  stateReason: string | null
  duplicateOf?: FakeIssue | null
  comments?: FakeComment[]
  statusChangedAt?: string
}

interface FakeGithub {
  issues: Map<number, FakeIssue>
  comments: Map<number, FakeComment>
  threads: Map<number, { totalCount: number; comments: FakeComment[] }>
  calls: string[]
  failGraphql?: boolean
}

const OWNER = 'acme'
const REPO = 'finance-tracker'
const BOT = 'finance-bot'

function issueRef(issue: FakeIssue): Record<string, unknown> {
  return {
    number: issue.number,
    url: `https://github.com/${OWNER}/${REPO}/issues/${issue.number}`,
    title: issue.title,
    state: issue.state,
    stateReason: issue.stateReason,
    repository: { nameWithOwner: `${OWNER}/${REPO}` },
    timelineItems: {
      nodes: issue.statusChangedAt
        ? [{ __typename: 'ClosedEvent', createdAt: issue.statusChangedAt }]
        : [],
    },
    ...(issue.comments
      ? {
          comments: {
            nodes: issue.comments.map((comment) => ({
              databaseId: comment.id,
              createdAt: comment.createdAt,
              body: comment.body,
              author: { __typename: comment.type ?? 'User', login: comment.login },
            })),
          },
        }
      : {}),
    ...(issue.duplicateOf ? { duplicateOf: issueRef(issue.duplicateOf) } : {}),
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installFakeGithub(state: FakeGithub): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      state.calls.push(`${init?.method ?? 'GET'} ${url}`)

      if (url.endsWith('/user')) return json({ login: BOT })
      if (url.endsWith('/graphql')) {
        if (state.failGraphql) return json({ message: 'boom' }, 500)
        const body = JSON.parse(String(init?.body)) as {
          query: string
          variables: Record<string, unknown>
        }
        if (body.query.includes('comments(last: 100)')) {
          const thread = state.threads.get(Number(body.variables.number))
          return json({
            data: {
              repository: {
                issue: thread
                  ? {
                      comments: {
                        totalCount: thread.totalCount,
                        nodes: thread.comments.map((comment) => ({
                          databaseId: comment.id,
                          createdAt: comment.createdAt,
                          updatedAt: comment.updatedAt,
                          body: comment.body,
                          author: { __typename: comment.type ?? 'User', login: comment.login },
                        })),
                      },
                    }
                  : null,
              },
            },
          })
        }
        const repository: Record<string, unknown> = {}
        for (const match of body.query.matchAll(/i(\d+): issue\(number: (\d+)\)/g)) {
          const issue = state.issues.get(Number(match[2]))
          repository[`i${match[1]}`] = issue ? issueRef(issue) : null
        }
        return json({ data: { repository } })
      }

      const commentMatch = /\/issues\/comments\/(\d+)$/.exec(url)
      if (commentMatch) {
        const comment = state.comments.get(Number(commentMatch[1]))
        if (!comment) return json({ message: 'Not Found' }, 404)
        if (init?.method === 'DELETE') return new Response(null, { status: 204 })
        if (init?.method === 'PATCH') {
          const payload = JSON.parse(String(init.body)) as { body: string }
          comment.body = payload.body
          comment.updatedAt = '2026-10-05T00:00:00.000Z'
        }
        return json({
          id: comment.id,
          body: comment.body,
          issue_url: `https://api.github.com/repos/${OWNER}/${REPO}/issues/${comment.issueNumber}`,
          created_at: comment.createdAt,
          updated_at: comment.updatedAt,
          user: { login: comment.login, type: comment.type ?? 'User' },
        })
      }

      const createMatch = /\/issues\/(\d+)\/comments$/.exec(url)
      if (createMatch && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { body: string }
        const comment: FakeComment = {
          id: 9000 + state.comments.size,
          body: payload.body,
          issueNumber: Number(createMatch[1]),
          createdAt: '2026-10-06T00:00:00.000Z',
          updatedAt: '2026-10-06T00:00:00.000Z',
          login: BOT,
        }
        state.comments.set(comment.id, comment)
        return json(
          {
            id: comment.id,
            body: comment.body,
            issue_url: `https://api.github.com/repos/${OWNER}/${REPO}/issues/${comment.issueNumber}`,
            created_at: comment.createdAt,
            updated_at: comment.updatedAt,
            user: { login: comment.login, type: comment.type ?? 'User' },
          },
          201,
        )
      }

      return json({ message: `sin ruta falsa para ${url}` }, 500)
    }),
  )
}

function principal(userId: string): AuthPrincipal {
  return { userId, email: `${userId}@example.com`, provider: 'test', subject: userId }
}

function context(userId: string | null, params: Record<string, string> = {}, body?: unknown) {
  const request = new Request('https://app.example.com/api/reports', {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return {
    request,
    params,
    locals: {
      ...(userId ? { principal: principal(userId) } : {}),
      runtimeEnv: {
        GITHUB_ISSUE_TOKEN: 'token',
        GITHUB_OWNER: OWNER,
        GITHUB_REPO: REPO,
        GITHUB_BOT_LOGIN: BOT,
      },
    },
  } as never
}

async function record(
  userId: string,
  issueNumber: number,
  submittedAt = '2026-10-01T00:00:00.000Z',
) {
  const { issueReportsRepository } = await import('../../../../src/db/repositories')
  const { runWithDb } = await import('../../../../src/db/database')
  await runWithDb(
    currentDb,
    issueReportsRepository.recordSubmission(userId, issueNumber, submittedAt),
  )
}

describe('/api/reports', () => {
  let testDb: TestDatabase
  let state: FakeGithub
  let userA: { id: string }
  let userB: { id: string }

  beforeEach(async () => {
    testDb = createTestDb()
    currentDb = testDb.db
    userA = await seedUser(testDb.db, 'a@example.com')
    userB = await seedUser(testDb.db, 'b@example.com')
    state = { issues: new Map(), comments: new Map(), threads: new Map(), calls: [] }
    installFakeGithub(state)
  })

  afterEach(() => {
    testDb.close()
    vi.unstubAllGlobals()
  })

  it('responde 401 sin principal', async () => {
    const { GET } = await import('../../../../src/pages/api/reports/index')
    const response = await GET(context(null))
    expect(response.status).toBe(401)
  })

  it('devuelve una lista vacía sin llamar a GitHub cuando no hay filas', async () => {
    const { GET } = await import('../../../../src/pages/api/reports/index')
    const response = await GET(context(userA.id))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, reports: [], hasMore: false })
    expect(state.calls).toEqual([])
  })

  it('lista solo los reportes de la cuenta con su estado', async () => {
    await record(userA.id, 10)
    await record(userB.id, 20)
    state.issues.set(10, { number: 10, title: 'A', state: 'OPEN', stateReason: null })
    state.issues.set(20, { number: 20, title: 'B', state: 'OPEN', stateReason: null })

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const response = await GET(context(userA.id))
    const body = (await response.json()) as { reports: Array<{ number: number }> }
    expect(body.reports.map((report) => report.number)).toEqual([10])
  })

  it('sigue a la principal cuando la original está cerrada como duplicada', async () => {
    await record(userA.id, 10)
    state.issues.set(10, {
      number: 10,
      title: 'Original',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      duplicateOf: { number: 20, title: 'Principal', state: 'OPEN', stateReason: null },
    })
    state.issues.set(20, { number: 20, title: 'Principal', state: 'OPEN', stateReason: null })

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const body = (await (await GET(context(userA.id))).json()) as {
      reports: Array<{ followed?: { number: number } }>
    }
    expect(body.reports[0]?.followed?.number).toBe(20)
  })

  it('marca no disponible una issue que GitHub ya no devuelve', async () => {
    await record(userA.id, 10)
    const { GET } = await import('../../../../src/pages/api/reports/index')
    const body = (await (await GET(context(userA.id))).json()) as {
      reports: Array<{ unavailable?: boolean; number: number }>
    }
    expect(body.reports[0]).toMatchObject({ number: 10, unavailable: true })
  })

  it('devuelve 404 uniforme y sin llamar a GitHub al pedir el reporte de otra cuenta', async () => {
    await record(userA.id, 10)
    const { GET } = await import('../../../../src/pages/api/reports/[number]/index')
    const response = await GET(context(userB.id, { number: '10' }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ ok: false, error: 'Reporte no encontrado.' })
    expect(state.calls).toEqual([])
  })

  it('devuelve 400 con un número inválido', async () => {
    const { GET } = await import('../../../../src/pages/api/reports/[number]/index')
    const response = await GET(context(userA.id, { number: '12x' }))
    expect(response.status).toBe(400)
  })

  it('devuelve 502 cuando GitHub falla', async () => {
    await record(userA.id, 10)
    state.failGraphql = true
    const { GET } = await import('../../../../src/pages/api/reports/index')
    const response = await GET(context(userA.id))
    expect(response.status).toBe(502)
  })

  it('devuelve el detalle con el hilo de la principal y oculta automatización y ajenos', async () => {
    await record(userA.id, 10)
    state.issues.set(10, {
      number: 10,
      title: 'Original',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      duplicateOf: { number: 20, title: 'Principal', state: 'OPEN', stateReason: null },
    })
    state.issues.set(20, { number: 20, title: 'Principal', state: 'OPEN', stateReason: null })
    state.threads.set(20, {
      totalCount: 4,
      comments: [
        {
          id: 1,
          body: 'Lo revisamos.',
          issueNumber: 20,
          createdAt: '2026-10-02T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
          login: 'ana',
        },
        {
          id: 2,
          body: '<!-- web-report-agent-brief --> brief',
          issueNumber: 20,
          createdAt: '2026-10-02T01:00:00.000Z',
          updatedAt: '2026-10-02T01:00:00.000Z',
          login: 'github-actions',
        },
        {
          id: 3,
          body: '<!-- finance-tracker:reporter-comment user=otro -->\n**Aclaración del reportero**\n\notra',
          issueNumber: 20,
          createdAt: '2026-10-02T02:00:00.000Z',
          updatedAt: '2026-10-02T02:00:00.000Z',
          login: BOT,
        },
        {
          id: 4,
          body: `<!-- finance-tracker:reporter-comment user=${userA.id} -->\n**Aclaración del reportero**\n\nmía`,
          issueNumber: 20,
          createdAt: '2026-10-02T03:00:00.000Z',
          updatedAt: '2026-10-02T03:00:00.000Z',
          login: BOT,
        },
      ],
    })

    const { GET } = await import('../../../../src/pages/api/reports/[number]/index')
    const response = await GET(context(userA.id, { number: '10' }))
    const body = (await response.json()) as {
      detail: {
        threadIssue: { number: number }
        thread: Array<{ id: number; kind: string; text: string; editable: boolean }>
        hiddenBefore: number
      }
    }
    expect(body.detail.threadIssue.number).toBe(20)
    expect(body.detail.thread.map((item) => item.id)).toEqual([1, 4])
    expect(body.detail.thread[1]).toMatchObject({ kind: 'reporter', text: 'mía', editable: true })
    expect(body.detail.hiddenBefore).toBe(0)
  })

  it('rechaza comentar en un hilo cerrado con 409', async () => {
    await record(userA.id, 10)
    state.issues.set(10, {
      number: 10,
      title: 'Cerrada',
      state: 'CLOSED',
      stateReason: 'COMPLETED',
    })
    const { POST } = await import('../../../../src/pages/api/reports/[number]/comments/index')
    const response = await POST(context(userA.id, { number: '10' }, { text: 'hola' }))
    expect(response.status).toBe(409)
  })

  it('publica una aclaración con su marcador y autor del bot', async () => {
    await record(userA.id, 10)
    state.issues.set(10, { number: 10, title: 'Abierta', state: 'OPEN', stateReason: null })
    const { POST } = await import('../../../../src/pages/api/reports/[number]/comments/index')
    const response = await POST(context(userA.id, { number: '10' }, { text: 'Ocurre en móvil' }))
    expect(response.status).toBe(201)
    const body = (await response.json()) as { comment: { kind: string; text: string } }
    expect(body.comment).toMatchObject({ kind: 'reporter', text: 'Ocurre en móvil' })
    const created = [...state.comments.values()][0]
    expect(created?.body).toContain(`<!-- finance-tracker:reporter-comment user=${userA.id} -->`)
  })

  it('prohíbe editar un comentario sin el marcador propio', async () => {
    await record(userA.id, 10)
    state.issues.set(10, { number: 10, title: 'Abierta', state: 'OPEN', stateReason: null })
    state.comments.set(50, {
      id: 50,
      body: 'Un comentario del mantenedor',
      issueNumber: 10,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      login: 'ana',
    })
    const { PATCH } =
      await import('../../../../src/pages/api/reports/[number]/comments/[commentId]')
    const response = await PATCH(
      context(userA.id, { number: '10', commentId: '50' }, { text: 'cambio', keepAttachments: [] }),
    )
    expect(response.status).toBe(403)
  })

  it('recorta la marca de visto a «ahora»', async () => {
    await record(userA.id, 10)
    const { POST } = await import('../../../../src/pages/api/reports/[number]/seen')
    const response = await POST(
      context(userA.id, { number: '10' }, { seenAt: '2099-01-01T00:00:00.000Z' }),
    )
    expect(response.status).toBe(204)
    const row = testDb.sqlite
      .prepare('SELECT last_seen_at FROM issue_reports WHERE issue_number = 10')
      .get() as { last_seen_at: string }
    expect(Date.parse(row.last_seen_at)).toBeLessThanOrEqual(Date.now())
  })

  it('limita las escrituras de comentarios', async () => {
    const { reportCommentLimiter } = await import('../../../../src/lib/server/rate-limit')
    for (let index = 0; index < 10; index += 1) reportCommentLimiter.consume(userA.id)
    const { POST } = await import('../../../../src/pages/api/reports/[number]/comments/index')
    const response = await POST(context(userA.id, { number: '10' }, { text: 'hola' }))
    expect(response.status).toBe(429)
  })
})
