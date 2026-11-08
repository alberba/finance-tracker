import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import type { FinanceSectionId } from './pages/FinanceTrackerPage'
import { DESIGN_COOKIE } from '../../src/lib/design'

/** No design cookie: the app shows its default, the new design (ADR 0010). */
const NO_COOKIE = { cookies: [], origins: [] }

const html = (page: Page) => page.locator('html')
const sidebar = (page: Page) => page.getByRole('complementary')
const designToggle = (page: Page) => sidebar(page).getByRole('group', { name: 'Diseño' })

const SECTION_IDS: FinanceSectionId[] = [
  'dashboard',
  'transactions',
  'budget',
  'wealth',
  'investment',
  'goals',
  'settings',
  'data',
]

test.describe('Diseño nuevo por defecto', () => {
  test.use({ storageState: NO_COOKIE })

  test('sin cookie se ve el diseño nuevo con su marco de escritorio', async ({ page, tracker }) => {
    await expect(html(page)).toHaveAttribute('data-ui', 'neon')

    await expect
      .poll(() => sidebar(page).evaluate((el) => el.getBoundingClientRect().width))
      .toBe(236)
    await expect(sidebar(page).getByText('finanzas.')).toBeVisible()
    await expect(page.locator('#sidebar-toggle')).toHaveCount(0)

    // Sections on top; Datos and Configuración at the bottom of the navigation.
    const nav = sidebar(page).getByRole('navigation', { name: 'Secciones del tracker' })
    await expect(nav.getByRole('button')).toHaveText([
      'Dashboard',
      'Movimientos',
      'Presupuesto',
      'Patrimonio',
      'Inversión',
      'Objetivos',
      'Datos',
      'Configuración',
    ])
    const [objectives, data] = await Promise.all([
      nav.getByRole('button', { name: 'Objetivos' }).boundingBox(),
      nav.getByRole('button', { name: 'Datos' }).boundingBox(),
    ])
    expect(data!.y - objectives!.y).toBeGreaterThan(100)
    expect(await tracker.dashboardSection.isVisible()).toBe(true)
  })

  test('pinta su tipografía autoalojada', async ({ page, tracker }) => {
    await tracker.reload()
    const fonts = await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('800 24px "Unbounded"'),
        document.fonts.load('700 16px "Manrope"'),
      ])
      const resources = performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name))
        .filter((url) => /\/fonts\/[^/]+\.woff2$/.test(url.pathname))
      return {
        unbounded: document.fonts.check('800 24px "Unbounded"'),
        manrope: document.fonts.check('700 16px "Manrope"'),
        local: resources.length > 0 && resources.every((url) => url.origin === location.origin),
        oldFaces: resources.filter((url) => /syne|dm-/.test(url.pathname)).length,
      }
    })

    expect(fonts).toEqual({ unbounded: true, manrope: true, local: true, oldFaces: 0 })
  })

  test('navega entre las ocho secciones, con atrás y adelante', async ({ page, tracker }) => {
    const current = () => sidebar(page).locator('[aria-current="page"]')

    for (const id of SECTION_IDS) await tracker.open(id)
    await expect(current()).toHaveAttribute('data-section', 'data')

    await page.goBack()
    await expect(current()).toHaveAttribute('data-section', 'settings')
    await expect(page.locator('#settings')).toBeVisible()
    await page.goBack()
    await expect(current()).toHaveAttribute('data-section', 'goals')
    await page.goForward()
    await expect(current()).toHaveAttribute('data-section', 'settings')
  })

  test('el toggle cambia de diseño y se conserva al recargar', async ({
    page,
    tracker,
    testUserEmail,
  }) => {
    await expect(designToggle(page).getByRole('button', { name: 'Diseño nuevo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await designToggle(page).getByRole('button', { name: 'Diseño antiguo' }).click()
    await expect(html(page)).toHaveAttribute('data-ui', 'legacy')
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
    // The old frame has its own toggle, and its own sidebar controls.
    await expect(page.locator('#sidebar-toggle')).toBeVisible()
    await expect(
      designToggle(page).getByRole('button', { name: 'Diseño antiguo' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await tracker.reload()
    await expect(html(page)).toHaveAttribute('data-ui', 'legacy')

    // The server already renders the chosen design: the first bytes carry it,
    // so the other one is never painted first.
    const cookies = await page.context().cookies()
    expect(cookies.find(({ name }) => name === DESIGN_COOKIE)?.value).toBe('legacy')
    const markup = await (
      await page.request.get('/', { headers: { 'X-Test-User-Email': testUserEmail } })
    ).text()
    expect(markup).toContain('<html lang="es" data-ui="legacy">')
    expect(markup).not.toContain('finanzas.')

    await designToggle(page).getByRole('button', { name: 'Diseño nuevo' }).click()
    await expect(html(page)).toHaveAttribute('data-ui', 'neon')
    await tracker.reload()
    await expect(html(page)).toHaveAttribute('data-ui', 'neon')
    await expect(sidebar(page).getByText('finanzas.')).toBeVisible()
    await tracker.open('dashboard')
  })
})
