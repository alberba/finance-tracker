import { betterAuth, APIError } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { Resend } from 'resend'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/client'
import * as schema from '../../../db/schema/authentication'
import {
  admitVerifiedUser,
  assertNewFinancialEmail,
  authenticatedPrincipal,
  registrationInvitation,
} from '../../../db/repositories/authentication'
import type { RuntimeEnv } from '../cloudflare-env'

export interface AuthenticationEmail {
  email: string
  subject: string
  text: string
}
export type DeliverAuthenticationEmail = (message: AuthenticationEmail) => Promise<void>

function localAuthenticationTest(env: RuntimeEnv): boolean {
  return (
    env.TEST_AUTH_ENABLED === 'true' &&
    Boolean(env.BETTER_AUTH_URL) &&
    new Set(['localhost', '127.0.0.1', '[::1]']).has(new URL(env.BETTER_AUTH_URL!).hostname)
  )
}

function localTestEmailEndpoint(env: RuntimeEnv): string | undefined {
  if (env.TEST_AUTH_ENABLED !== 'true' || !env.TEST_RESEND_URL || !env.BETTER_AUTH_URL)
    return undefined
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (
    !loopback.has(new URL(env.BETTER_AUTH_URL).hostname) ||
    !loopback.has(new URL(env.TEST_RESEND_URL).hostname)
  )
    return undefined
  return env.TEST_RESEND_URL
}

export function createAuthentication(
  db: Db,
  env: RuntimeEnv,
  deliver?: DeliverAuthenticationEmail,
) {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL)
    throw new Error('Better Auth no está configurado.')
  const deliverEmail =
    deliver ??
    (async (message: AuthenticationEmail) => {
      if (!env.RESEND_API_KEY || !env.RESEND_FROM)
        throw new Error('El correo de acceso no está configurado.')
      const { error } = await new Resend(env.RESEND_API_KEY, {
        baseUrl: localTestEmailEndpoint(env),
      }).emails.send({
        from: env.RESEND_FROM,
        to: message.email,
        subject: message.subject,
        text: message.text,
      })
      if (error) throw new Error('No se pudo enviar el correo. Inténtalo de nuevo.')
    })
  const send: DeliverAuthenticationEmail = async (message) => {
    try {
      await deliverEmail(message)
    } catch {
      throw new APIError('SERVICE_UNAVAILABLE', {
        message: 'No se pudo enviar el correo. Inténtalo de nuevo.',
      })
    }
  }
  return betterAuth({
    appName: 'Finanzas',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    advanced: {
      ipAddress: {
        ipAddressHeaders: localAuthenticationTest(env)
          ? ['X-Test-Client-IP', 'cf-connecting-ip']
          : ['cf-connecting-ip'],
      },
    },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      transaction: false,
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
        passkey: schema.authPasskey,
        rateLimit: schema.authRateLimit,
      },
    }),
    user: { additionalFields: { invitationId: { type: 'string', required: false, input: false } } },
    session: { expiresIn: 30 * 86400, updateAge: 3600, cookieCache: { enabled: false } },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        trustedProviders: [],
        allowDifferentEmails: false,
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send({
          email: user.email,
          subject: 'Verifica tu correo de Finanzas',
          text: `Verifica tu correo: ${url}`,
        }),
    },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/*': { window: 60, max: 10 },
        '/email-otp/*': { window: 60, max: 5 },
      },
    },
    plugins: [
      {
        id: 'await-transactional-delivery',
        init: () => ({
          context: {
            // Delivery failures must reach the caller, rather than being swallowed as background work.
            runInBackgroundOrAwait: async (promise: void | Promise<unknown>) => {
              await promise
            },
          },
        }),
      },
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp, type }) =>
          send({
            email,
            subject:
              type === 'forget-password'
                ? 'Recupera tu acceso a Finanzas'
                : 'Tu código de Finanzas',
            text: `Tu código es ${otp}. Caduca en 10 minutos.`,
          }),
      }),
      passkey({
        rpName: 'Finanzas',
        rpID: new URL(env.BETTER_AUTH_URL).hostname,
        origin: new URL(env.BETTER_AUTH_URL).origin,
        authenticatorSelection: { userVerification: 'required' },
        registration: {
          afterVerification: async ({ user, verification }) => {
            if (
              !verification.registrationInfo?.userVerified ||
              !(await authenticatedPrincipal(db, user.id))
            ) {
              throw new APIError('FORBIDDEN', {
                message:
                  'Verifica tu identidad y completa el registro antes de añadir una passkey.',
              })
            }
          },
        },
        authentication: {
          afterVerification: async ({ verification }) => {
            if (!verification.authenticationInfo.userVerified)
              throw new APIError('UNAUTHORIZED', {
                message: 'La passkey requiere verificar al usuario.',
              })
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const token = invitationToken(context?.headers)
            try {
              await assertNewFinancialEmail(db, user.email)
              const invitationId = await registrationInvitation(db, token)
              return { data: { ...user, email: user.email.trim().toLowerCase(), invitationId } }
            } catch (error) {
              throw new APIError('FORBIDDEN', {
                message: error instanceof Error ? error.message : 'Registro no disponible.',
              })
            }
          },
        },
        update: {
          after: async (user) => {
            if (user.emailVerified) {
              try {
                await admitVerifiedUser(db, user.id)
              } catch {
                throw new APIError('FORBIDDEN', {
                  message: 'La invitación ya no está disponible. Solicita otra.',
                })
              }
            }
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            const [user] = await db
              .select()
              .from(schema.authUser)
              .where(eq(schema.authUser.id, session.userId))
              .limit(1)
            if (user?.emailVerified) {
              try {
                const [admission] = await db
                  .select()
                  .from(schema.authAdmission)
                  .where(eq(schema.authAdmission.userId, session.userId))
                  .limit(1)
                if (!admission) {
                  const token = invitationToken(context?.headers)
                  if (token) {
                    const invitationId = await registrationInvitation(db, token)
                    await db
                      .update(schema.authUser)
                      .set({ invitationId })
                      .where(eq(schema.authUser.id, session.userId))
                  }
                }
                await admitVerifiedUser(db, session.userId)
              } catch {
                throw new APIError('FORBIDDEN', {
                  message: 'La invitación ya no está disponible. Solicita otra.',
                })
              }
            }
          },
        },
      },
    },
  })
}

function invitationToken(headers?: Headers) {
  return headers
    ?.get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('finance-invitation='))
    ?.slice('finance-invitation='.length)
}
