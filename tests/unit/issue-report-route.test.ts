import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

// Se mockean el cliente de GitHub (para forzar el fallo controlado), la base de
// datos y el tracking (para que el SDK real de Sentry nunca se importe): acá
// solo se comprueba lo que decide la ruta.
const githubIssues = vi.hoisted(() => ({ createIssueFromWebReport: vi.fn() }))
const errorTracking = vi.hoisted(() => ({
  reportApiRouteFailure: vi.fn(),
  reportReportSideFailure: vi.fn(),
}))
const db = vi.hoisted(() => ({ getDb: vi.fn(() => ({})) }))
const issueReports = vi.hoisted(() => ({ recordSubmission: vi.fn() }))

vi.mock('../../src/lib/server/github-issues', () => githubIssues)
vi.mock('../../src/lib/server/error-tracking', () => errorTracking)
vi.mock('../../src/db/client', () => db)
vi.mock('../../src/db/repositories/issue-reports', () => issueReports)

import { POST } from '../../src/pages/api/issues/report'

const ROUTE = '/api/issues/report'

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

let users = 0

function makeContext(body: unknown = PAYLOAD) {
  // Un `userId` distinto por petición: el rate limit de la ruta es de módulo y
  // no debe acoplar un test con otro.
  users += 1
  const request = new Request('https://app.example.com/api/issues/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const locals = {
    principal: {
      userId: `user-${users}`,
      email: 'quien@example.com',
      provider: 'better-auth',
      subject: `sub-${users}`,
    },
    runtimeEnv: {},
  }
  return { request, locals } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  issueReports.recordSubmission.mockReturnValue(Effect.succeed(true))
})

describe('POST /api/issues/report con el cliente de GitHub caído', () => {
  it('respondiendo 500 sigue reportando el fallo como error de ruta', async () => {
    const error = new Error('GitHub respondió 502')
    githubIssues.createIssueFromWebReport.mockReturnValue(Effect.fail(error))

    const response = await POST(makeContext())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'No se pudo crear la issue' })
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(errorTracking.reportApiRouteFailure).toHaveBeenCalledTimes(1)
    expect(errorTracking.reportApiRouteFailure).toHaveBeenCalledWith(error, {
      route: ROUTE,
      status: 500,
    })
  })
})

describe('POST /api/issues/report con el cliente de GitHub sano', () => {
  it('crea la issue y registra la propiedad con el userId del principal', async () => {
    githubIssues.createIssueFromWebReport.mockReturnValue(
      Effect.succeed({
        number: 654,
        url: 'https://github.com/alberba/finance-tracker/issues/654',
      }),
    )

    const context = makeContext()
    const response = await POST(context)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      ok: true,
      issueNumber: 654,
      issueUrl: 'https://github.com/alberba/finance-tracker/issues/654',
      tracked: true,
    })
    expect(issueReports.recordSubmission).toHaveBeenCalledWith(
      context.locals.principal?.userId,
      654,
      expect.any(String),
    )
    expect(errorTracking.reportApiRouteFailure).not.toHaveBeenCalled()
  })

  it('si el registro falla, la issue sigue siendo un 201 con tracked false', async () => {
    githubIssues.createIssueFromWebReport.mockReturnValue(
      Effect.succeed({
        number: 7,
        url: 'https://github.com/alberba/finance-tracker/issues/7',
      }),
    )
    issueReports.recordSubmission.mockReturnValue(Effect.fail(new Error('db caída')))

    const response = await POST(makeContext())

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      ok: true,
      issueNumber: 7,
      issueUrl: 'https://github.com/alberba/finance-tracker/issues/7',
      tracked: false,
    })
    expect(errorTracking.reportReportSideFailure).toHaveBeenCalledWith({
      stage: 'track',
      reason: 'db',
    })
  })
})

describe('POST /api/issues/report y el reportero', () => {
  beforeEach(() => {
    githubIssues.createIssueFromWebReport.mockReset()
  })

  it('pasa al servicio el reportero del principal, ignorando el del payload', async () => {
    githubIssues.createIssueFromWebReport.mockReturnValue(
      Effect.succeed({
        number: 1,
        url: 'https://github.com/alberba/finance-tracker/issues/1',
      }),
    )
    const spoofed = {
      ...PAYLOAD,
      reporter: { userId: 'otro', email: 'otro@example.com', name: 'Otro' },
      email: 'otro@example.com',
    }

    const context = makeContext(spoofed)
    const response = await POST(context)

    expect(response.status).toBe(201)
    const [payload, reporter] = githubIssues.createIssueFromWebReport.mock.calls[0]
    expect(reporter).toEqual({
      userId: context.locals.principal?.userId,
      email: 'quien@example.com',
      name: null,
    })
    expect(payload).not.toHaveProperty('reporter')
    expect(payload).not.toHaveProperty('email')
  })

  it('sin principal responde 401 y no crea la issue', async () => {
    const request = new Request('https://app.example.com/api/issues/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PAYLOAD),
    })
    const locals = { runtimeEnv: {} }

    const response = await POST({ request, locals } as unknown as Parameters<typeof POST>[0])

    expect(response.status).toBe(401)
    expect(githubIssues.createIssueFromWebReport).not.toHaveBeenCalled()
  })
})

describe('POST /api/issues/report con un payload inválido', () => {
  it('un 400 de validación no se reporta como fallo de ruta', async () => {
    const response = await POST(makeContext({ ...PAYLOAD, summary: 'no' }))

    expect(response.status).toBe(400)
    expect(errorTracking.reportApiRouteFailure).not.toHaveBeenCalled()
    expect(githubIssues.createIssueFromWebReport).not.toHaveBeenCalled()
  })
})
