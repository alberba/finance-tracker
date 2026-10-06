import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestDb, type TestDatabase } from '../d1-v2/setup'
import type { Db } from '../../../src/db/client'
import type { RuntimeEnv } from '../../../src/lib/server/cloudflare-env'
import { createAuthentication } from '../../../src/lib/server/auth/better-auth'
import { updateRegistrationPolicy } from '../../../src/db/repositories/authentication'
import { onRequest } from '../../../src/middleware'
import { GET as sessionRoute } from '../../../src/pages/api/session'
import { POST as proofRoute } from '../../../src/pages/api/authentication-proof'
import { consumeAuthenticationProof } from '../../../src/lib/server/auth/new-authentication'
import { GET as administrationRoute } from '../../../src/pages/api/admin/registration'

let database: TestDatabase
vi.mock('../../../src/db/client', () => ({ getDb: () => database.db }))
const env: RuntimeEnv = {
  AUTH_MODE: 'better-auth',
  BETTER_AUTH_URL: 'http://localhost:4321',
  BETTER_AUTH_SECRET: 'real-test-secret-with-more-than-thirty-two-characters',
  RESEND_API_KEY: 'fixture',
  RESEND_FROM: 'access@example.com',
}
let auth: ReturnType<typeof createAuthentication>
let code = ''
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async ({ text }: { text: string }) => {
        code = text.match(/\b\d{6}\b/)![0]
        return { error: null }
      },
    }
  },
}))
beforeEach(async () => {
  database = createTestDb()
  await updateRegistrationPolicy(database.db as unknown as Db, true)
  auth = createAuthentication(database.db as unknown as Db, env, async ({ text }) => {
    code = text.match(/\b\d{6}\b/)![0]
  })
})
afterEach(() => {
  database.close()
  vi.useRealTimers()
})
async function login(email: string) {
  const post = (path: string, body: unknown) =>
    auth.handler(
      new Request(`http://localhost:4321/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:4321' },
        body: JSON.stringify(body),
      }),
    )
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const response = await post('/sign-in/email-otp', { email, otp: code })
  const user = (await response.json()).user
  return {
    cookie: response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; '),
    user,
  }
}
async function api(path: string, cookie: string, headerIdentity?: string, body?: unknown) {
  const headers = new Headers({ cookie })
  if (headerIdentity) headers.set('X-Finance-User-Id', headerIdentity)
  if (body) {
    headers.set('content-type', 'application/json')
    headers.set('origin', 'http://localhost:4321')
  }
  const request = new Request(`http://localhost:4321${path}`, {
    headers,
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  })
  const locals = { runtimeEnv: env } as App.Locals
  const response = await onRequest(
    {
      request,
      locals,
      redirect: (url: string) => Response.redirect(`http://localhost:4321${url}`),
    } as never,
    () =>
      path === '/api/authentication-proof'
        ? (proofRoute({ request, locals } as never) as Promise<Response>)
        : path.startsWith('/api/admin/')
          ? (administrationRoute({ locals } as never) as Promise<Response>)
          : (sessionRoute({ locals } as never) as Promise<Response>),
  )
  if (!(response instanceof Response))
    throw new Error('The middleware must return an HTTP response')
  return response
}
it('resolves financial API identity from the authenticated session', async () => {
  const first = await login('first@example.com')
  const second = await login('second@example.com')
  expect((await (await api('/api/session', first.cookie)).json()).user.id).toBe(first.user.id)
  expect((await (await api('/api/session', second.cookie)).json()).user.id).toBe(second.user.id)
  expect((await api('/api/sync', second.cookie, first.user.id)).status).toBe(401)
})
it('rejects administrator actions for an admitted ordinary user', async () => {
  const { cookie } = await login('ordinary@example.com')
  expect((await api('/api/admin/registration', cookie)).status).toBe(403)
})
it('rejects a revoked session at the financial API boundary', async () => {
  const { cookie } = await login('revoked@example.com')
  await auth.handler(
    new Request('http://localhost:4321/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost:4321', 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  expect((await api('/api/session', cookie)).status).toBe(401)
})
it('renews an active session and expires an inactive one', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T00:00:00Z'))
  const { cookie } = await login('renew@example.com')
  vi.setSystemTime(new Date('2026-10-07T00:00:00Z'))
  const renewed = await api('/api/session', cookie)
  expect(renewed.status).toBe(200)
  expect(renewed.headers.getSetCookie().length).toBeGreaterThan(0)
  vi.setSystemTime(new Date('2026-11-06T00:00:01Z'))
  expect((await api('/api/session', cookie)).status).toBe(401)
})

it('requires a new OTP ceremony and issues a same-user, same-session, single-use proof', async () => {
  const original = await login('proof@example.com')
  const invalid = await api('/api/authentication-proof', original.cookie, undefined, {
    action: 'verify',
    purpose: 'local-pin-recovery',
    otp: '000000',
  })
  expect(invalid.status).toBe(400)
  await api('/api/authentication-proof', original.cookie, undefined, {
    action: 'send',
    purpose: 'local-pin-recovery',
  })
  const result = await api('/api/authentication-proof', original.cookie, undefined, {
    action: 'verify',
    purpose: 'local-pin-recovery',
    otp: code,
  })
  expect(result.status).toBe(200)
  const { proof } = await result.json()
  const cookie = result.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
  const previous = await auth.api.getSession({ headers: new Headers({ cookie: original.cookie }) })
  expect(session!.session.id).not.toBe(previous!.session.id)
  const db = database.db as unknown as Db
  expect(await consumeAuthenticationProof(db, proof, 'another-user', session!.session.id)).toBe(
    false,
  )
  expect(await consumeAuthenticationProof(db, proof, original.user.id, previous!.session.id)).toBe(
    false,
  )
  expect(await consumeAuthenticationProof(db, proof, original.user.id, session!.session.id)).toBe(
    true,
  )
  expect(await consumeAuthenticationProof(db, proof, original.user.id, session!.session.id)).toBe(
    false,
  )
})
