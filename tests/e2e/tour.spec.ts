import { randomUUID } from 'node:crypto'
import { test as base, expect, devices, type APIRequestContext, type Page } from '@playwright/test'
import { test as seeded } from './fixtures'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

/**
 * Guided tour (#527): one per frame, after the setup wizard, marked on the
 * user (in the browser in the demo). Untouched users, as in onboarding.spec.
 */
const test = base.extend<{ email: string }>({
  email: async ({ browserName }, use) => {
    await use(`tour-${browserName}-${randomUUID()}@e2e.test`)
  },
  context: async ({ context, email }, use) => {
    await context.setExtraHTTPHeaders({ 'X-Test-User-Email': email })
    await use(context)
  },
})

const DESKTOP = [
  'Apuntar',
  'Editar el Dashboard',
  'Movimientos',
  'Presupuesto',
  'Patrimonio',
  'Inversión',
  'Objetivos',
  'Datos',
  'Configuración',
  'Reportar',
]
const MOBILE = ['Navegación', 'Apuntar', 'Por confirmar', 'Buscar', 'Más']

const bubble = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#tour-title') })
const tourState = (page: Page) => page.locator('[data-tour-state]')

async function initialize(request: APIRequestContext) {
  const response = await request.post('/api/state/initialize', { data: {} })
  expect(response.ok()).toBe(true)
}

async function settings(request: APIRequestContext) {
  const response = await request.get('/api/bootstrap')
  expect(response.ok()).toBe(true)
  return (await response.json()).settings as Record<string, unknown>
}

async function expectSettings(request: APIRequestContext, expected: Record<string, unknown>) {
  await expect.poll(() => settings(request)).toMatchObject(expected)
}

async function expectStep(page: Page, n: number, titles: string[]) {
  await expect(bubble(page)).toBeFocused()
  await expect(bubble(page).locator('[data-tour-count]')).toHaveText(`${n} de ${titles.length}`, {
    ignoreCase: true,
  })
  await expect(bubble(page).locator('#tour-title')).toHaveText(titles[n - 1])
}

/** A user who is already set up, so the wizard stays shut and only the tour is left. */
async function setUp(page: Page) {
  const response = await page.request.post('/api/sync', {
    headers: {
      'X-Finance-User-Id': (await (await page.request.get('/api/session')).json()).user.id,
    },
    data: {
      commands: [
        {
          commandId: randomUUID(),
          action: 'settingsUpdate',
          patch: { onboardingPresented: true, onboardingCompleted: true },
        },
      ],
    },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.describe('Recorrido guiado', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('sale al cerrar la puesta en marcha, una vez en escritorio y otra en el móvil', async ({
    page,
    context,
    browser,
    email,
  }) => {
    await initialize(context.request)
    await new FinanceTrackerPage(page, { preserveSetup: true, preserveTour: true }).goto()
    const setup = page.locator('dialog[data-setup]')
    await expect(setup).toBeVisible()
    await expect(tourState(page)).toHaveAttribute('data-tour-state', 'waiting')
    await setup.getByRole('button', { name: 'Ahora no' }).first().click()

    await expectStep(page, 1, DESKTOP)
    await expect(bubble(page).getByRole('button', { name: 'Atrás' })).toHaveCount(0)
    for (let n = 2; n <= DESKTOP.length; n++) {
      await page.keyboard.press('ArrowRight')
      await expectStep(page, n, DESKTOP)
    }
    await page.keyboard.press('ArrowLeft')
    await expectStep(page, 9, DESKTOP)
    await bubble(page).getByRole('button', { name: 'Siguiente' }).click()
    await bubble(page).getByRole('button', { name: 'Terminar' }).click()
    await expect(bubble(page)).toBeHidden()
    await expectSettings(context.request, { tourDesktopSeen: 1, tourMobileSeen: 0 })

    await new FinanceTrackerPage(page, { preserveTour: true }).reload()
    await expect(tourState(page)).toHaveAttribute('data-tour-state', 'idle')

    const phone = await browser.newContext({
      ...devices['Pixel 5'],
      extraHTTPHeaders: { 'X-Test-User-Email': email },
    })
    try {
      const phonePage = await phone.newPage()
      await phonePage.emulateMedia({ reducedMotion: 'reduce' })
      await new FinanceTrackerPage(phonePage, { preserveTour: true }).goto()
      await expectStep(phonePage, 1, MOBILE)
      for (let n = 2; n <= MOBILE.length; n++) {
        await bubble(phonePage).getByRole('button', { name: 'Siguiente' }).click()
        await expectStep(phonePage, n, MOBILE)
      }
      await phonePage.keyboard.press('Escape')
      await expect(bubble(phonePage)).toBeHidden()
      await expectSettings(context.request, { tourDesktopSeen: 1, tourMobileSeen: 1 })
    } finally {
      await phone.close()
    }
  })

  test('saltarlo cuenta como visto; recargar a mitad lo empieza de nuevo', async ({
    page,
    context,
  }) => {
    await initialize(context.request)
    await setUp(page)
    const tracker = new FinanceTrackerPage(page, { preserveTour: true })
    // Whoever is already set up gets it straight away, and it takes them to the Dashboard.
    await page.goto('/configuracion')
    await expectStep(page, 1, DESKTOP)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expectStep(page, 3, DESKTOP)
    // The focus stays in the bubble while the page is under the scrim.
    for (let n = 0; n < 4; n++) await page.keyboard.press('Tab')
    await expect(bubble(page).locator(':focus')).toHaveCount(1)

    await tracker.reload()
    await expectStep(page, 1, DESKTOP)
    expect(await settings(context.request)).toMatchObject({ tourDesktopSeen: 0 })

    await bubble(page).getByRole('button', { name: 'Saltar el recorrido' }).click()
    await expect(bubble(page)).toBeHidden()
    await expectSettings(context.request, { tourDesktopSeen: 1, tourMobileSeen: 0 })
    await tracker.reload()
    await expect(tourState(page)).toHaveAttribute('data-tour-state', 'idle')
  })

  test('en la demo aparece y se recuerda en el navegador, sin escribir en el servidor', async ({
    page,
  }) => {
    const writes: string[] = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (request.method() !== 'GET' && pathname.startsWith('/api/')) writes.push(pathname)
    })
    await page.goto('/demo')
    await expect(page.locator('html')).toHaveAttribute('data-demo', '1')
    await expectStep(page, 1, DESKTOP)
    await page.keyboard.press('Escape')
    await expect(bubble(page)).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('finance-tour-desktop-seen'))).toBe('1')
    await new FinanceTrackerPage(page, { preserveTour: true }).reload()
    await expect(tourState(page)).toHaveAttribute('data-tour-state', 'idle')
    expect(writes).toEqual([])
  })
})

seeded.describe('Recorrido guiado desde Preferencias', () => {
  seeded('lo repite solo para la plataforma actual', async ({ page, tracker, context }) => {
    await tracker.openSettings()
    const section = page.locator('#settings')
    await section
      .getByRole('navigation', { name: 'Índice de configuración' })
      .getByRole('link', { name: 'Preferencias' })
      .click()
    await section.getByRole('button', { name: 'Ver el recorrido otra vez' }).click()
    await expectStep(page, 1, DESKTOP)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.keyboard.press('Escape')
    await expect(bubble(page)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Ver el recorrido otra vez' })).toHaveCount(0)
    const response = await context.request.get('/api/bootstrap')
    expect((await response.json()).settings).toMatchObject({
      tourDesktopSeen: 1,
      tourMobileSeen: 1,
    })
  })
})
