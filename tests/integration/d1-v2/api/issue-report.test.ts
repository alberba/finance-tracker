import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWithDb } from '../../../../src/db/database'
import * as issueReportsRepo from '../../../../src/db/repositories/issue-reports'
import type { AuthPrincipal } from '../../../../src/lib/server/auth/principal'
import { seedUser } from '../repositories/fixtures'
import { createTestDb, type TestDatabase } from '../setup'

let currentDb: TestDatabase['db']
vi.mock('../../../../src/db/client', () => ({ getDb: () => currentDb }))

// Límite externo: Sentry. Se recogen las etiquetas y lo capturado.
const sentry = vi.hoisted(() => ({
  tags: [] as Array<[string, string]>,
  captured: [] as unknown[],
  messages: [] as string[],
}))
vi.mock('@sentry/cloudflare', () => ({
  withScope: (handler: (scope: object) => void) =>
    handler({
      setTag: (key: string, value: string) => sentry.tags.push([key, value]),
      setFingerprint: () => {},
    }),
  captureException: (error: unknown) => sentry.captured.push(error),
  captureMessage: (message: string) => sentry.messages.push(message),
}))

const PAYLOAD = {
  type: 'bug',
  summary: 'El saldo no cuadra',
  description: 'Después de importar el extracto el saldo queda distinto.',
  section: 'dashboard',
  context: {
    userAgent: 'vitest',
    pathname: '/dashboard',
    timestamp: '2026-08-23T00:00:00.000Z',
  },
}

const ENV = { GITHUB_TOKEN: 'token', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo' }

let testDb: TestDatabase
let githubFetch: ReturnType<typeof vi.fn>

function githubCreates(number: number) {
  githubFetch.mockResolvedValue(
    Response.json(
      { number, html_url: `https://github.com/owner/repo/issues/${number}` },
      { status: 201 },
    ),
  )
}

function principalFor(userId: string, email = 'quien@example.com'): AuthPrincipal {
  return { userId, email, provider: 'better-auth', subject: `sub-${userId}` }
}

async function report(principal: AuthPrincipal | undefined, body: unknown = PAYLOAD) {
  const { POST } = await import('../../../../src/pages/api/issues/report')
  const request = new Request('https://app.example.com/api/issues/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST({ request, locals: { principal, runtimeEnv: ENV } } as never)
}

beforeEach(() => {
  testDb = createTestDb()
  currentDb = testDb.db
  sentry.tags.length = 0
  sentry.captured.length = 0
  sentry.messages.length = 0
  githubFetch = vi.fn()
  vi.stubGlobal('fetch', githubFetch)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  testDb.close()
})

describe('POST /api/issues/report con GitHub caído', () => {
  it('responde 500 sin guardar propiedad y reporta el fallo a Sentry como error de ruta', async () => {
    const user = await seedUser(testDb.db)
    githubFetch.mockResolvedValue(new Response('Bad credentials', { status: 401 }))

    const response = await report(principalFor(user.id))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'No se pudo crear la issue' })
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(sentry.captured).toHaveLength(1)
    expect(sentry.captured[0]).toMatchObject({ message: 'GitHub API devolvió 401.' })
    expect(sentry.tags).toEqual([
      ['api.route', '/api/issues/report'],
      ['http.response.status_code', '500'],
    ])
    expect(await runWithDb(testDb.db, issueReportsRepo.listByUser(user.id))).toEqual([])
  })
})

describe('POST /api/issues/report con GitHub sano', () => {
  it('crea la issue y guarda la propiedad con el userId del principal', async () => {
    const user = await seedUser(testDb.db)
    githubCreates(654)

    const response = await report(principalFor(user.id))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      ok: true,
      issueNumber: 654,
      issueUrl: 'https://github.com/owner/repo/issues/654',
      tracked: true,
    })
    const rows = await runWithDb(testDb.db, issueReportsRepo.listByUser(user.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ issueNumber: 654 })
    expect(rows[0].originalBody).toContain('El saldo no cuadra')
    expect(sentry.captured).toEqual([])
  })

  it('si el registro falla, la issue sigue siendo un 201 con tracked false', async () => {
    // Un userId que no existe en `users` hace fallar de verdad la FK del registro.
    githubCreates(7)

    const response = await report(principalFor('usuario-inexistente'))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      ok: true,
      issueNumber: 7,
      issueUrl: 'https://github.com/owner/repo/issues/7',
      tracked: false,
    })
    expect(await runWithDb(testDb.db, issueReportsRepo.listAll())).toEqual([])
    expect(sentry.tags).toEqual([
      ['report.stage', 'track'],
      ['report.reason', 'db'],
    ])
  })
})

describe('POST /api/issues/report y el reportero', () => {
  it('firma la issue con el reportero del principal, ignorando el del payload', async () => {
    const user = await seedUser(testDb.db)
    githubCreates(1)
    const spoofed = {
      ...PAYLOAD,
      reporter: { userId: 'otro', email: 'otro@example.com', name: 'Otro' },
      email: 'otro@example.com',
    }

    const response = await report(principalFor(user.id), spoofed)

    expect(response.status).toBe(201)
    const [, init] = githubFetch.mock.calls[0] as [string, RequestInit]
    const issueBody = (JSON.parse(String(init.body)) as { body: string }).body
    expect(issueBody).toContain(`- Identificador: ${user.id}`)
    expect(issueBody).toContain('- Email: quien@example.com')
    expect(issueBody).toContain('- Nombre: n/a')
    expect(issueBody).not.toContain('otro')
  })

  it('sin principal responde 401 y no llama a GitHub', async () => {
    const response = await report(undefined)

    expect(response.status).toBe(401)
    expect(githubFetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/issues/report con un payload inválido', () => {
  it('responde 400, no llama a GitHub y no lo reporta como fallo de ruta', async () => {
    const user = await seedUser(testDb.db)

    const response = await report(principalFor(user.id), { ...PAYLOAD, summary: 'no' })

    expect(response.status).toBe(400)
    expect(githubFetch).not.toHaveBeenCalled()
    expect(sentry.captured).toEqual([])
  })
})
