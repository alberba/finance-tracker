import type { APIRoute } from 'astro'
import { z } from 'zod'
import { getDb } from '../../db/client'
import { createAuthentication } from '../../lib/server/auth/better-auth'
import {
  issueAuthenticationProof,
  NEW_AUTHENTICATION_PURPOSE,
} from '../../lib/server/auth/new-authentication'
import { getRuntimeEnv } from '../../lib/server/cloudflare-env'
import { runServer } from '../../lib/server/runtime'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../lib/server/api-auth'

const proofRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), purpose: z.literal(NEW_AUTHENTICATION_PURPOSE) }),
  z.object({
    action: z.literal('verify'),
    purpose: z.literal(NEW_AUTHENTICATION_PURPOSE),
    otp: z.string().regex(/^\d{6}$/),
  }),
])
export const POST: APIRoute = ({ request, locals }) =>
  withApiErrorHandling('/api/authentication-proof', async () => {
    const principal = requirePrincipal(locals)
    const parsed = proofRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !principal.email)
      return jsonResponse({ error: 'Solicitud de prueba no válida.' }, 400)
    const db = getDb(locals)
    const auth = createAuthentication(db, getRuntimeEnv(locals))
    try {
      if (parsed.data.action === 'send') {
        // Enter through the library HTTP boundary so its distributed rate limiter also applies.
        return await auth.handler(
          new Request(new URL('/api/auth/email-otp/send-verification-otp', request.url), {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({ email: principal.email, type: 'sign-in' }),
          }),
        )
      }
      const ceremony = await auth.handler(
        new Request(new URL('/api/auth/sign-in/email-otp', request.url), {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({ email: principal.email, otp: parsed.data.otp }),
        }),
      )
      if (!ceremony.ok) return ceremony
      const result = (await ceremony.json()) as { user: { id: string }; token: string }
      if (result.user.id !== principal.userId)
        return jsonResponse({ error: 'La identidad no coincide.' }, 403)
      const headers = new Headers(request.headers)
      headers.set(
        'cookie',
        ceremony.headers
          .getSetCookie()
          .map((cookie) => cookie.split(';')[0])
          .join('; '),
      )
      const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } })
      if (!session || session.user.id !== principal.userId)
        return jsonResponse({ error: 'No se pudo comprobar el nuevo acceso.' }, 403)
      const proof = await runServer(
        db,
        issueAuthenticationProof(principal.userId, session.session.id),
      )
      const response = jsonResponse(
        { proof, purpose: NEW_AUTHENTICATION_PURPOSE, expiresIn: 300 },
        200,
      )
      for (const cookie of ceremony.headers.getSetCookie())
        response.headers.append('Set-Cookie', cookie)
      return response
    } catch {
      return jsonResponse(
        { error: 'No se pudo verificar el código. Solicita otro e inténtalo de nuevo.' },
        400,
      )
    }
  })
