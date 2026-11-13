import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDatabase } from '../d1-v2/setup'
import type { Db } from '../../../src/db/client'
import type { RuntimeEnv } from '../../../src/lib/server/cloudflare-env'
import { createAuthentication } from '../../../src/lib/server/auth/better-auth'
import { updateRegistrationPolicy } from '../../../src/db/repositories/authentication'
import { runWithDb } from '../../../src/db/database'
import { TEST_AUTH_PROVIDER, onRequest } from '../../../src/middleware'
import { users, userIdentities } from '../../../src/db/schema'

let database: TestDatabase
vi.mock('../../../src/db/client', () => ({ getDb: () => database.db }))

const env: RuntimeEnv = {
  BETTER_AUTH_URL: 'http://localhost:4321',
  BETTER_AUTH_SECRET: 'real-test-secret-with-more-than-thirty-two-characters',
  RESEND_API_KEY: 'fixture',
  RESEND_FROM: 'access@example.com',
}
let auth: ReturnType<typeof createAuthentication>
let code = ''

beforeEach(async () => {
  database = createTestDb()
  await runWithDb(database.db as unknown as Db, updateRegistrationPolicy(true))
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
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

/** Pasa una petición por el middleware real; `next` es la ruta de aguas abajo. */
async function request(
  url: string,
  options: {
    headers?: Record<string, string>
    method?: string
    env?: RuntimeEnv
    next?: Response
  } = {},
) {
  const locals = { runtimeEnv: options.env ?? env } as App.Locals
  let reachedRoute = false
  const response = await onRequest(
    {
      request: new Request(url, { headers: options.headers, method: options.method }),
      locals,
      redirect: (path: string) => Response.redirect(`http://localhost:4321${path}`, 302),
    } as never,
    async () => {
      reachedRoute = true
      return options.next ?? new Response('ok')
    },
  )
  return { response: response as Response, locals, reachedRoute: () => reachedRoute }
}

describe('modo mantenimiento', () => {
  it('responde 503 a toda petición, incluso con sesión válida, sin llegar a la ruta', async () => {
    const cookie = await login('maintenance@example.com')
    const maintenance = { ...env, MAINTENANCE_MODE: 'true' }

    for (const url of [
      'http://localhost:4321/',
      'http://localhost:4321/login?demo=1',
      'http://localhost:4321/api/auth/session',
    ]) {
      const { response, reachedRoute } = await request(url, {
        env: maintenance,
        headers: { cookie },
      })

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('3600')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(reachedRoute()).toBe(false)
    }
  })

  it('devuelve JSON a los llamadores de la API', async () => {
    const { response } = await request('http://localhost:4321/api/sync', {
      method: 'POST',
      env: { ...env, MAINTENANCE_MODE: 'true' },
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })

  it('sirve con normalidad si el valor no es exactamente "true"', async () => {
    const cookie = await login('not-maintenance@example.com')

    const { response } = await request('http://localhost:4321/api/session', {
      env: { ...env, MAINTENANCE_MODE: 'false' },
      headers: { cookie },
    })

    expect(response.status).toBe(200)
  })
})

describe('identidad de prueba y cabeceras ajenas', () => {
  it('no acepta una aserción Cf-Access como credencial', async () => {
    const { response, locals, reachedRoute } = await request('http://localhost:4321/api/session', {
      headers: { 'Cf-Access-Jwt-Assertion': 'valid-looking.jwt' },
    })

    expect(response.status).toBe(401)
    expect(reachedRoute()).toBe(false)
    expect(locals.principal).toBeUndefined()
  })

  it('acepta la identidad de prueba solo en una petición loopback con el flag activo', async () => {
    const { response, locals } = await request('http://127.0.0.1/api/session', {
      headers: { 'X-Test-User-Email': 'Tester@Example.test' },
      env: { ...env, TEST_AUTH_ENABLED: 'true' },
    })

    expect(response.status).toBe(200)
    const [stored] = database.db.select().from(users).all()
    expect(stored.email).toBe('tester@example.test')
    expect(locals.principal).toMatchObject({
      userId: stored.id,
      email: 'tester@example.test',
      provider: TEST_AUTH_PROVIDER,
    })
    const [identity] = database.db.select().from(userIdentities).all()
    expect(identity).toMatchObject({ userId: stored.id, subject: 'tester@example.test' })
  })

  it('ignora la cabecera de identidad de prueba fuera de loopback', async () => {
    const { response, reachedRoute } = await request('https://app.example.test/api/session', {
      headers: { 'X-Test-User-Email': 'tester@example.test' },
      env: { ...env, TEST_AUTH_ENABLED: 'true' },
    })

    expect(response.status).toBe(401)
    expect(reachedRoute()).toBe(false)
    expect(database.db.select().from(users).all()).toEqual([])
  })

  it('ignora la cabecera de identidad de prueba si el flag no está activo', async () => {
    const { response } = await request('http://127.0.0.1/api/session', {
      headers: { 'X-Test-User-Email': 'tester@example.test' },
    })

    expect(response.status).toBe(401)
    expect(database.db.select().from(users).all()).toEqual([])
  })
})

describe('sesión autenticada', () => {
  it('renueva las cookies de sesión y marca la respuesta autenticada como privada', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'))
    const cookie = await login('renew-private@example.com')
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'))

    const { response } = await request('http://localhost:4321/api/session', {
      headers: { cookie },
    })

    expect(response.headers.getSetCookie().join(';')).toContain('session_token=')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('mutaciones de la API', () => {
  const proxyEnv = { ...env, BETTER_AUTH_URL: 'https://finance.example.test' }
  const mutation = (origin: string) =>
    request('http://finance.example.test/api/auth/sign-out', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      env: proxyEnv,
    })

  it('acepta el origen https configurado cuando un proxy entrega una URL http', async () => {
    const { response, reachedRoute } = await mutation('https://finance.example.test')

    expect(response.status).toBe(200)
    expect(reachedRoute()).toBe(true)
  })

  it('rechaza con 403 un origen falsificado tras el proxy', async () => {
    const { response, reachedRoute } = await mutation('https://evil.example.test')

    expect(response.status).toBe(403)
    expect(reachedRoute()).toBe(false)
  })

  it('rechaza con 403 una mutación cross-site antes de autenticar', async () => {
    const cookie = await login('csrf@example.com')

    const { response, reachedRoute } = await request('http://localhost:4321/api/session', {
      method: 'POST',
      headers: {
        cookie,
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
      },
    })

    expect(response.status).toBe(403)
    expect(reachedRoute()).toBe(false)
  })
})
