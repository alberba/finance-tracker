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
  authorAssociation?: string
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
  calls: string[]
  queries: string[]
  failGraphql?: boolean
  failUser?: boolean
}

const OWNER = 'acme'
const REPO = 'finance-tracker'
const BOT = 'finance-bot'

/** Página de comentarios del final del hilo; el cursor es `c<índice>`. */
function commentPage(comments: FakeComment[], before: string | null, size: number) {
  const end = before ? Number(before.slice(1)) : comments.length
  const start = Math.max(0, end - size)
  return {
    nodes: comments.slice(start, end),
    totalCount: comments.length,
    pageInfo: {
      hasPreviousPage: start > 0,
      startCursor: start < comments.length ? `c${start}` : null,
    },
  }
}

function commentNodes(comments: FakeComment[]) {
  return comments.map((comment) => ({
    databaseId: comment.id,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    body: comment.body,
    author: { __typename: comment.type ?? 'User', login: comment.login },
    authorAssociation: comment.authorAssociation ?? 'MEMBER',
  }))
}

function issueRef(
  issue: FakeIssue,
  pageSize: number,
  before: string | null = null,
  withComments = true,
): Record<string, unknown> {
  const page = commentPage(issue.comments ?? [], before, pageSize)
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
    ...(withComments
      ? {
          comments: {
            totalCount: page.totalCount,
            pageInfo: page.pageInfo,
            nodes: commentNodes(page.nodes),
          },
        }
      : {}),
    ...(issue.duplicateOf
      ? { duplicateOf: issueRef(issue.duplicateOf, pageSize, null, withComments) }
      : {}),
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

      if (url.endsWith('/user')) {
        return state.failUser ? json({ message: 'boom' }, 500) : json({ login: BOT })
      }
      if (url.endsWith('/graphql')) {
        if (state.failGraphql) return json({ message: 'boom' }, 500)
        const body = JSON.parse(String(init?.body)) as {
          query: string
          variables: Record<string, unknown>
        }
        state.queries.push(body.query)
        // GitHub rechaza una consulta con la misma variable declarada dos veces:
        // reproducimos ese fallo para cubrir dos reportes que siguen la misma issue.
        const declarations = [...body.query.matchAll(/\$c(\d+):/g)].map((match) => match[1])
        if (new Set(declarations).size !== declarations.length) {
          return json({ errors: [{ type: 'BAD_REQUEST', message: 'duplicate variable' }] })
        }
        const pageSize = Number(/comments\(last: (\d+)/.exec(body.query)?.[1] ?? 100)

        // Hilo del detalle: una sola issue por variable, con paginación hacia atrás.
        if (body.query.includes('issue(number: $number)')) {
          const number = Number(body.variables.number)
          const before = typeof body.variables.before === 'string' ? body.variables.before : null
          const comments = state.issues.get(number)?.comments ?? []
          const page = commentPage(comments, before, pageSize)
          return json({
            data: {
              repository: {
                issue: { comments: { ...page, nodes: commentNodes(page.nodes) } },
              },
            },
          })
        }

        // Página anterior de la ventana de novedades: un alias por issue.
        if (body.query.includes('before: $c')) {
          const repository: Record<string, unknown> = {}
          for (const match of body.query.matchAll(
            /i(\d+): issue\(number: (\d+)\) \{ comments\(last: (\d+), before: \$c\d+\)/g,
          )) {
            const number = Number(match[2])
            const comments = state.issues.get(number)?.comments ?? []
            const before = String(body.variables[`c${match[1]}`] ?? '')
            const page = commentPage(comments, before, Number(match[3]))
            repository[`i${match[1]}`] = {
              comments: { ...page, nodes: commentNodes(page.nodes) },
            }
          }
          return json({ data: { repository } })
        }

        const repository: Record<string, unknown> = {}
        for (const match of body.query.matchAll(/i(\d+): issue\(number: (\d+)\)/g)) {
          const issue = state.issues.get(Number(match[2]))
          repository[`i${match[1]}`] = issue ? issueRef(issue, pageSize) : null
        }
        return json({ data: { repository } })
      }

      const commentMatch = /\/issues\/comments\/(\d+)$/.exec(url)
      if (commentMatch) {
        const comment = state.comments.get(Number(commentMatch[1]))
        if (!comment) return json({ message: 'Not Found' }, 404)
        if (init?.method === 'DELETE') {
          state.comments.delete(comment.id)
          return new Response(null, { status: 204 })
        }
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

function context(
  userId: string | null,
  params: Record<string, string> = {},
  body?: unknown,
  options: { token?: string; query?: string; botLogin?: string | null } = {},
) {
  const request = new Request(`https://app.example.com/api/reports${options.query ?? ''}`, {
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
        GITHUB_ISSUE_TOKEN: options.token ?? 'token',
        GITHUB_OWNER: OWNER,
        GITHUB_REPO: REPO,
        ...(options.botLogin === null ? {} : { GITHUB_BOT_LOGIN: options.botLogin ?? BOT }),
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
    state = {
      issues: new Map(),
      comments: new Map(),
      calls: [],
      queries: [],
    }
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

  it('avisa de un comentario nuevo del mantenedor en un reporte normal', async () => {
    await record(userA.id, 10, '2026-10-01T00:00:00.000Z')
    state.issues.set(10, {
      number: 10,
      title: 'Abierta',
      state: 'OPEN',
      stateReason: null,
      comments: [
        {
          id: 1,
          body: 'Lo revisamos esta semana.',
          issueNumber: 10,
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
          login: 'ana',
        },
      ],
    })

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const body = (await (await GET(context(userA.id))).json()) as {
      reports: Array<{ hasUpdates: boolean }>
    }
    expect(body.reports[0]?.hasUpdates).toBe(true)
  })

  it('no cuenta una aclaración propia como novedad', async () => {
    await record(userA.id, 10, '2026-10-01T00:00:00.000Z')
    state.issues.set(10, {
      number: 10,
      title: 'Abierta',
      state: 'OPEN',
      stateReason: null,
      comments: [
        {
          id: 1,
          body: `<!-- finance-tracker:reporter-comment user=${userA.id} -->\n**Aclaración del reportero**\n\nmía`,
          issueNumber: 10,
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
          login: BOT,
        },
      ],
    })

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const body = (await (await GET(context(userA.id))).json()) as {
      reports: Array<{ hasUpdates: boolean }>
    }
    expect(body.reports[0]?.hasUpdates).toBe(false)
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

  it('falla la lista si no puede identificar al bot, en vez de perder avisos', async () => {
    await record(userA.id, 10)
    state.issues.set(10, {
      number: 10,
      title: 'Abierta',
      state: 'OPEN',
      stateReason: null,
      comments: [
        {
          id: 1,
          body: 'Lo revisamos.',
          issueNumber: 10,
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
          login: 'ana',
        },
      ],
    })
    state.failUser = true

    const { GET } = await import('../../../../src/pages/api/reports/index')
    // Token propio: el login del bot se cachea por token entre peticiones. Sin
    // `GITHUB_BOT_LOGIN`, la única forma de identificarlo es `GET /user`.
    const response = await GET(
      context(userA.id, {}, undefined, { token: 'token-sin-bot', botLogin: null }),
    )
    expect(response.status).toBe(502)
  })

  it('pagina la lista y cuenta los avisos de las páginas que aún no se han cargado', async () => {
    for (let number = 1; number <= 25; number += 1) {
      await record(userA.id, number, `2026-10-${String(number).padStart(2, '0')}T00:00:00.000Z`)
      state.issues.set(number, {
        number,
        title: `Reporte ${number}`,
        state: 'OPEN',
        stateReason: null,
      })
    }
    // La novedad vive en la entrada más antigua: cae en la segunda página.
    state.issues.get(1)!.comments = [
      {
        id: 1,
        body: 'Lo revisamos.',
        issueNumber: 1,
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
        login: 'ana',
      },
    ]

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const first = (await (await GET(context(userA.id))).json()) as {
      reports: Array<{ number: number }>
      hasMore: boolean
      nextCursor: string | null
      unseenCount: number
    }
    expect(first.reports.map((report) => report.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => 25 - index),
    )
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).not.toBeNull()
    expect(first.unseenCount).toBe(1)

    const second = (await (
      await GET(
        context(userA.id, {}, undefined, {
          query: `?cursor=${encodeURIComponent(first.nextCursor as string)}`,
        }),
      )
    ).json()) as {
      reports: Array<{ number: number }>
      hasMore: boolean
      nextCursor: string | null
      unseenCount?: number
    }
    expect(second.reports.map((report) => report.number)).toEqual([5, 4, 3, 2, 1])
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBeNull()
    expect(second.unseenCount).toBeUndefined()
  })

  it('sigue paginando el hilo hasta encontrar el aviso del mantenedor', async () => {
    await record(userA.id, 10, '2026-10-05T00:00:00.000Z')
    const comments = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      body:
        index === 0
          ? 'Lo miramos con calma.'
          : `<!-- finance-tracker:reporter-comment user=${userA.id} -->\n**Aclaración del reportero**\n\nnota ${index}`,
      issueNumber: 10,
      createdAt: `2026-10-${String(10 + Math.floor(index / 10)).padStart(2, '0')}T${String(index % 10).padStart(2, '0')}:00:00.000Z`,
      updatedAt: '2026-10-11T00:00:00.000Z',
      login: index === 0 ? 'ana' : BOT,
    }))
    state.issues.set(10, {
      number: 10,
      title: 'Abierta',
      state: 'OPEN',
      stateReason: null,
      comments,
    })

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const body = (await (await GET(context(userA.id))).json()) as {
      reports: Array<{ hasUpdates: boolean }>
    }
    expect(body.reports[0]?.hasUpdates).toBe(true)
    expect(state.queries.some((query) => query.includes('before: $c'))).toBe(true)
  })

  it('no repite variables GraphQL cuando dos reportes siguen la misma principal', async () => {
    await record(userA.id, 10, '2026-10-01T00:00:00.000Z')
    await record(userA.id, 11, '2026-10-01T00:00:00.000Z')
    const main: FakeIssue = {
      number: 20,
      title: 'Principal',
      state: 'OPEN',
      stateReason: null,
      comments: Array.from({ length: 30 }, (_, index) => ({
        id: 100 + index,
        body: `<!-- finance-tracker:reporter-comment user=${userA.id} -->\n**Aclaración del reportero**\n\nnota ${index + 1}`,
        issueNumber: 20,
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
        login: BOT,
      })),
    }
    state.issues.set(20, main)
    state.issues.set(10, {
      number: 10,
      title: 'Duplicada A',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      duplicateOf: main,
    })
    state.issues.set(11, {
      number: 11,
      title: 'Duplicada B',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      duplicateOf: main,
    })

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const response = await GET(context(userA.id))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { reports: Array<{ followed?: { number: number } }> }
    expect(body.reports.map((report) => report.followed?.number)).toEqual([20, 20])
    expect(state.queries.filter((query) => query.includes('before: $c0'))).toHaveLength(1)
  })

  it('vuelve a la issue original cuando un salto posterior de la duplicada es inaccesible', async () => {
    await record(userA.id, 10)
    state.issues.set(10, {
      number: 10,
      title: 'Original',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      duplicateOf: {
        number: 20,
        title: 'Intermedia',
        state: 'CLOSED',
        stateReason: 'DUPLICATE',
      },
    })

    const { GET } = await import('../../../../src/pages/api/reports/index')
    const body = (await (await GET(context(userA.id))).json()) as {
      reports: Array<{
        followed?: unknown
        duplicateLinkUnavailable?: boolean
        stateReason?: string | null
      }>
    }
    expect(body.reports[0]?.followed).toBeUndefined()
    expect(body.reports[0]?.duplicateLinkUnavailable).toBe(true)
    expect(body.reports[0]?.stateReason).toBe('DUPLICATE')
  })

  it('devuelve el hilo completo aunque supere una página de comentarios', async () => {
    await record(userA.id, 10)
    state.issues.set(10, {
      number: 10,
      title: 'Abierta',
      state: 'OPEN',
      stateReason: null,
      comments: Array.from({ length: 150 }, (_, index) => ({
        id: index + 1,
        body: `Comentario ${index + 1}`,
        issueNumber: 10,
        createdAt: `2026-09-${String(1 + (index % 28)).padStart(2, '0')}T00:00:00.000Z`,
        updatedAt: '2026-09-01T00:00:00.000Z',
        login: 'ana',
      })),
    })

    const { GET } = await import('../../../../src/pages/api/reports/[number]/index')
    const response = await GET(context(userA.id, { number: '10' }))
    const body = (await response.json()) as {
      detail: { thread: Array<{ id: number }> }
    }
    expect(body.detail.thread).toHaveLength(150)
    expect(body.detail.thread[0]?.id).toBe(1)
    expect(state.queries.filter((query) => query.includes('issue(number: $number)'))).toHaveLength(
      2,
    )
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
    state.issues.set(20, {
      number: 20,
      title: 'Principal',
      state: 'OPEN',
      stateReason: null,
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
        {
          id: 5,
          body: 'Yo también lo veo, pero no soy del equipo.',
          issueNumber: 20,
          createdAt: '2026-10-02T04:00:00.000Z',
          updatedAt: '2026-10-02T04:00:00.000Z',
          login: 'tercero',
          authorAssociation: 'NONE',
        },
      ],
    })

    const { GET } = await import('../../../../src/pages/api/reports/[number]/index')
    const response = await GET(context(userA.id, { number: '10' }))
    const body = (await response.json()) as {
      detail: {
        threadIssue: { number: number }
        thread: Array<{ id: number; kind: string; text: string; editable: boolean }>
      }
    }
    expect(body.detail.threadIssue.number).toBe(20)
    expect(body.detail.thread.map((item) => item.id)).toEqual([1, 4])
    expect(body.detail.thread[1]).toMatchObject({ kind: 'reporter', text: 'mía', editable: true })
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

  it('devuelve 404 si el comentario existe pero no pertenece a este reporte', async () => {
    await record(userA.id, 10)
    state.issues.set(10, { number: 10, title: 'Abierta', state: 'OPEN', stateReason: null })
    state.issues.set(20, { number: 20, title: 'Otro reporte', state: 'OPEN', stateReason: null })
    state.comments.set(50, {
      id: 50,
      body: `<!-- finance-tracker:reporter-comment user=${userA.id} -->\n**Aclaración del reportero**\n\nmía`,
      issueNumber: 20,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      login: BOT,
    })

    const { PATCH } =
      await import('../../../../src/pages/api/reports/[number]/comments/[commentId]')
    const response = await PATCH(
      context(userA.id, { number: '10', commentId: '50' }, { text: 'cambio', keepAttachments: [] }),
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ ok: false, error: 'Reporte no encontrado.' })
  })

  it('edita y borra una aclaración publicada en la principal que se sigue', async () => {
    await record(userA.id, 10)
    state.issues.set(10, {
      number: 10,
      title: 'Original',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      duplicateOf: { number: 20, title: 'Principal', state: 'OPEN', stateReason: null },
    })
    state.issues.set(20, { number: 20, title: 'Principal', state: 'OPEN', stateReason: null })
    state.comments.set(50, {
      id: 50,
      body: `<!-- finance-tracker:reporter-comment user=${userA.id} -->\n**Aclaración del reportero**\n\nmía`,
      issueNumber: 20,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      login: BOT,
    })

    const { PATCH, DELETE } =
      await import('../../../../src/pages/api/reports/[number]/comments/[commentId]')
    const patched = await PATCH(
      context(
        userA.id,
        { number: '10', commentId: '50' },
        { text: 'editada', keepAttachments: [] },
      ),
    )
    expect(patched.status).toBe(200)
    expect(state.comments.get(50)?.body).toContain('editada')

    const deleted = await DELETE(context(userA.id, { number: '10', commentId: '50' }))
    expect(deleted.status).toBe(204)
    expect(state.comments.has(50)).toBe(false)
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

  it('normaliza la marca de visto a ISO con milisegundos antes del max()', async () => {
    await record(userA.id, 10)
    const { POST } = await import('../../../../src/pages/api/reports/[number]/seen')

    expect(
      (await POST(context(userA.id, { number: '10' }, { seenAt: '2026-10-10T00:00:00Z' }))).status,
    ).toBe(204)
    const first = testDb.sqlite
      .prepare('SELECT last_seen_at FROM issue_reports WHERE issue_number = 10')
      .get() as { last_seen_at: string }
    expect(first.last_seen_at).toBe('2026-10-10T00:00:00.000Z')

    // Sin normalizar, «…00Z» ordena después de «…00.500Z» y el max() no avanza.
    expect(
      (await POST(context(userA.id, { number: '10' }, { seenAt: '2026-10-10T00:00:00.500Z' })))
        .status,
    ).toBe(204)
    const second = testDb.sqlite
      .prepare('SELECT last_seen_at FROM issue_reports WHERE issue_number = 10')
      .get() as { last_seen_at: string }
    expect(second.last_seen_at).toBe('2026-10-10T00:00:00.500Z')
  })

  it('limita las lecturas de la lista', async () => {
    const { reportListLimiter } = await import('../../../../src/lib/server/rate-limit')
    for (let index = 0; index < 30; index += 1) reportListLimiter.consume(userA.id)
    const { GET } = await import('../../../../src/pages/api/reports/index')
    const response = await GET(context(userA.id))
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Demasiadas peticiones. Inténtalo en un minuto.',
    })
  })

  it('limita las escrituras de comentarios', async () => {
    const { reportCommentLimiter } = await import('../../../../src/lib/server/rate-limit')
    for (let index = 0; index < 10; index += 1) reportCommentLimiter.consume(userA.id)
    const { POST } = await import('../../../../src/pages/api/reports/[number]/comments/index')
    const response = await POST(context(userA.id, { number: '10' }, { text: 'hola' }))
    expect(response.status).toBe(429)
  })
})
