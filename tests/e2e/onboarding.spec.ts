import { randomUUID } from 'node:crypto'
import { test as base, expect, devices, type APIRequestContext, type Page } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

type Entity = { id: string; version: number; name: string }
type Bootstrap = {
  settings: Record<string, number | string | null>
  twrLiquidityAccounts: Array<{ accountId: string }>
  accounts: Entity[]
  transactions: Entity[]
  categories: Array<Entity & { kind: string }>
}

const test = base.extend<{ email: string }>({
  email: async ({ browserName }, use) => {
    await use(`onboarding-${browserName}-${randomUUID()}@e2e.test`)
  },
  context: async ({ context, email }, use) => {
    await context.setExtraHTTPHeaders({ 'X-Test-User-Email': email })
    await use(context)
  },
})

const setup = (page: Page) => page.locator('dialog[data-setup]')
const resume = (page: Page) => page.getByRole('button', { name: 'Retomar puesta en marcha' })
const title = (page: Page) => setup(page).getByRole('heading', { level: 1 })

async function initialize(request: APIRequestContext) {
  const response = await request.post('/api/state/initialize', { data: {} })
  expect(response.ok()).toBe(true)
  return response.json()
}

async function bootstrap(request: APIRequestContext): Promise<Bootstrap> {
  const response = await request.get('/api/bootstrap')
  expect(response.ok()).toBe(true)
  return response.json()
}

// `/api/sync` requires the queue owner in `X-Finance-User-Id`, not just the
// test auth header; resolve it once per request context.
const identities = new WeakMap<APIRequestContext, Promise<string>>()

function identity(request: APIRequestContext): Promise<string> {
  let userId = identities.get(request)
  if (!userId) {
    userId = request.get('/api/session').then(async (response) => {
      expect(response.ok(), await response.text()).toBe(true)
      const body = (await response.json()) as { user: { id: string } }
      return body.user.id
    })
    identities.set(request, userId)
  }
  return userId
}

async function sync(request: APIRequestContext, commands: object[]) {
  const response = await request.post('/api/sync', {
    data: { commands },
    headers: { 'X-Finance-User-Id': await identity(request) },
  })
  expect(response.ok(), await response.text()).toBe(true)
  const body = await response.json()
  expect(body.results.map((result: { status: string }) => result.status)).toEqual(
    commands.map(() => 'applied'),
  )
}

async function expectSettings(
  request: APIRequestContext,
  settings: Record<string, number | string>,
) {
  await expect.poll(async () => (await bootstrap(request)).settings).toMatchObject(settings)
}

async function openSetup(page: Page) {
  const tracker = new FinanceTrackerPage(page, { preserveSetup: true })
  await tracker.goto()
  await expect(setup(page)).toBeVisible()
  return tracker
}

async function next(page: Page, label: 'Siguiente' | 'Saltar' | 'Entendido' = 'Siguiente') {
  await setup(page).getByRole('button', { name: label, exact: true }).click()
}

async function seedExistingData(request: APIRequestContext) {
  await sync(request, [
    {
      commandId: randomUUID(),
      action: 'create',
      entityType: 'account',
      data: { name: 'Cuenta existente', kind: 'cash', currency: 'EUR', openingBalance: 100 },
    },
    {
      commandId: randomUUID(),
      action: 'create',
      entityType: 'category',
      data: { name: 'Mi categoría', kind: 'expense' },
    },
  ])
  const data = await bootstrap(request)
  await sync(request, [
    {
      commandId: randomUUID(),
      action: 'create',
      entityType: 'transaction',
      data: {
        accountId: data.accounts[0].id,
        categoryId: data.categories[0].id,
        type: 'expense',
        date: '2026-10-01',
        description: 'Movimiento existente',
        amount: 10,
        currency: 'EUR',
      },
    },
  ])
}

test.describe('Puesta en marcha (sync v2)', () => {
  test('primer acceso: categorías iniciales y el asistente abierto', async ({ page, context }) => {
    const before = await bootstrap(context.request)
    expect(before.settings).toMatchObject({
      onboardingPresented: 0,
      onboardingDismissed: 0,
      onboardingCompleted: 0,
      onboardingStep: 0,
    })
    expect(before.accounts).toEqual([])
    expect(before.transactions).toEqual([])
    expect(before.categories.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'Nómina', kind: 'income' },
      { name: 'Otros ingresos', kind: 'income' },
      { name: 'Vivienda', kind: 'expense' },
      { name: 'Alimentación', kind: 'expense' },
      { name: 'Transporte', kind: 'expense' },
      { name: 'Suministros', kind: 'expense' },
      { name: 'Salud', kind: 'expense' },
      { name: 'Ocio', kind: 'expense' },
      { name: 'Otros gastos', kind: 'expense' },
      { name: 'Inversión', kind: 'investment' },
    ])
    expect((await initialize(context.request)).alreadyInitialized).toBe(true)
    expect((await bootstrap(context.request)).categories).toEqual(before.categories)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openSetup(page)
    await expect(title(page)).toHaveText('Te damos la bienvenida')
    await expectSettings(context.request, { onboardingPresented: 1, onboardingCompleted: 0 })
  })

  test('un usuario nuevo llega a «Listo» con su moneda, su tema y una cuenta de liquidez', async ({
    page,
    context,
    browser,
    email,
  }) => {
    await initialize(context.request)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const tracker = await openSetup(page)
    await setup(page).getByRole('button', { name: 'Empezar de cero' }).click()
    await expect(title(page)).toHaveText('Moneda y tema')
    await setup(page).getByRole('button', { name: 'USD' }).click()
    await setup(page)
      .getByRole('button', { name: /^Oscuro fuerte/ })
      .click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'oscuro-fuerte')
    await next(page)

    await expect(title(page)).toHaveText('Tus cuentas')
    const advance = setup(page).getByRole('button', { name: 'Siguiente', exact: true })
    await expect(advance).toBeDisabled()
    await setup(page).getByLabel('Nombre').fill('Cuenta nómina')
    await setup(page).getByLabel('Saldo actual').fill('1500')
    await setup(page).getByRole('button', { name: 'Añadir cuenta' }).click()
    await expect(setup(page).getByRole('list', { name: 'Cuentas creadas' })).toContainText(
      'Cuenta nómina',
    )
    await next(page)
    await expect(title(page)).toHaveText('Ingresos y gastos fijos')
    await next(page, 'Saltar')
    await expect(title(page)).toHaveText('¿Inviertes?')
    await next(page, 'Saltar')
    await expect(title(page)).toHaveText('Categorías')
    await next(page)
    await expect(title(page)).toHaveText('Listo')
    await next(page, 'Entendido')
    await expect(setup(page)).toBeHidden()

    await expectSettings(context.request, {
      currency: 'USD',
      theme: 'oscuro-fuerte',
      onboardingCompleted: 1,
    })
    const data = await bootstrap(context.request)
    expect(data.accounts.map(({ name }) => name)).toEqual(['Cuenta nómina'])
    expect(data.twrLiquidityAccounts.map(({ accountId }) => accountId)).toEqual([
      data.accounts[0].id,
    ])
    await expect(page.locator('#sidebar-sync-status')).toHaveText(/^Sincronizado ·/)
    await tracker.reload()
    await expect(setup(page)).toBeHidden()
    await expect(resume(page)).toHaveCount(0)

    // The theme is the user's: another device paints it too.
    const device = await browser.newContext({ extraHTTPHeaders: { 'X-Test-User-Email': email } })
    try {
      const devicePage = await device.newPage()
      await new FinanceTrackerPage(devicePage).goto()
      await expect(devicePage.locator('html')).toHaveAttribute('data-theme', 'oscuro-fuerte')
    } finally {
      await device.close()
    }
  })

  test('Ahora no se recuerda y otro dispositivo retoma en el mismo paso', async ({
    page,
    context,
    browser,
    email,
  }) => {
    await initialize(context.request)
    const tracker = await openSetup(page)
    await setup(page).getByRole('button', { name: 'Empezar de cero' }).click()
    await next(page)
    await expect(title(page)).toHaveText('Tus cuentas')
    await setup(page).getByRole('button', { name: 'Ahora no' }).first().click()
    await expect(setup(page)).toBeHidden()
    await expectSettings(context.request, {
      onboardingDismissed: 1,
      onboardingCompleted: 0,
      onboardingStep: 2,
    })
    await expect(page.locator('#sidebar-sync-status')).toHaveText(/^Sincronizado ·/)
    await tracker.reload()
    await expect(setup(page)).toBeHidden()
    await expect(resume(page)).toBeVisible()
    const device = await browser.newContext({
      ...devices['Pixel 5'],
      extraHTTPHeaders: { 'X-Test-User-Email': email },
    })
    try {
      const devicePage = await device.newPage()
      await new FinanceTrackerPage(devicePage, { preserveSetup: true }).goto()
      await expect(setup(devicePage)).toBeHidden()
      await resume(devicePage).click()
      await expect(title(devicePage)).toHaveText('Tus cuentas')
      await expect(
        setup(devicePage).getByRole('button', { name: 'Siguiente', exact: true }),
      ).toBeDisabled()
    } finally {
      await device.close()
    }
  })

  test('restaurar una copia lleva a «Listo» con los datos importados', async ({
    page,
    context,
    browser,
  }) => {
    const source = await browser.newContext({
      extraHTTPHeaders: { 'X-Test-User-Email': `onboarding-source-${randomUUID()}@e2e.test` },
    })
    try {
      await seedExistingData(source.request)
      const exported = await source.request.get('/api/data/export')
      expect(exported.ok()).toBe(true)
      const backup = await exported.body()
      await initialize(context.request)
      await openSetup(page)
      const imported = page.waitForResponse((response) =>
        response.url().includes('/api/data/import?mode=replace'),
      )
      const reloaded = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame())
      await setup(page)
        .getByLabel('Copia de seguridad')
        .setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: backup })
      expect((await imported).ok()).toBe(true)
      await reloaded
      await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
      await expect(title(page)).toHaveText('Listo')
      await expect(setup(page).getByText('1 cuenta')).toBeVisible()
      await next(page, 'Entendido')
      await expectSettings(context.request, { onboardingCompleted: 1 })
      const restored = await bootstrap(context.request)
      expect(restored.accounts).toHaveLength(1)
      expect(restored.transactions).toHaveLength(1)
    } finally {
      await source.close()
    }
  })
})
