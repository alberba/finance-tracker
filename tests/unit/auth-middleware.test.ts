import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { AuthPrincipal } from '../../src/lib/server/auth/principal'

const { getDb, createAuthentication, authenticatedPrincipal, resolvePrincipal } = vi.hoisted(
  () => ({
    getDb: vi.fn(),
    createAuthentication: vi.fn(),
    authenticatedPrincipal: vi.fn(),
    resolvePrincipal: vi.fn(),
  }),
)

vi.mock('../../src/db/client', () => ({ getDb }))
vi.mock('../../src/db/repositories/authentication', () => ({ authenticatedPrincipal }))
vi.mock('../../src/lib/server/auth/better-auth', () => ({ createAuthentication }))
vi.mock('../../src/lib/server/auth/principal', () => ({ resolvePrincipal }))

import { onRequest, TEST_AUTH_PROVIDER } from '../../src/middleware'

const authenticated: AuthPrincipal = {
  userId: 'financial-user',
  email: 'person@example.test',
  provider: 'better-auth',
  subject: 'auth-user',
}

function makeContext(
  options: {
    url?: string
    headers?: Record<string, string>
    env?: Record<string, string>
    method?: string
  } = {},
) {
  const request = new Request(options.url ?? 'https://app.example.test/api/session', {
    headers: options.headers,
    method: options.method,
  })
  const locals: Record<string, unknown> = { runtimeEnv: options.env ?? {} }
  return {
    request,
    locals,
    redirect: (url: string) => Response.redirect(`https://app.example.test${url}`, 302),
  } as unknown as Parameters<typeof onRequest>[0]
}

function makeNext(response = new Response('ok')) {
  return vi.fn(() => Promise.resolve(response)) as unknown as Parameters<typeof onRequest>[1]
}

function setSession(user?: { id: string; emailVerified: boolean }, cookies: string[] = []) {
  createAuthentication.mockReturnValue({
    api: {
      getSession: vi.fn().mockResolvedValue({
        json: async () => (user ? { user } : null),
        headers: new Headers(cookies.map((cookie): [string, string] => ['Set-Cookie', cookie])),
      }),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getDb.mockReturnValue({})
  authenticatedPrincipal.mockReturnValue(Effect.succeed(authenticated))
  resolvePrincipal.mockReturnValue(
    Effect.succeed({
      userId: 'test-user',
      email: 'tester@example.test',
      provider: TEST_AUTH_PROVIDER,
      subject: 'tester@example.test',
    }),
  )
  setSession()
})

describe('authentication middleware', () => {
  it('answers every request with a 503 while maintenance mode is on', async () => {
    setSession({ id: 'auth-user', emailVerified: true })
    const env = { MAINTENANCE_MODE: 'true' }

    for (const url of [
      'https://app.example.test/',
      'https://app.example.test/login?demo=1',
      'https://app.example.test/api/auth/session',
    ]) {
      const next = makeNext()
      const response = (await onRequest(makeContext({ url, env }), next)) as Response

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBeTruthy()
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(next).not.toHaveBeenCalled()
    }
    expect(createAuthentication).not.toHaveBeenCalled()
  })

  it('returns JSON to API callers during maintenance', async () => {
    const context = makeContext({
      url: 'https://app.example.test/api/sync',
      method: 'POST',
      env: { MAINTENANCE_MODE: 'true' },
    })

    const response = (await onRequest(context, makeNext())) as Response

    expect(response.status).toBe(503)
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })

  it('serves normally when maintenance mode is not exactly "true"', async () => {
    setSession({ id: 'auth-user', emailVerified: true })
    const next = makeNext()

    await onRequest(makeContext({ env: { MAINTENANCE_MODE: 'false' } }), next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('does not accept a Cf-Access assertion as a credential', async () => {
    const context = makeContext({ headers: { 'Cf-Access-Jwt-Assertion': 'valid-looking.jwt' } })
    const next = makeNext()

    const response = (await onRequest(context, next)) as Response

    expect(response.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
    expect((context.locals as App.Locals).principal).toBeUndefined()
  })

  it('accepts the test identity only on an enabled loopback request', async () => {
    const context = makeContext({
      url: 'http://127.0.0.1/api/session',
      headers: { 'X-Test-User-Email': 'Tester@Example.test' },
      env: { TEST_AUTH_ENABLED: 'true' },
    })
    const next = makeNext()

    await onRequest(context, next)

    expect(resolvePrincipal).toHaveBeenCalledWith({
      provider: TEST_AUTH_PROVIDER,
      subject: 'tester@example.test',
      email: 'tester@example.test',
    })
    expect((context.locals as App.Locals).principal).toMatchObject({ userId: 'test-user' })
    expect(next).toHaveBeenCalledOnce()
  })

  it('ignores the test identity header outside loopback', async () => {
    const context = makeContext({
      headers: { 'X-Test-User-Email': 'tester@example.test' },
      env: { TEST_AUTH_ENABLED: 'true' },
    })
    const next = makeNext()

    const response = (await onRequest(context, next)) as Response

    expect(response.status).toBe(401)
    expect(resolvePrincipal).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a queue identity that differs from the authenticated user', async () => {
    setSession({ id: 'auth-user', emailVerified: true })
    const context = makeContext({
      headers: { 'X-Finance-User-Id': 'someone-else' },
    })
    const next = makeNext()

    const response = (await onRequest(context, next)) as Response

    expect(response.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('renews session cookies and marks authenticated responses as private', async () => {
    setSession({ id: 'auth-user', emailVerified: true }, ['session=renewed; Path=/; HttpOnly'])
    const context = makeContext()
    const response = new Response('ok')

    await onRequest(context, makeNext(response))

    expect(response.headers.getSetCookie()).toContain('session=renewed; Path=/; HttpOnly')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('accepts the configured https origin when a proxy hands the app an http URL', async () => {
    setSession({ id: 'auth-user', emailVerified: true })
    const next = makeNext()
    const env = { BETTER_AUTH_URL: 'https://finance.example.test' }
    const request = (origin: string) =>
      makeContext({
        url: 'http://finance.example.test/api/session',
        method: 'POST',
        headers: { origin, 'Content-Type': 'application/json' },
        env,
      })

    await onRequest(request('https://finance.example.test'), next)
    expect(next).toHaveBeenCalledOnce()

    const forged = (await onRequest(request('https://evil.example.test'), makeNext())) as Response
    expect(forged.status).toBe(403)
  })

  it('rejects cross-site API mutations before authentication', async () => {
    const context = makeContext({
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
      },
    })
    const next = makeNext()

    const response = (await onRequest(context, next)) as Response

    expect(response.status).toBe(403)
    expect(createAuthentication).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })
})
