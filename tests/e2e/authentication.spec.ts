import { test, expect, type TestInfo } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { AuthenticationPage } from './pages/AuthenticationPage'

function authenticationHeaders(info: TestInfo) {
  let hash = 0
  for (const character of info.testId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return { 'X-Test-Client-IP': `198.18.${hash % 254}.${(Math.floor(hash / 254) % 254) + 1}` }
}
test.beforeEach(async ({ context }, info) => {
  executeSql('DELETE FROM auth_invitation; UPDATE auth_policy SET public_registration = 0;')
  await context.setExtraHTTPHeaders(authenticationHeaders(info))
})

function seedAdministrator(email: string) {
  const id = crypto.randomUUID()
  const sql = `INSERT INTO users(id,email,is_legacy_owner,created_at,updated_at) VALUES('${id}','${email}',0,'2026-10-06T00:00:00Z','2026-10-06T00:00:00Z');
INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES('${id}','Admin','${email}',1,1791244800000,1791244800000);
INSERT INTO auth_admission(user_id,created_at) VALUES('${id}',1791244800000);
INSERT INTO auth_role(user_id,role) VALUES('${id}','admin');
UPDATE auth_policy SET public_registration = 0;`
  executeSql(sql)
}
function executeSql(sql: string) {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'finance-auth-e2e',
      '--local',
      '--persist-to',
      resolve('.scratch/auth/state'),
      '--config',
      resolve('.scratch/auth/wrangler.toml'),
      '--command',
      sql,
    ],
    { encoding: 'utf8' },
  )
  expect(result.status, result.stderr + result.stdout).toBe(0)
}

test('private pages and financial APIs require a Better Auth session @smoke', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get('/api/bootstrap')).status()).toBe(401)
})

async function admittedAdministrator(page: import('@playwright/test').Page) {
  const email = `admin-${crypto.randomUUID()}@example.test`
  seedAdministrator(email)
  const access = new AuthenticationPage(page)
  await access.goto()
  await access.signIn(email)
  await new AuthenticationPage(page).openSecurity()
  return { email, access }
}

test('invitation registration grants private access without administrator controls @smoke', async ({
  page,
  browser,
}, info) => {
  await admittedAdministrator(page)
  await page.getByRole('button', { name: 'Crear invitación', exact: true }).click()
  const link = page.getByRole('status').getByRole('link')
  await expect(link).toHaveAttribute('href', /invitation=/)
  const context = await browser.newContext({ extraHTTPHeaders: authenticationHeaders(info) })
  const invited = await context.newPage()
  const access = new AuthenticationPage(invited)
  await access.goto((await link.getAttribute('href'))!)
  await access.signIn(`invited-${crypto.randomUUID()}@example.test`)
  await new AuthenticationPage(invited).openSecurity()
  await expect(invited.getByRole('heading', { name: 'Dispositivos y sesiones' })).toBeVisible()
  await expect(invited.getByRole('heading', { name: 'Invitaciones y registro' })).toHaveCount(0)
  await context.close()
})

test('revoked invitation refuses new admission', async ({ page, browser }, info) => {
  await admittedAdministrator(page)
  await page.getByRole('button', { name: 'Crear invitación', exact: true }).click()
  const link = page.getByRole('status').getByRole('link')
  await expect(link).toHaveAttribute('href', /invitation=/)
  const url = (await link.getAttribute('href'))!
  await page.getByRole('button', { name: 'Revocar invitación' }).first().click()
  const context = await browser.newContext({ extraHTTPHeaders: authenticationHeaders(info) })
  const invited = await context.newPage()
  await invited.goto(url)
  await expect(invited.getByRole('alert')).toContainText(/invitación/i)
  expect((await context.request.get('/api/session')).status()).toBe(401)
  await context.close()
})

test('passkey registration and login use a verified virtual authenticator', async ({
  page,
  context,
}) => {
  const { access } = await admittedAdministrator(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  await page.getByRole('button', { name: 'Añadir passkey' }).click()
  await expect(page.getByRole('button', { name: 'Eliminar passkey' })).toBeVisible()
  await access.goto()
  await page.getByRole('button', { name: 'Entrar con passkey' }).click()
  await expect(page).toHaveURL(/\/$/)
  await access.ready()
})

test('cancelled passkey registration leaves no credential', async ({ page, context }) => {
  await admittedAdministrator(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: false,
    },
  })
  await page.getByRole('button', { name: 'Añadir passkey' }).click()
  // Cancel the platform ceremony at the browser boundary; the server remains real.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'))
  })
  await new FinanceTrackerPage(page).reload()
  await new AuthenticationPage(page).ready()
  await new AuthenticationPage(page).openSecurity()
  await expect(page.getByRole('button', { name: 'Añadir passkey' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Eliminar passkey' })).toHaveCount(0)
})

for (const kind of ['selected', 'others'] as const) {
  test(`revoking ${kind} sessions invalidates the other device`, async ({
    page,
    browser,
  }, info) => {
    const { email } = await admittedAdministrator(page)
    const other = await browser.newContext({ extraHTTPHeaders: authenticationHeaders(info) })
    const otherPage = await other.newPage()
    const access = new AuthenticationPage(otherPage)
    await access.goto()
    await access.signIn(email)
    await new FinanceTrackerPage(page).reload()
    await new AuthenticationPage(page).ready()
    await new AuthenticationPage(page).openSecurity()
    await page
      .getByRole('button', {
        name: kind === 'selected' ? 'Cerrar esta sesión' : 'Cerrar las demás sesiones',
        exact: true,
      })
      .click()
    await expect(page.getByText('Otra sesión', { exact: true })).toHaveCount(0)
    expect((await other.request.get('/api/session')).status()).toBe(401)
    expect((await page.request.get('/api/session')).status()).toBe(200)
    await other.close()
  })
}

test('recovery invalidates previous sessions and opens a new one', async ({
  page,
  browser,
}, info) => {
  const { email, access } = await admittedAdministrator(page)
  const previousDevice = await browser.newContext({ extraHTTPHeaders: authenticationHeaders(info) })
  await previousDevice.addCookies(await page.context().cookies())
  await access.recover(email)
  expect((await previousDevice.request.get('/api/session')).status()).toBe(401)
  expect((await page.request.get('/api/session')).status()).toBe(200)
  await previousDevice.close()
})

for (const provider of ['google', 'github']) {
  test(`visible ${provider} linking navigates to the provider and returns to settings`, async ({
    page,
  }) => {
    const { email } = await admittedAdministrator(page)
    const authorization =
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth**'
        : 'https://github.com/login/oauth/authorize**'
    await page.route(authorization, (route) => {
      const url = new URL(route.request().url())
      const callback = new URL(url.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', url.searchParams.get('state')!)
      callback.searchParams.set('code', email)
      return route.fulfill({ status: 302, headers: { location: callback.href }, body: '' })
    })
    await page
      .getByRole('button', { name: provider === 'google' ? 'Vincular Google' : 'Vincular GitHub' })
      .click()
    await expect(page).toHaveURL(/\/$/)
    await new AuthenticationPage(page).ready()
    await new AuthenticationPage(page).openSecurity()
    await expect(
      page
        .getByRole('region', { name: 'Métodos de acceso' })
        .getByRole('listitem')
        .filter({ hasText: provider }),
    ).toBeVisible()
  })
}

test('public registration verifies a password account before granting financial access', async ({
  page,
  browser,
}, testInfo) => {
  const namespace = `public-${testInfo.workerIndex}-${crypto.randomUUID()}`
  const administratorEmail = `${namespace}@example.test`
  seedAdministrator(administratorEmail)
  const access = new AuthenticationPage(page)
  await access.goto()
  await access.signIn(administratorEmail)
  await new AuthenticationPage(page).openSecurity()
  await page.getByRole('button', { name: 'Abrir registro público' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar registro público' })).toBeVisible()
  const context = await browser.newContext({ extraHTTPHeaders: authenticationHeaders(testInfo) })
  const invited = await context.newPage()
  const invitedAccess = new AuthenticationPage(invited)
  await invitedAccess.goto()
  await invited
    .getByRole('group', { name: 'Método de acceso' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click()
  const email = `password-${namespace}@example.test`
  await invited.getByLabel('Correo electrónico').fill(email)
  await invited.getByLabel('Contraseña', { exact: true }).fill('verified-password-for-e2e')
  await invited
    .getByRole('form', { name: 'Acceso a Finanzas' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click()
  await expect(invited.getByRole('status')).toContainText('Verifica tu correo')
  expect((await context.request.get('/api/bootstrap')).status()).toBe(401)
  const port = Number(process.env.AUTH_TEST_PORT ?? 4466) + 1
  const mail = await page.request.get(
    `http://127.0.0.1:${port}/mail?email=${encodeURIComponent(email)}`,
  )
  const url = (await mail.json()).text.replace('Verifica tu correo: ', '')
  await invited.goto(url)
  await invitedAccess.ready()
  expect((await context.request.get('/api/session')).status()).toBe(200)
  await page.getByRole('button', { name: 'Cerrar registro público' }).click()
  await expect(page.getByRole('button', { name: 'Abrir registro público' })).toBeVisible()
  expect((await context.request.get('/api/session')).status()).toBe(200)
  await context.close()
})

test('two verified registrations cannot consume the same last D1 invitation place', async ({
  page,
  browser,
}, info) => {
  await admittedAdministrator(page)
  const result = await page.request.post('/api/admin/registration', {
    data: { action: 'create', maxUses: 1, days: 7 },
  })
  expect(result.status()).toBe(201)
  const invitation = await result.json()
  const contexts = await Promise.all([
    browser.newContext({ extraHTTPHeaders: authenticationHeaders(info) }),
    browser.newContext({ extraHTTPHeaders: authenticationHeaders(info) }),
  ])
  const emails = contexts.map(() => `race-${crypto.randomUUID()}@example.test`)
  for (const [index, context] of contexts.entries()) {
    await context.addCookies([
      {
        name: 'finance-invitation',
        value: new URL(invitation.url).searchParams.get('invitation')!,
        url: 'http://localhost:' + (process.env.AUTH_TEST_PORT ?? 4466),
      },
    ])
    const response = await context.request.post('/api/auth/email-otp/send-verification-otp', {
      headers: { origin: 'http://localhost:' + (process.env.AUTH_TEST_PORT ?? 4466) },
      data: { email: emails[index], type: 'sign-in' },
    })
    expect(response.status(), await response.text()).toBe(200)
  }
  const codes = await Promise.all(
    emails.map((email) => new AuthenticationPage(page).deliveredCode(email)),
  )
  const responses = await Promise.all(
    contexts.map((context, index) =>
      context.request.post('/api/auth/sign-in/email-otp', {
        headers: { origin: 'http://localhost:' + (process.env.AUTH_TEST_PORT ?? 4466) },
        data: { email: emails[index], otp: codes[index] },
      }),
    ),
  )
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 403])
  const administration = await (await page.request.get('/api/admin/registration')).json()
  expect(
    administration.invitations.find((item: { id: string }) => item.id === invitation.id).uses,
  ).toBe(1)
  await Promise.all(contexts.map((context) => context.close()))
})
