import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'

const AUDIENCE = 'finance-report-recovery'
const secretBytes = (secret: string) => new TextEncoder().encode(secret)
const caseSchema = z.object({
  reference: z.uuid(),
  number: z.number().int().positive(),
  url: z.url({ protocol: /^https$/ }),
})

export async function signReportReceipt(
  report: z.output<typeof caseSchema>,
  userId: string,
  secret?: string,
): Promise<string | undefined> {
  if (!secret) return undefined
  return new SignJWT(report)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setExpirationTime('24h')
    .sign(secretBytes(secret))
    .catch(() => undefined)
}

export async function verifyReportReceipt(receipt: string, userId: string, secret?: string) {
  if (!secret) return null
  try {
    const { payload } = await jwtVerify(receipt, secretBytes(secret), {
      audience: AUDIENCE,
      subject: userId,
      algorithms: ['HS256'],
    })
    return caseSchema.safeParse(payload).data ?? null
  } catch {
    return null
  }
}
