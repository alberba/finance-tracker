import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { createTestDb, type TestDatabase } from '../d1-v2/setup'
import type { Db } from '../../../src/db/client'
import { createAuthentication } from '../../../src/lib/server/auth/better-auth'
import {
  authenticatedPrincipal,
  createInvitation,
  registrationAdministration,
  updateRegistrationPolicy,
} from '../../../src/db/repositories/authentication'
import { runWithDb } from '../../../src/db/database'

let database: TestDatabase
let auth: ReturnType<typeof createAuthentication>
let email: string
let verified: boolean
let code: string
const baseURL = 'http://localhost:4321'
beforeEach(async () => {
  database = createTestDb()
  email = 'provider@example.com'
  verified = true
  const keys = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'auth-fixture', alg: 'RS256' }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url === 'https://github.com/login/oauth/access_token')
        return Response.json({
          access_token: 'fixture-token',
          token_type: 'bearer',
          scope: 'read:user,user:email',
        })
      if (url === 'https://api.github.com/user')
        return Response.json({ id: 275, login: 'fixture', name: 'Invited', email })
      if (url === 'https://api.github.com/user/emails')
        return Response.json([{ email, primary: true, verified }])
      if (url === 'https://oauth2.googleapis.com/token') {
        const token = await new SignJWT({
          sub: 'google-sub-275',
          name: 'Invited',
          email,
          email_verified: verified,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'auth-fixture' })
          .setIssuer('https://accounts.google.com')
          .setAudience('google-fixture')
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(keys.privateKey)
        return Response.json({
          access_token: 'fixture-token',
          token_type: 'bearer',
          expires_in: 3600,
          id_token: token,
        })
      }
      if (url === 'https://www.googleapis.com/oauth2/v3/certs')
        return Response.json({ keys: [jwk] })
      throw new Error(`Unexpected external request: ${url}`)
    }),
  )
  auth = createAuthentication(
    database.db as unknown as Db,
    {
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: 'fixture-auth-secret-longer-than-thirty-two-characters',
      GOOGLE_CLIENT_ID: 'google-fixture',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      GITHUB_CLIENT_ID: 'github-fixture',
      GITHUB_CLIENT_SECRET: 'github-secret',
    },
    async ({ text }) => {
      code = text.match(/\b\d{6}\b/)?.[0] ?? ''
    },
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  database.close()
})
function cookies(response: Response, existing = '') {
  return [existing, ...response.headers.getSetCookie().map((cookie) => cookie.split(';')[0])]
    .filter(Boolean)
    .join('; ')
}
async function post(path: string, body: unknown, cookie = '') {
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseURL, cookie },
      body: JSON.stringify(body),
    }),
  )
}
async function oauth(provider: string, cookie = '', linking = false) {
  const start = await post(
    linking ? '/link-social' : '/sign-in/social',
    { provider, callbackURL: '/', errorCallbackURL: '/login', disableRedirect: true },
    cookie,
  )
  expect(start.status).toBe(200)
  const authorization = new URL((await start.json()).url)
  const callback = new URL(authorization.searchParams.get('redirect_uri')!)
  callback.searchParams.set('code', 'fixture-code')
  callback.searchParams.set('state', authorization.searchParams.get('state')!)
  const response = await auth.handler(
    new Request(callback, { headers: { cookie: cookies(start, cookie) } }),
  )
  return { response, cookie: cookies(response, cookie) }
}
for (const provider of ['google', 'github']) {
  it(`admits a verified ${provider} registration through the invitation boundary`, async () => {
    const { token } = await runWithDb(database.db as unknown as Db, createInvitation('administrator', 1))
    const { response, cookie } = await oauth(provider, `finance-invitation=${token}`)
    expect(response.headers.get('location')).toBe('/')
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(
      await runWithDb(database.db as unknown as Db, authenticatedPrincipal(session!.user.id)),
    ).toMatchObject({ email })
    expect(
      (await runWithDb(database.db as unknown as Db, registrationAdministration())).invitations[0].uses,
    ).toBe(1)
  })
  it(`does not grant private access for an unverified ${provider} email`, async () => {
    verified = false
    await runWithDb(database.db as unknown as Db, updateRegistrationPolicy(true))
    const { cookie } = await oauth(provider)
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user.emailVerified).toBe(false)
    expect(await runWithDb(database.db as unknown as Db, authenticatedPrincipal(session!.user.id))).toBeNull()
  })
}
it('rejects implicit matching-email linking and allows deliberate verified linking', async () => {
  const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {})
  await runWithDb(database.db as unknown as Db, updateRegistrationPolicy(true))
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const login = await post('/sign-in/email-otp', { email, otp: code })
  const identity = (await login.json()).user.id
  const rejected = await oauth('github')
  expect(rejected.response.headers.get('location')).toContain('error=')
  expect(loggedError).toHaveBeenCalledOnce()
  expect(loggedError.mock.calls[0].map(String).join(' ')).toContain('account_not_linked')
  const linked = await oauth('github', cookies(login), true)
  expect(linked.response.headers.get('location')).toBe('/')
  const returnLogin = await oauth('github')
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: returnLogin.cookie }),
  })
  expect(session?.user.id).toBe(identity)
})

it('does not link an unverified provider even when the user deliberately requests it', async () => {
  const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {})
  await runWithDb(database.db as unknown as Db, updateRegistrationPolicy(true))
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const login = await post('/sign-in/email-otp', { email, otp: code })
  verified = false
  const result = await oauth('github', cookies(login), true)
  expect(result.response.headers.get('location')).toContain('error=')
  expect(loggedError).toHaveBeenCalledOnce()
  expect(loggedError.mock.calls[0].map(String).join(' ')).toContain('untrusted provider')
})

it('external provider failure leaves the invitation available for retry', async () => {
  const loggedError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { token } = await runWithDb(database.db as unknown as Db, createInvitation('administrator', 1))
  const externalFetch = globalThis.fetch
  vi.stubGlobal('fetch', async () =>
    Response.json({ error: 'temporarily_unavailable' }, { status: 503 }),
  )
  const failed = await oauth('github', `finance-invitation=${token}`)
  expect(failed.response.headers.get('location')).toContain('error=')
  expect(loggedError).toHaveBeenCalledOnce()
  expect(loggedError.mock.calls[0].map(String).join(' ')).toContain(
    'GitHub OAuth token exchange failed',
  )
  expect((await runWithDb(database.db as unknown as Db, registrationAdministration())).invitations[0].uses).toBe(
    0,
  )
  vi.stubGlobal('fetch', externalFetch)
  const retried = await oauth('github', `finance-invitation=${token}`)
  expect(retried.response.headers.get('location')).toBe('/')
  expect((await runWithDb(database.db as unknown as Db, registrationAdministration())).invitations[0].uses).toBe(
    1,
  )
})
