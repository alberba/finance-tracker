/**
 * Fail-closed Cf-Access authentication and CSRF boundary. Private page
 * navigations and every API require a verified principal; the synthetic demo
 * navigation is the only public application surface. The E2E identity header
 * is honored only when explicitly enabled and the request origin is loopback.
 */

// `astro/middleware` is the real package export backing the `astro:middleware`
// virtual module; importing it directly (rather than the virtual specifier)
// keeps this file resolvable under plain Vitest, which doesn't run Astro's
// Vite pipeline (see `tests/unit/auth-middleware.test.ts`).
import { defineMiddleware } from 'astro/middleware'
import { parseAudiences, verifyAccessJwt } from './lib/server/auth/jwks'
import { resolvePrincipal, CF_ACCESS_PROVIDER } from './lib/server/auth/principal'
import { getDb } from './db/client'
import { getRuntimeEnv, type RuntimeEnv } from './lib/server/cloudflare-env'
import { isPublicDemoNavigation } from './lib/server/demo-access'
import {
  isLocalTestRequest,
  rejectUnsafeApiMutation,
  requiresAuthentication,
} from './lib/server/request-security'

import { createAuthentication } from './lib/server/auth/better-auth'
import { authenticatedPrincipal } from './db/repositories/authentication'

const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion'
/** Test-only principal injection (WP8) — see the module doc comment above. */
export const TEST_USER_EMAIL_HEADER = 'X-Test-User-Email'
/** Dedicated provider tag for identities created through the test header, kept distinct from `CF_ACCESS_PROVIDER` for auditability. */
export const TEST_AUTH_PROVIDER = 'e2e-test-header'

function jsonUnauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function isTestAuthEnabled(env: RuntimeEnv | undefined): boolean {
  return env?.TEST_AUTH_ENABLED === 'true'
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = getRuntimeEnv(context.locals)

  if (isPublicDemoNavigation(context.request)) {
    return next()
  }

  const pathname = new URL(context.request.url).pathname
  const publicAuthentication =
    pathname === '/login' || pathname === '/api/recover-access' || pathname.startsWith('/api/auth/')

  const unsafeMutation = rejectUnsafeApiMutation(context.request)
  if (unsafeMutation) {
    return unsafeMutation
  }

  if (publicAuthentication) return next()

  // Even if TEST_AUTH_ENABLED is accidentally deployed, the bypass is inert
  // outside a loopback origin.
  if (isTestAuthEnabled(env) && isLocalTestRequest(context.request)) {
    const testEmail = context.request.headers.get(TEST_USER_EMAIL_HEADER)?.trim().toLowerCase()
    if (testEmail) {
      try {
        const db = getDb(context.locals)
        const principal = await resolvePrincipal(db, {
          provider: TEST_AUTH_PROVIDER,
          subject: testEmail,
          email: testEmail,
          legacyOwnerEmail: env?.LEGACY_OWNER_EMAIL ?? null,
        })
        context.locals.principal = {
          ...principal,
          isLegacyOwner: env?.LEGACY_OWNER_EMAIL?.trim().toLowerCase() === testEmail,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo resolver el principal de prueba.'
        console.warn(`[middleware] test-auth-shim failed: ${message}`)
      }
      return next()
    }
  }

  if (env.AUTH_MODE === 'better-auth') {
    try {
      const db = getDb(context.locals)
      const auth = createAuthentication(db, env)
      const sessionResponse = await auth.api.getSession({
        headers: context.request.headers,
        query: { disableCookieCache: true },
        asResponse: true,
      })
      const session = (await sessionResponse.json()) as {
        user?: { id: string; emailVerified: boolean }
      } | null
      if (session?.user?.emailVerified) {
        context.locals.principal = (await authenticatedPrincipal(db, session.user.id)) ?? undefined
      }
      if (
        !context.locals.principal &&
        requiresAuthentication(context.request) &&
        !publicAuthentication
      ) {
        return pathname.startsWith('/api/')
          ? jsonUnauthorized('Inicia sesión para continuar.')
          : context.redirect('/login', 302)
      }
      const queueIdentity = context.request.headers.get('X-Finance-User-Id')
      if (
        context.locals.principal &&
        (queueIdentity || pathname === '/api/sync') &&
        queueIdentity !== context.locals.principal.userId
      ) {
        return jsonUnauthorized(
          'La cola pertenece a otra identidad. Vuelve a entrar con el mismo usuario.',
        )
      }
      const response = await next()
      // Forward renewal cookies from the authoritative session read.
      for (const cookie of sessionResponse.headers.getSetCookie())
        response.headers.append('Set-Cookie', cookie)
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch {
      return jsonUnauthorized('No se pudo comprobar la sesión.')
    }
  }

  const token = context.request.headers.get(ACCESS_JWT_HEADER)

  if (!token) {
    return requiresAuthentication(context.request)
      ? jsonUnauthorized('Falta la cabecera Cf-Access-Jwt-Assertion.')
      : next()
  }

  const teamDomain = env?.CF_ACCESS_TEAM_DOMAIN
  const audience = parseAudiences(env?.CF_ACCESS_AUD)
  if (!teamDomain || audience.length === 0) {
    return jsonUnauthorized('Cf-Access no está configurado en este entorno.')
  }

  try {
    const claims = await verifyAccessJwt(token, { teamDomain, audience })
    const db = getDb(context.locals)
    context.locals.principal = await resolvePrincipal(db, {
      provider: CF_ACCESS_PROVIDER,
      subject: claims.sub,
      email: claims.email ?? null,
      legacyOwnerEmail: env?.LEGACY_OWNER_EMAIL ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error desconocido'
    console.warn(`[middleware] Cf-Access verification failed: ${message}`)
    return jsonUnauthorized('Token de Cf-Access inválido o caducado.')
  }

  return next()
})
