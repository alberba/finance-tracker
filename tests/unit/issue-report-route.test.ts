import { beforeEach, describe, expect, it, vi } from 'vitest'

// Se mockean el cliente de GitHub (para forzar el fallo controlado) y el
// tracking (para que el SDK real de Sentry nunca se importe): acá solo se
// comprueba que la ruta reporta su propio 500.
const githubIssues = vi.hoisted(() => ({ createIssueFromWebReport: vi.fn() }))
const errorTracking = vi.hoisted(() => ({ reportApiRouteFailure: vi.fn() }))

vi.mock('../../src/lib/server/github-issues', () => githubIssues)
vi.mock('../../src/lib/server/error-tracking', () => errorTracking)

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
      provider: 'cf-access',
      subject: `sub-${users}`,
      isLegacyOwner: false,
    },
    runtimeEnv: {},
  }
  return { request, locals } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/issues/report con el cliente de GitHub caído', () => {
  it('respondiendo 500 sigue reportando el fallo como error de ruta', async () => {
    const error = new Error('GitHub respondió 502')
    githubIssues.createIssueFromWebReport.mockRejectedValue(error)

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
  it('crea la issue sin reportar nada', async () => {
    githubIssues.createIssueFromWebReport.mockResolvedValue({
      number: 654,
      url: 'https://github.com/alberba/finance-tracker/issues/654',
    })

    const response = await POST(makeContext())

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      ok: true,
      issueNumber: 654,
      issueUrl: 'https://github.com/alberba/finance-tracker/issues/654',
    })
    expect(errorTracking.reportApiRouteFailure).not.toHaveBeenCalled()
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
