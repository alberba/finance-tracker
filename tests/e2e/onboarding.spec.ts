import { randomUUID } from 'node:crypto'
import { test as base, expect, devices, type APIRequestContext, type Page } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

type Entity = { id: string; version: number; name: string }
type Bootstrap = {
  settings: Record<string, number>
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

const welcome = (page: Page) => page.getByRole('dialog', { name: 'Bienvenido a tus finanzas' })
const resume = (page: Page) => page.getByRole('button', { name: 'Retomar bienvenida' })

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

async function sync(request: APIRequestContext, commands: object[]) {
  const response = await request.post('/api/sync', { data: { commands } })
  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body.results.map((result: { status: string }) => result.status)).toEqual(
    commands.map(() => 'applied'),
  )
}

async function expectSettings(request: APIRequestContext, settings: Record<string, number>) {
  await expect.poll(async () => (await bootstrap(request)).settings).toMatchObject(settings)
}

async function openWelcome(page: Page) {
  const tracker = new FinanceTrackerPage(page, { preserveWelcome: true })
  await tracker.goto()
  await expect(welcome(page)).toBeVisible()
  return tracker
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

test.describe('Bienvenida (sync v2)', () => {
  for (const device of ['desktop', 'mobile'] as const) {
    test(`primer acceso ${device}: categorías iniciales y bienvenida omisible`, async ({
      page,
      context,
    }, testInfo) => {
      if (device === 'mobile') await page.setViewportSize(devices['Pixel 5'].viewport)
      const before = await bootstrap(context.request)
      expect(before.settings).toMatchObject({
        onboardingPresented: 0,
        onboardingDismissed: 0,
        onboardingAccountCompleted: 0,
        onboardingMovementCompleted: 0,
        onboardingCompleted: 0,
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
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await openWelcome(page)
      await expect(welcome(page).getByRole('button', { name: 'Crear cuenta' })).toBeEnabled()
      await expect(
        welcome(page).getByRole('button', { name: 'Registrar movimiento' }),
      ).toBeDisabled()
      await expect(
        welcome(page).getByText('Crea una cuenta para poder registrar movimientos.'),
      ).toBeVisible()
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await page.screenshot({
          path: testInfo.outputPath(`welcome-${device}-${theme}.png`),
          animations: 'disabled',
        })
      }
      await expectSettings(context.request, { onboardingPresented: 1, onboardingCompleted: 0 })
    })
  }

  test('Ahora no persiste tras recargar y en un dispositivo nuevo; permite retomarla', async ({
    page,
    context,
    browser,
    email,
  }) => {
    await initialize(context.request)
    const tracker = await openWelcome(page)
    await welcome(page).getByRole('button', { name: 'Ahora no' }).click()
    await expectSettings(context.request, {
      onboardingPresented: 1,
      onboardingDismissed: 1,
      onboardingCompleted: 0,
    })
    await expect(page.locator('#sidebar-sync-status')).toHaveText(/^Sincronizado ·/)
    await tracker.reload()
    await expect(welcome(page)).toBeHidden()
    await expect(resume(page)).toBeVisible()
    const device = await browser.newContext({
      ...devices['Pixel 5'],
      extraHTTPHeaders: { 'X-Test-User-Email': email },
    })
    try {
      const devicePage = await device.newPage()
      await new FinanceTrackerPage(devicePage, { preserveWelcome: true }).goto()
      await expect(welcome(devicePage)).toBeHidden()
      await resume(devicePage).click()
      await expect(welcome(devicePage)).toBeVisible()
      await expect(
        welcome(devicePage).getByRole('button', { name: 'Registrar movimiento' }),
      ).toBeDisabled()
    } finally {
      await device.close()
    }
  })

  test('Crear cuenta abre la ficha y el progreso permite registrar el primer movimiento', async ({
    page,
    context,
    browser,
    email,
  }) => {
    await initialize(context.request)
    const tracker = await openWelcome(page)
    await welcome(page).getByRole('button', { name: 'Crear cuenta' }).click()
    const account = page.getByRole('dialog', { name: 'Nueva cuenta', exact: true })
    await expect(account).toBeVisible()
    await account.getByLabel('Nombre').fill('Mi primera cuenta')
    await account.getByLabel('Saldo inicial (€)').fill('100')
    await account.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(account).toBeHidden()
    await expectSettings(context.request, {
      onboardingPresented: 1,
      onboardingDismissed: 1,
      onboardingAccountCompleted: 1,
      onboardingMovementCompleted: 0,
    })
    await expect(page.locator('#sidebar-sync-status')).toHaveText(/^Sincronizado ·/)
    await tracker.reload()
    await resume(page).click()
    await expect(welcome(page).getByText('✓ Cuenta creada')).toBeVisible()
    await expect(welcome(page).getByRole('button', { name: 'Registrar movimiento' })).toBeEnabled()
    const device = await browser.newContext({ extraHTTPHeaders: { 'X-Test-User-Email': email } })
    try {
      const devicePage = await device.newPage()
      await new FinanceTrackerPage(devicePage, { preserveWelcome: true }).goto()
      await resume(devicePage).click()
      await expect(welcome(devicePage).getByText('✓ Cuenta creada')).toBeVisible()
    } finally {
      await device.close()
    }
    await welcome(page).getByRole('button', { name: 'Registrar movimiento' }).click()
    const movement = tracker.transactionPanel
    await expect(movement).toBeVisible()
    await movement
      .getByRole('group', { name: 'Tipo de movimiento' })
      .getByRole('button', { name: 'Gasto', exact: true })
      .click()
    await movement.getByLabel('Fecha').fill('2026-10-01')
    await movement
      .getByLabel('Cuenta', { exact: true })
      .selectOption({ label: 'Mi primera cuenta' })
    await movement.getByLabel('Categoría').selectOption({ label: 'Alimentación' })
    await movement.getByLabel('Descripción').fill('Mi primer movimiento')
    await movement.getByLabel('Importe').fill('12')
    await movement.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expectSettings(context.request, {
      onboardingAccountCompleted: 1,
      onboardingMovementCompleted: 1,
      onboardingCompleted: 1,
    })
    await expect(page.locator('#sidebar-sync-status')).toHaveText(/^Sincronizado ·/)
    await tracker.reload()
    await expect(welcome(page)).toBeHidden()
    await expect(resume(page)).toHaveCount(0)
    expect((await bootstrap(context.request)).transactions).toHaveLength(1)
  })

  test('hitos previos muestran Entendido sin modificar categorías; borrar datos no reabre la guía', async ({
    page,
    context,
  }) => {
    await seedExistingData(context.request)
    const before = await bootstrap(context.request)
    await initialize(context.request)
    expect((await bootstrap(context.request)).categories).toEqual(before.categories)
    const tracker = await openWelcome(page)
    await expect(welcome(page).getByText('✓ Cuenta creada')).toBeVisible()
    await expect(welcome(page).getByText('✓ Movimiento registrado')).toBeVisible()
    await expect(welcome(page).getByRole('button', { name: 'Crear cuenta' })).toHaveCount(0)
    await expect(welcome(page).getByRole('button', { name: 'Registrar movimiento' })).toHaveCount(0)
    await expectSettings(context.request, {
      onboardingAccountCompleted: 1,
      onboardingMovementCompleted: 1,
      onboardingCompleted: 0,
    })
    await welcome(page).getByRole('button', { name: 'Entendido' }).click()
    await expectSettings(context.request, { onboardingCompleted: 1 })
    const data = await bootstrap(context.request)
    // Remove the referencing movement before its account, respecting D1 FKs.
    for (const [entityType, entities] of [
      ['transaction', data.transactions],
      ['account', data.accounts],
    ] as const) {
      await sync(
        context.request,
        entities.map((entity) => ({
          commandId: randomUUID(),
          action: 'remove',
          entityType,
          entityId: entity.id,
          baseVersion: entity.version,
        })),
      )
    }
    await expect(page.locator('#sidebar-sync-status')).toHaveText(/^Sincronizado ·/)
    await tracker.reload()
    await expect(welcome(page)).toBeHidden()
    await expect(resume(page)).toHaveCount(0)
    const after = await bootstrap(context.request)
    expect(after.accounts).toEqual([])
    expect(after.transactions).toEqual([])
    expect(after.settings).toMatchObject({
      onboardingCompleted: 1,
      onboardingAccountCompleted: 1,
      onboardingMovementCompleted: 1,
    })
  })

  test('importar una copia completa los hitos de una bienvenida omitida', async ({
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
      const tracker = await openWelcome(page)
      await welcome(page).getByRole('button', { name: 'Ahora no' }).click()
      await expectSettings(context.request, { onboardingDismissed: 1 })
      await expect(page.locator('#sidebar-sync-status')).toHaveText(/^Sincronizado ·/)
      await tracker.openData()
      await page
        .locator('#import-json')
        .setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: backup })
      const confirmation = page.getByRole('alertdialog', { name: '¿Importar esta copia?' })
      const imported = page.waitForResponse((response) =>
        response.url().includes('/api/data/import?mode=replace'),
      )
      const reloaded = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame())
      await confirmation.getByRole('button', { name: 'Sustituir mis datos' }).click()
      const importResponse = await imported
      expect(importResponse.ok()).toBe(true)
      await reloaded
      await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
      await expectSettings(context.request, {
        onboardingAccountCompleted: 1,
        onboardingMovementCompleted: 1,
        onboardingCompleted: 1,
      })
      await expect(page.locator('[data-welcome-state="complete"]')).toHaveCount(1)
      await expect(welcome(page)).toBeHidden()
      await expect(resume(page)).toHaveCount(0)
      const restored = await bootstrap(context.request)
      expect(restored.accounts).toHaveLength(1)
      expect(restored.transactions).toHaveLength(1)
    } finally {
      await source.close()
    }
  })
})
