import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTestDb, type TestDatabase } from '../d1-v2/setup'
import { createAuthentication } from '../../../src/lib/server/auth/better-auth'
import type { Db } from '../../../src/db/client'

let database: TestDatabase
let codes: Map<string, string>
let auth: ReturnType<typeof createAuthentication>
beforeEach(() => {
  database = createTestDb()
  codes = new Map()
  auth = createAuthentication(
    database.db as unknown as Db,
    {
      BETTER_AUTH_URL: 'http://localhost:4321',
      BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
    },
    async ({ email, text }) => {
      const code = text.match(/\b\d{6}\b/)?.[0]
      if (code) codes.set(email, code)
    },
  )
})
afterEach(() => database.close())
async function post(path: string, body: unknown) {
  return auth.handler(
    new Request(`http://localhost:4321/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:4321' },
      body: JSON.stringify(body),
    }),
  )
}
it('rejects a verified new registration without an invitation', async () => {
  await post('/email-otp/send-verification-otp', { email: 'new@example.com', type: 'sign-in' })
  const response = await post('/sign-in/email-otp', {
    email: 'new@example.com',
    otp: codes.get('new@example.com'),
  })
  expect(response.status).toBe(403)
})

it('admits verified users with an invitation and preserves the financial principal', async () => {
  const { createInvitation, authenticatedPrincipal } =
    await import('../../../src/db/repositories/authentication')
  const { token } = await createInvitation(database.db as unknown as Db, 'administrator')
  const email = 'invited@example.com'
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const response = await auth.handler(
    new Request('http://localhost:4321/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:4321',
        cookie: `finance-invitation=${token}`,
      },
      body: JSON.stringify({ email, otp: codes.get(email) }),
    }),
  )
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(await authenticatedPrincipal(database.db as unknown as Db, body.user.id)).toMatchObject({
    email,
    userId: body.user.id,
  })
})

it('keeps other sessions valid during ordinary email-code login', async () => {
  const { updateRegistrationPolicy } = await import('../../../src/db/repositories/authentication')
  await updateRegistrationPolicy(database.db as unknown as Db, true)
  const email = 'sessions@example.com'
  const signIn = async () => {
    await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
    return post('/sign-in/email-otp', { email, otp: codes.get(email) })
  }
  const first = await signIn()
  const cookie = first.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  await signIn()
  const session = await auth.handler(
    new Request('http://localhost:4321/api/auth/get-session', { headers: { cookie } }),
  )
  expect((await session.json()).user.email).toBe(email)
})

it('allows only the available invitation places across simultaneous completions', async () => {
  const { createInvitation, registrationAdministration } =
    await import('../../../src/db/repositories/authentication')
  const { token } = await createInvitation(database.db as unknown as Db, 'administrator', 1)
  const emails = ['one@example.com', 'two@example.com']
  for (const email of emails)
    await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const responses = await Promise.all(
    emails.map((email) =>
      auth.handler(
        new Request('http://localhost:4321/api/auth/sign-in/email-otp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:4321',
            cookie: `finance-invitation=${token}`,
          },
          body: JSON.stringify({ email, otp: codes.get(email) }),
        }),
      ),
    ),
  )
  expect(responses.map((response) => response.status).sort()).toEqual([200, 403])
  expect((await registrationAdministration(database.db as unknown as Db)).invitations[0].uses).toBe(
    1,
  )
})

it('does not admit a password registration before email verification', async () => {
  const { updateRegistrationPolicy, registrationAdministration } =
    await import('../../../src/db/repositories/authentication')
  await updateRegistrationPolicy(database.db as unknown as Db, true)
  const response = await post('/sign-up/email', {
    email: 'password@example.com',
    name: 'Password',
    password: 'long-password-for-test',
  })
  expect(response.status).toBe(200)
  expect((await registrationAdministration(database.db as unknown as Db)).invitations).toEqual([])
  const login = await post('/sign-in/email', {
    email: 'password@example.com',
    password: 'long-password-for-test',
  })
  expect(login.status).toBe(403)
})

it('revoked sessions cannot read the authenticated session endpoint', async () => {
  const { updateRegistrationPolicy } = await import('../../../src/db/repositories/authentication')
  await updateRegistrationPolicy(database.db as unknown as Db, true)
  const email = 'revoke@example.com'
  const login = async () => {
    await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
    const response = await post('/sign-in/email-otp', { email, otp: codes.get(email) })
    return response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
  }
  const first = await login()
  const second = await login()
  const revoke = await auth.handler(
    new Request('http://localhost:4321/api/auth/revoke-other-sessions', {
      method: 'POST',
      headers: {
        cookie: second,
        origin: 'http://localhost:4321',
        'content-type': 'application/json',
      },
      body: '{}',
    }),
  )
  expect(revoke.status).toBe(200)
  expect(
    await (
      await auth.handler(
        new Request('http://localhost:4321/api/auth/get-session', { headers: { cookie: first } }),
      )
    ).json(),
  ).toBeNull()
  expect(
    await (
      await auth.handler(
        new Request('http://localhost:4321/api/auth/get-session', { headers: { cookie: second } }),
      )
    ).json(),
  ).not.toBeNull()
})

it('email recovery closes previous sessions and allows a new password session', async () => {
  const { updateRegistrationPolicy } = await import('../../../src/db/repositories/authentication')
  await updateRegistrationPolicy(database.db as unknown as Db, true)
  const email = 'recovery@example.com'
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const login = await post('/sign-in/email-otp', { email, otp: codes.get(email) })
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  await post('/email-otp/send-verification-otp', { email, type: 'forget-password' })
  const reset = await post('/email-otp/reset-password', {
    email,
    otp: codes.get(email),
    password: 'new-password-for-recovery',
  })
  expect(reset.status).toBe(200)
  expect(
    await (
      await auth.handler(
        new Request('http://localhost:4321/api/auth/get-session', { headers: { cookie } }),
      )
    ).json(),
  ).toBeNull()
  expect(
    (await post('/sign-in/email', { email, password: 'new-password-for-recovery' })).status,
  ).toBe(200)
})

it('checks the invitation again when verification completes after revocation', async () => {
  const { createInvitation, revokeInvitation, registrationAdministration } =
    await import('../../../src/db/repositories/authentication')
  const { token, id } = await createInvitation(database.db as unknown as Db, 'administrator')
  const email = 'revoked-invite@example.com'
  const response = await auth.handler(
    new Request('http://localhost:4321/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:4321',
        cookie: `finance-invitation=${token}`,
      },
      body: JSON.stringify({ email, name: 'Invited', password: 'valid-password-for-invite' }),
    }),
  )
  expect(response.status).toBe(200)
  await revokeInvitation(database.db as unknown as Db, id)
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  expect((await post('/sign-in/email-otp', { email, otp: codes.get(email) })).status).toBe(403)
  expect((await registrationAdministration(database.db as unknown as Db)).invitations[0].uses).toBe(
    0,
  )
})

it('bounds verification attempts and refuses reuse of a consumed code', async () => {
  const { updateRegistrationPolicy } = await import('../../../src/db/repositories/authentication')
  await updateRegistrationPolicy(database.db as unknown as Db, true)
  const email = 'attempts@example.com'
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const correct = codes.get(email)
  for (let attempt = 0; attempt < 5; attempt++) {
    expect(
      (await post('/sign-in/email-otp', { email, otp: correct === '000000' ? '111111' : '000000' }))
        .ok,
    ).toBe(false)
  }
  expect((await post('/sign-in/email-otp', { email, otp: correct })).ok).toBe(false)
})

it('does not complete admission or consume a place when email delivery fails', async () => {
  const { createInvitation, registrationAdministration } =
    await import('../../../src/db/repositories/authentication')
  const { token } = await createInvitation(database.db as unknown as Db, 'administrator')
  const unavailable = createAuthentication(
    database.db as unknown as Db,
    {
      BETTER_AUTH_URL: 'http://localhost:4321',
      BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
    },
    async () => {
      throw new Error('External delivery failure')
    },
  )
  const response = await unavailable.handler(
    new Request('http://localhost:4321/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:4321',
        cookie: `finance-invitation=${token}`,
      },
      body: JSON.stringify({
        email: 'undelivered@example.com',
        name: 'Undelivered',
        password: 'long-password-not-delivered',
      }),
    }),
  )
  expect(response.ok).toBe(false)
  expect((await registrationAdministration(database.db as unknown as Db)).invitations[0].uses).toBe(
    0,
  )
})

it('shares rate limits between separate authentication instances backed by the same D1', async () => {
  const second = createAuthentication(
    database.db as unknown as Db,
    {
      BETTER_AUTH_URL: 'http://localhost:4321',
      BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
    },
    async () => {},
  )
  const requests = Array.from({ length: 8 }, (_, index) =>
    (index % 2 ? auth : second).handler(
      new Request('http://localhost:4321/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:4321',
          'cf-connecting-ip': '198.51.100.27',
        },
        body: JSON.stringify({ email: `rate-${index}@example.com`, type: 'sign-in' }),
      }),
    ),
  )
  const responses = await Promise.all(requests)
  expect(responses.filter((response) => response.status === 200).length).toBeLessThanOrEqual(5)
  expect(responses.some((response) => response.status === 429)).toBe(true)
})

it('rejects an expired invitation without consuming a place', async () => {
  const { createInvitation, registrationAdministration } =
    await import('../../../src/db/repositories/authentication')
  const { authInvitation } = await import('../../../src/db/schema')
  const { eq } = await import('drizzle-orm')
  const { token, id } = await createInvitation(database.db as unknown as Db, 'administrator')
  await database.db
    .update(authInvitation)
    .set({ expiresAt: new Date(0) })
    .where(eq(authInvitation.id, id))
  const email = 'expired-invitation@example.com'
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const response = await auth.handler(
    new Request('http://localhost:4321/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:4321',
        cookie: `finance-invitation=${token}`,
      },
      body: JSON.stringify({ email, otp: codes.get(email) }),
    }),
  )
  expect(response.status).toBe(403)
  expect((await registrationAdministration(database.db as unknown as Db)).invitations[0].uses).toBe(
    0,
  )
})
