import type { APIRoute } from 'astro'
import { z } from 'zod'
import { getDb } from '../../db/client'
import { createAuthentication } from '../../lib/server/auth/better-auth'
import { getRuntimeEnv } from '../../lib/server/cloudflare-env'
import { jsonResponse } from '../../lib/server/api-auth'

const recovery = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(128),
})
export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = recovery.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return jsonResponse(
      { error: 'Introduce el correo, código y una contraseña de al menos 12 caracteres.' },
      400,
    )
  try {
    const auth = createAuthentication(getDb(locals), getRuntimeEnv(locals))
    // Better Auth consumes the recovery OTP atomically and revokes existing sessions.
    const reset = await auth.handler(
      new Request(new URL('/api/auth/email-otp/reset-password', request.url), {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(parsed.data),
      }),
    )
    if (!reset.ok) return reset
    return await auth.handler(
      new Request(new URL('/api/auth/sign-in/email', request.url), {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
      }),
    )
  } catch {
    return jsonResponse(
      { error: 'No se pudo recuperar el acceso. Comprueba el código o solicita otro.' },
      400,
    )
  }
}
