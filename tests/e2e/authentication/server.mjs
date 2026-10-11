import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { createServer } from 'node:http'
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const port = Number(process.env.AUTH_TEST_PORT ?? 4466)
const mailPort = port + 1
const mail = new Map()
const keys = await generateKeyPair('RS256', { extractable: true })
const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'e2e-oauth', alg: 'RS256' }
const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${mailPort}`)
  response.setHeader('Content-Type', 'application/json')
  if (request.method === 'POST' && url.pathname === '/emails') {
    let body = ''
    for await (const chunk of request) body += chunk
    const message = JSON.parse(body)
    mail.set(Array.isArray(message.to) ? message.to[0] : message.to, message.text)
    response.end(JSON.stringify({ id: crypto.randomUUID() }))
  } else if (url.pathname === '/oauth') {
    let body = ''
    for await (const chunk of request) body += chunk
    const input = body.startsWith('{')
      ? JSON.parse(body)
      : Object.fromEntries(new URLSearchParams(body))
    const endpoint = url.searchParams.get('endpoint')
    const email = input.code ?? request.headers.authorization?.replace('Bearer ', '')
    if (endpoint === 'https://github.com/login/oauth/access_token')
      response.end(
        JSON.stringify({
          access_token: email,
          token_type: 'bearer',
          scope: 'read:user,user:email',
        }),
      )
    else if (endpoint === 'https://api.github.com/user')
      response.end(JSON.stringify({ id: email, login: 'e2e', name: 'E2E', email }))
    else if (endpoint === 'https://api.github.com/user/emails')
      response.end(JSON.stringify([{ email, primary: true, verified: true }]))
    else if (endpoint === 'https://www.googleapis.com/oauth2/v3/certs')
      response.end(JSON.stringify({ keys: [jwk] }))
    else if (endpoint === 'https://oauth2.googleapis.com/token') {
      const idToken = await new SignJWT({ sub: email, name: 'E2E', email, email_verified: true })
        .setProtectedHeader({ alg: 'RS256', kid: 'e2e-oauth' })
        .setIssuer('https://accounts.google.com')
        .setAudience('google-e2e')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(keys.privateKey)
      response.end(
        JSON.stringify({
          access_token: email,
          token_type: 'bearer',
          expires_in: 3600,
          id_token: idToken,
        }),
      )
    } else {
      response.statusCode = 404
      response.end('{}')
    }
  } else if (url.pathname === '/mail') {
    response.end(JSON.stringify({ text: mail.get(url.searchParams.get('email')) ?? '' }))
  } else {
    response.statusCode = 404
    response.end('{}')
  }
})
await new Promise((done) => server.listen(mailPort, '127.0.0.1', done))
mkdirSync('.scratch/auth', { recursive: true })
const config = resolve('.scratch/auth/wrangler.toml')
writeFileSync(
  config,
  `name = "finance-auth-e2e"
main = "../../sentry.server.config.ts"
compatibility_date = "2026-02-23"
compatibility_flags = ["nodejs_compat"]
[[d1_databases]]
binding = "finance_tracker_db_v2"
database_name = "finance-auth-e2e"
database_id = "${crypto.randomUUID()}"
migrations_dir = "../../migrations-v2"
[vars]
AUTH_MODE = "better-auth"
TEST_AUTH_ENABLED = "true"
BETTER_AUTH_URL = "http://localhost:${port}"
BETTER_AUTH_SECRET = "local-e2e-secret-for-authentication-only-275"
RESEND_API_KEY = "re_local-test"
RESEND_FROM = "Finanzas <access@example.test>"
GOOGLE_CLIENT_ID = "google-e2e"
GOOGLE_CLIENT_SECRET = "google-e2e-secret"
GITHUB_CLIENT_ID = "github-e2e"
GITHUB_CLIENT_SECRET = "github-e2e-secret"
TEST_RESEND_URL = "http://127.0.0.1:${mailPort}"
`,
)
const migration = spawnSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'finance-auth-e2e',
    '--local',
    '--persist-to',
    resolve('.scratch/auth/state'),
    '--config',
    config,
  ],
  { stdio: 'inherit' },
)
if (migration.status !== 0) process.exit(migration.status ?? 1)
const app = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CLOUDFLARE_CONFIG_PATH: config,
    CLOUDFLARE_PERSIST_PATH: resolve('.scratch/auth/state'),
    AUTH_E2E_NETWORK: 'true',
    AUTH_TEST_PORT: String(port),
    ASTRO_DEV_BACKGROUND: '0',
  },
})
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    app.kill(signal)
    server.close()
  })
app.on('exit', (code) => {
  server.close()
  process.exitCode = code ?? 0
})
